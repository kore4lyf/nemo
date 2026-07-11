import { z } from "zod";
import { guildIdField } from "../shared/schemas.js";
import { ok, fail } from "../shared/response.js";
import { sweepChannelByName } from "../shared/sweep.js";

const queryField = z.string().min(1);
const authorField = z.string().min(1);

function matchesAuthor(message, author) {
  if (!author) return true;
  const snowflake = /^\d{17,20}$/.test(author);
  if (snowflake) {
    return message.authorId === author;
  }
  return typeof message.author === "string"
    ? message.author.toLowerCase() === author.toLowerCase()
    : false;
}

function matchesQuery(message, query) {
  if (!query) return true;
  const content = (message.content || "").toLowerCase();
  return content.includes(query.toLowerCase());
}

export const introductionContext = [
  {
    name: "get_introduction",
    description:
      "Fetch introduction messages from the #introduction channel. Each message is one member's self-introduction (human-typed: name, role, bio). With no filters, returns every message. Optional query / author filters as in get_milestones. Content returned verbatim.",
    schema: z.object({
      guildId: guildIdField,
      query: queryField.optional(),
      author: authorField.optional(),
    }),
    async create(client, input) {
      const sweep = await sweepChannelByName({
        client,
        channelName: "introduction",
        guildId: input.guildId,
        toolName: "get_introduction",
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

      return ok({ introductions: filtered, scanned: sweep.messages.length });
    },
  },
];
