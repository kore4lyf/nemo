import { z } from "zod";
import { guildIdField, channelIdField } from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";

export const channelContext = [
  {
    name: "get_channels",
    description:
      "List channels in a guild. Reads name, type, and parent (category). Useful for letting the agent see the server layout.",
    schema: z.object({ guildId: guildIdField }),
    async create(client, input) {
      try {
        const guild = await client.guilds.fetch(input.guildId);
        const perm = getRequiredPermission("get_channels");
        // Try the first channel as permission probe; Cache-only guild info is fine because we already have guildId.
        const first = [...guild.channels.cache.values()][0];
        if (first) {
          const ok2 = await hasPermission({
            client,
            channelId: first.id,
            permissionName: perm,
          });
          if (!ok2) return fail(`Missing permission: ${perm}`);
        }
        const channels = [...guild.channels.cache.values()].map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          parentId: c.parentId ?? null,
        }));
        return ok({ channels });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "get_channel_info",
    description: "Get metadata about a channel by channelId.",
    schema: z.object({ channelId: channelIdField }),
    async create(client, input) {
      const perm = getRequiredPermission("get_channel_info");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const ch = await client.channels.fetch(input.channelId);
        return ok({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          isThread: !!ch.isThread(),
          memberCount: ch.memberCount ?? null,
          messageCount: ch.messages?.cache?.size ?? null,
        });
      } catch (err) {
        return fail(err);
      }
    },
  },
];
