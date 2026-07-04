import { z } from "zod";
import {
  channelIdField,
  messageIdField,
} from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";

export const reactionActions = [
  {
    name: "add_reaction",
    description: "Add an emoji reaction to a message.",
    schema: z.object({
      channelId: channelIdField,
      messageId: messageIdField,
      emoji: z.string().min(1),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("add_reaction");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const message = await channel.messages.fetch(input.messageId);
        await message.react(String(input.emoji));
        return ok();
      } catch (err) {
        return fail(err);
      }
    },
  },
];
