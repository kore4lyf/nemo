import { z } from "zod";
import { guildIdField } from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";

export const serverContext = [
  {
    name: "get_server_state",
    description:
      "Composite snapshot of the server: memberCount, channelCount, activeThreadCount, pinnedCount. Use as a quick overview before drilling in.",
    schema: z.object({ guildId: guildIdField }),
    async create(client, input) {
      try {
        const guild = await client.guilds.fetch(input.guildId);
        const perm = getRequiredPermission("get_server_state");
        const firstChannel = [...guild.channels.cache.values()][0];
        if (firstChannel) {
          const ok2 = await hasPermission({
            client,
            channelId: firstChannel.id,
            permissionName: perm,
          });
          if (!ok2) return fail(`Missing permission: ${perm}`);
        }

        const textChannels = [...guild.channels.cache.values()]
          .filter((ch) => ch.isTextBased?.() && ch.messages?.fetchPins);
        const pinResults = await Promise.all(
          textChannels.map((ch) => ch.messages.fetchPins().catch(() => null))
        );
        let pinned = 0;
        for (const result of pinResults) {
          if (result) pinned += result.size;
        }

        const activeThreads = await guild.channels.fetchActiveThreads().catch(() => null);
        const activeThreadCount = activeThreads ? activeThreads.threads.size : 0;

        return ok({
          memberCount: guild.memberCount ?? null,
          channelCount: guild.channels.cache.size,
          activeThreadCount,
          pinnedCount: pinned,
        });
      } catch (err) {
        return fail(err);
      }
    },
  },
];
