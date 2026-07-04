import { z } from "zod";
import { ChannelType } from "discord.js";
import { channelIdField, messageIdField } from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";
import { logger } from "../../../config/logger.js";

const normalizeMessage = (msg) => ({
  id: msg.id,
  author: msg.author?.username ?? msg.author?.id ?? null,
  content: msg.content ?? "",
  createdAt: msg.createdTimestamp ?? Date.parse(msg.createdAt) ?? null,
  pinnedAt: msg.pinnedTimestamp
    ? msg.pinnedTimestamp
    : msg.pinnedAt
    ? Date.parse(msg.pinnedAt)
    : null,
});

export const messageContext = [
  {
    name: "get_pinned_messages",
    description:
      "Read all pinned messages in a channel. Use this to see what the team has agreed on or pinned for reference.",
    schema: z.object({ channelId: channelIdField }),
    async create(client, input) {
      const perm = getRequiredPermission("get_pinned_messages");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const pins = await channel.messages.fetchPins();
        return ok({
          pinned: pins.map(normalizeMessage),
        });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "get_recent_messages",
    description:
      "Read the most recent N messages in a channel, defaulting to 25. Use this to ground conversations in recent context before making decisions.",
    schema: z.object({
      channelId: channelIdField,
      limit: z.number().int().min(1).max(100).optional(),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("get_recent_messages");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const limit = input.limit ?? 25;
        const list = await channel.messages.fetch({ limit });
        return ok({
          messages: [...list.values()].map(normalizeMessage),
        });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "get_message",
    description: "Fetch a single message by id, useful for resolving references.",
    schema: z.object({
      channelId: channelIdField,
      messageId: messageIdField,
    }),
    async create(client, input) {
      const perm = getRequiredPermission("get_recent_messages");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const msg = await channel.messages.fetch(input.messageId);
        return ok({ message: normalizeMessage(msg) });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "search_messages",
    description:
      "Search recent messages in a channel by keyword and optional author ID. Returns only matching messages from the last 200 messages scanned.",
    schema: z.object({
      channelId: channelIdField,
      query: z.string().min(1).refine((v) => v.trim().length > 0),
      author: z.string().optional(),
    }),
    async create(client, input) {
      let noticeMessage = null;
      try {
        const channel = await client.channels.fetch(input.channelId);
        if (
          !channel ||
          ![
            ChannelType.GuildText,
            ChannelType.GuildVoice,
            ChannelType.GuildNews,
            ChannelType.GuildNewsThread,
            ChannelType.GuildPublicThread,
            ChannelType.GuildPrivateThread,
            ChannelType.GuildStageVoice,
            ChannelType.GuildForum,
          ].includes(channel.type)
        ) {
          return fail("Cannot search messages in this channel type.");
        }

        const missingView = !(await hasPermission({
          client,
          channelId: input.channelId,
          permissionName: "ViewChannel",
        }));
        const missingHistory = !(await hasPermission({
          client,
          channelId: input.channelId,
          permissionName: "ReadMessageHistory",
        }));
        if (missingView || missingHistory) {
          return fail("Missing permission: ViewChannel, ReadMessageHistory");
        }

        try {
          noticeMessage = await channel.send("Searching channel history…");
        } catch (sendErr) {
          logger.warn("search_messages notice send failed:", sendErr);
        }

        const allMatches = [];
        let totalScanned = 0;
        let truncated = false;
        const startedAt = Date.now();
        const query = String(input.query).toLowerCase();
        const authorFilter = input.author ? String(input.author).trim() : null;
        let cursor = undefined;
        let firstFetch = true;

        while (totalScanned < 200) {
          if (Date.now() - startedAt > 15000) {
            truncated = true;
            break;
          }

          const fetchArgs = { limit: 100 };
          if (cursor) fetchArgs.before = cursor;

          let page;
          try {
            page = await Promise.race([
              channel.messages.fetch(fetchArgs),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("search_messages fetch timed out")), 15000)
              ),
            ]);
          } catch (fetchErr) {
            logger.warn("search_messages fetch failed:", fetchErr);
            if (firstFetch) {
              return fail(fetchErr);
            }
            truncated = true;
            break;
          }

          firstFetch = false;
          const messages = [...page.values()];
          if (messages.length === 0) break;

          for (const msg of messages) {
            if (totalScanned >= 200) {
              truncated = true;
              break;
            }
            totalScanned += 1;

            if (msg.author?.bot) continue;

            if (authorFilter) {
              const matchesAuthor = msg.author?.id === authorFilter;
              if (!matchesAuthor) continue;
            }

            const content = String(msg.content ?? "").toLowerCase();
            if (!content.includes(query)) continue;

            allMatches.push({
              id: msg.id,
              author: msg.author?.username ?? msg.author?.id ?? null,
              authorId: msg.author?.id ?? null,
              content: msg.content ?? "",
              createdAt: msg.createdTimestamp ?? Date.parse(msg.createdAt) ?? null,
            });
          }

          if (truncated) break;
          if (messages.length === 0) break;
          if (totalScanned >= 200) {
            truncated = true;
            break;
          }
          cursor = messages[messages.length - 1].id;
        }

        return ok({
          matches: allMatches.reverse(),
          scanned: totalScanned,
          truncated,
        });
      } finally {
        if (noticeMessage) {
          try {
            await noticeMessage.delete();
          } catch (deleteErr) {
            logger.warn("search_messages notice delete failed:", deleteErr);
          }
        }
      }
    },
  },
];
