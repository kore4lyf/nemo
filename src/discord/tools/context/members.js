import { z } from "zod";
import { guildIdField, channelIdField } from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";

export const memberContext = [
  {
    name: "get_members",
    description:
      "List visible members of a guild. Excludes bots. Use this to see who is on the team before assigning work.",
    schema: z.object({ guildId: guildIdField }),
    async create(client, input) {
      const perm = getRequiredPermission("get_members");
      // pick first channel of the guild to satisfy the permission gate
      try {
        const guild = await client.guilds.fetch(input.guildId);
        const anyChannel = guild.channels?.cache?.first();
        if (anyChannel) {
          const ok2 = await hasPermission({
            client,
            channelId: anyChannel.id,
            permissionName: perm,
          });
          if (!ok2) return fail(`Missing permission: ${perm}`);
        }
        const list = await guild.members.fetch();
        const people = [...list.values()]
          .filter((m) => !m.user.bot)
          .map((m) => ({
            id: m.user.id,
            username: m.user.username,
            displayName: m.nickname ?? m.user.displayName ?? m.user.username,
            roles: [...m.roles.cache.keys()],
          }));
        return ok({ members: people });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "get_member",
    description:
      "Fetch a single guild member by id, including roles and presence status.",
    schema: z.object({
      guildId: guildIdField,
      memberId: z.string().min(1),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("get_members");
      try {
        const guild = await client.guilds.fetch(input.guildId);
        const anyChannel = guild.channels?.cache?.first();
        if (anyChannel) {
          const ok2 = await hasPermission({
            client,
            channelId: anyChannel.id,
            permissionName: perm,
          });
          if (!ok2) return fail(`Missing permission: ${perm}`);
        }
        const m = await guild.members.fetch(input.memberId);
        return ok({
          id: m.user.id,
          username: m.user.username,
          displayName: m.nickname ?? m.user.displayName ?? m.user.username,
          roles: [...m.roles.cache.keys()],
          status: m.presence?.status ?? null,
        });
      } catch (err) {
        return fail(err);
      }
    },
  },
];

// keep `hasPermission` referenced so linters don't strip the import on unused branches
export const _ref = hasPermission;
