import { z, ZodError } from "zod";
import { guildIdField } from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";

function normalizeEvent(e) {
  return {
    id: e.id,
    name: e.name,
    description: e.description?.toString() ?? null,
    scheduledStartTime:
      e.scheduledStartTime instanceof Date ? e.scheduledStartTime.toISOString() : e.scheduledStart?.toISOString?.() ?? null,
    status: e.status,
    entityType: e.entityType ?? null,
    creatorId: e.creatorId ?? null,
  };
}

export const eventContext = [
  {
    name: "get_events",
    description:
      "List Discord scheduled events in a guild. Supports filtering by status: upcoming, past, or all.",
    schema: z.object({
      guildId: guildIdField,
      status: z.enum(["upcoming", "past", "all"]).optional().default("all"),
    }),
    async create(client, input) {
      try {
        const guild = await client.guilds.fetch(input.guildId);
        const perm = getRequiredPermission("get_events");
        const anyChannel = guild.channels?.cache?.first();
        if (anyChannel) {
          const ok2 = await hasPermission({
            client,
            channelId: anyChannel.id,
            permissionName: perm,
          });
          if (!ok2) return fail(`Missing permission: ${perm}`);
        }
        const events = await guild.scheduledEvents.fetch({ withUserCount: true });

        const all = [...events.values()].map(normalizeEvent);

        const upcoming = all.filter((e) =>
          ["SCHEDULED", "ACTIVE"].includes(e.status)
        );
        const past = all.filter((e) =>
          ["COMPLETED", "CANCELED"].includes(e.status)
        );

        const status = input.status ?? "all";

        let result;
        if (status === "upcoming") {
          result = {
            upcoming: upcoming.sort(
              (a, b) => new Date(a.scheduledStartTime) - new Date(b.scheduledStartTime)
            ),
            past: [],
          };
        } else if (status === "past") {
          result = {
            upcoming: [],
            past: past.sort(
              (a, b) => new Date(b.scheduledStartTime) - new Date(a.scheduledStartTime)
            ),
          };
        } else {
          result = {
            upcoming: upcoming.sort(
              (a, b) => new Date(a.scheduledStartTime) - new Date(b.scheduledStartTime)
            ),
            past: past.sort(
              (a, b) => new Date(b.scheduledStartTime) - new Date(a.scheduledStartTime)
            ),
          };
        }

        return ok(result);
      } catch (err) {
        if (err instanceof ZodError) return fail(err.message);
        return fail(err);
      }
    },
  },
];
