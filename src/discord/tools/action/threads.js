import { z } from "zod";
import { ChannelType } from "discord.js";
import {
  channelIdField,
  threadIdField,
  contentField,
} from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";

export const threadActions = [
  {
    name: "create_thread",
    description: "Create a thread in a channel.",
    schema: z.object({
      channelId: channelIdField,
      name: z.string().min(1),
      message: z.string().optional(),
      type: z.enum(["public", "private"]).optional(),
      autoArchiveDuration: z.number().optional(),
    }),
    async create(client, input) {
      const {
        channelId,
        name,
        message,
        type = "public",
        autoArchiveDuration,
      } = input;
      const perm = getRequiredPermission(
        type === "private"
          ? "create_thread_private"
          : "create_thread"
      );
      if (
        !(await hasPermission({ client, channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(channelId);
        const threadType =
          type === "private"
            ? ChannelType.PrivateThread
            : ChannelType.PublicThread;
        const thread = await channel.threads.create({
          name,
          type: threadType,
          autoArchiveDuration,
        });
        if (message) await thread.send(message);
        return ok({ threadId: thread.id });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "send_thread_message",
    description: "Send a message inside an existing thread.",
    schema: z.object({
      threadId: threadIdField,
      content: contentField(),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("send_thread_message");
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
        const msg = await thread.send(String(input.content));
        return ok({ messageId: msg.id });
      } catch (err) {
        return fail(err);
      }
    },
  },
];
