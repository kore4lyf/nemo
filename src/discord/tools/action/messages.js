import { z } from "zod";
import {
  channelIdField,
  messageIdField,
  contentField,
} from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";

export const messageActions = [
  {
    name: "send_message",
    description: "Send a text message to a Discord channel by channelId.",
    schema: z.object({
      channelId: channelIdField,
      content: contentField(),
      embed: z.any().optional(),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("send_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const msg = await channel.send({
          content: String(input.content),
          embeds: input.embed ? [input.embed] : undefined,
        });
        return ok({ messageId: msg.id });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "pin_message",
    description: "Pin a message in a channel by channelId and messageId.",
    schema: z.object({
      channelId: channelIdField,
      messageId: messageIdField,
    }),
    async create(client, input) {
      const perm = getRequiredPermission("pin_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const message = await channel.messages.fetch(input.messageId);
        await message.pin();
        return ok();
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "unpin_message",
    description: "Remove a pin from a message by channelId and messageId.",
    schema: z.object({
      channelId: channelIdField,
      messageId: messageIdField,
    }),
    async create(client, input) {
      const perm = getRequiredPermission("unpin_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const message = await channel.messages.fetch(input.messageId);
        await message.unpin();
        return ok();
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "delete_message",
    description: "Delete a message by channelId and messageId.",
    schema: z.object({
      channelId: channelIdField,
      messageId: messageIdField,
    }),
    async create(client, input) {
      const perm = getRequiredPermission("delete_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const message = await channel.messages.fetch(input.messageId);
        await message.delete();
        return ok();
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "edit_message",
    description: "Edit a previously sent message.",
    schema: z.object({
      channelId: channelIdField,
      messageId: messageIdField,
      newContent: contentField(),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("edit_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const message = await channel.messages.fetch(input.messageId);
        await message.edit(String(input.newContent));
        return ok();
      } catch (err) {
        return fail(err);
      }
    },
  },
];
