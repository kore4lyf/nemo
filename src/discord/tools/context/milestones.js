import { z } from "zod";
import { guildIdField } from "../shared/schemas.js";
import { ok, fail } from "../shared/response.js";
import { sweepChannelByName } from "../shared/sweep.js";
import { matchesAuthor, matchesQuery } from "../shared/filters.js";

const queryField = z.string().min(1);
const authorField = z.string().min(1);

export const milestoneContext = [
  {
    name: "get_milestones",
    description:
      "Fetch all milestone messages from the #milestones channel. Each message's content IS a milestone (human-typed: id, title, description, dates, status, owner, dependencies). With no filters, returns every message. Optional query filters by keyword on content; optional author filters by Discord user ID or username. Content is returned verbatim — the agent parses the fields, not the tool.",
    schema: z.object({
      guildId: guildIdField,
      query: queryField.optional(),
      author: authorField.optional(),
    }),
    async create(client, input) {
      const sweep = await sweepChannelByName({
        client,
        channelName: "milestones",
        guildId: input.guildId,
      });

      if (!sweep.ok) {
        return fail(sweep.error);
      }

      let filtered = sweep.messages;
      if (input.author) {
        filtered = filtered.filter((m) => matchesAuthor(m, input.author));
      }
      if (input.query) {
        filtered = filtered.filter((m) => matchesQuery(m, input.query));
      }

      return ok({ milestones: filtered, scanned: filtered.length });
    },
  },
];
