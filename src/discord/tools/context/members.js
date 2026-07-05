import { z } from "zod";
import { guildIdField } from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";

function normalize(m) {
  return {
    id: m.user.id,
    username: m.user.username,
    displayName: m.nickname ?? m.user.displayName ?? m.user.username,
    roles: m.roles.cache.map((r) => r.name),
  };
}

function normalizeWithStatus(m) {
  return {
    ...normalize(m),
    status: m.presence?.status ?? null,
  };
}

export const memberContext = [
  {
    name: "get_members",
    description:
      "List members of a guild. With no filters, returns every non-bot member (id, username, displayName, roles). Optional memberId returns a single member (and includes presence status). Optional query filters by username or displayName (case-insensitive substring). Bots are always excluded.",
    schema: z.object({
      guildId: guildIdField,
      memberId: z.string().min(1).optional(),
      query: z.string().min(1).optional(),
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

        if (input.memberId) {
          let m;
          try {
            m = await guild.members.fetch(input.memberId);
          } catch {
            return ok({ members: [], scanned: 0 });
          }
          if (m.user.bot) {
            return ok({ members: [], scanned: 0 });
          }
          return ok({
            members: [normalizeWithStatus(m)],
            scanned: 1,
          });
        }

        const list = await guild.members.fetch();
        let people = [...list.values()]
          .filter((m) => !m.user.bot)
          .map(normalize);

        if (input.query) {
          const q = input.query.toLowerCase();
          people = people.filter(
            (m) =>
              m.username.toLowerCase().includes(q) ||
              m.displayName.toLowerCase().includes(q)
          );
        }

        return ok({ members: people, scanned: people.length });
      } catch (err) {
        return fail(err);
      }
    },
  },
];
