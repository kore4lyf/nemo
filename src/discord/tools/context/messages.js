import { z } from "zod";
import { channelIdField, messageIdField } from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";

const normalizeMessage = (msg) => ({
  id: msg.id,
  author: msg.author?.username ?? msg.author?.id ?? null,
  content: msg.content ?? "",
  // JavaScript timestamps are ms; Discord gives seconds sometimes — accept both.
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
      const perm = getRequiredPermission("get_message");
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
];
