import { z } from "zod";
import { channelIdField, threadIdField, guildIdField } from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";

const fetchThreadMeta = async (target) => {
  const active = await target.threads.fetchActive();
  return [...active.threads.values()].map((t) => ({
    id: t.id,
    name: t.name,
    memberCount: t.memberCount,
    messageCount: t.messageCount,
  }));
};

export const threadContext = [
  {
    name: "get_active_threads",
    description:
      "List currently active threads in a channel or guild. Renamed alias of the old list_threads.",
    schema: z.object({
      channelId: channelIdField.optional(),
      guildId: guildIdField.optional(),
    }),
    async create(client, input) {
      if (input.channelId) {
        const perm = getRequiredPermission("list_threads");
        if (
          !(await hasPermission({
            client,
            channelId: input.channelId,
            permissionName: perm,
          }))
        )
          return fail(`Missing permission: ${perm}`);
      }
      try {
        const target = input.channelId
          ? await client.channels.fetch(input.channelId)
          : await client.guilds.fetch(input.guildId);
        const threads = await fetchThreadMeta(target);
        return ok({ threads });
      } catch (err) {
        return fail(err);
      }
    },
  },
  // Back-compat alias so older callers/tests using list_threads still import correctly.
  {
    name: "list_threads",
    description: "Alias for get_active_threads (back-compat).",
    schema: z.object({
      channelId: channelIdField.optional(),
      guildId: guildIdField.optional(),
    }),
    async create(client, input) {
      const sorted = {
        channelId: input.channelId,
        guildId: input.guildId,
      };
      if (!sorted.channelId && !sorted.guildId)
        return fail("channelId or guildId is required.");

      if (sorted.channelId) {
        const perm = getRequiredPermission("list_threads");
        if (
          !(await hasPermission({
            client,
            channelId: sorted.channelId,
            permissionName: perm,
          }))
        )
          return fail(`Missing permission: ${perm}`);
      }
      try {
        const target = sorted.channelId
          ? await client.channels.fetch(sorted.channelId)
          : await client.guilds.fetch(sorted.guildId);
        const threads = await fetchThreadMeta(target);
        return ok({ threads });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "get_thread_history",
    description:
      "Read recent messages in a thread. Threads in Discord don't auto-show full history, so use this to recover past discussion.",
    schema: z.object({
      threadId: threadIdField,
      limit: z.number().int().min(1).max(100).optional(),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("get_recent_messages");
      if (
        !(await hasPermission({
          client,
          channelId: input.threadId,
          permissionName: perm,
        }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const thread = await client.channels.fetch(input.threadId);
        const limit = input.limit ?? 50;
        const list = await thread.messages.fetch({ limit });
        return ok({
          messages: [...list.values()].map((m) => ({
            id: m.id,
            author: m.author?.username ?? m.author?.id ?? null,
            content: m.content ?? "",
            createdAt:
              m.createdTimestamp ?? Date.parse(m.createdAt) ?? null,
          })),
        });
      } catch (err) {
        return fail(err);
      }
    },
  },
];
