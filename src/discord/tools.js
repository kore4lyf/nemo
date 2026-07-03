import { tool } from "@langchain/core/tools";
import { ChannelType } from "discord.js";
import { z } from "zod";
import { hasPermission, getRequiredPermission } from "./permissions.js";

// Shared response helpers
const ok = (extra = {}) => ({ success: true, ...extra });
const fail = (error) => ({ success: false, error: String(error) });

// Content length guard — Zod schema handles max(2000); this field helper is the single source.
const contentField = (extra = {}) =>
  z.string().min(1).max(2000).describe(extra.describe || "");

// ── Tool definitions ───────────────────────────────────────────────
// Each tool: { name, description, schema, create(client, input) → result }

const definitions = [
  {
    name: "send_message",
    description: "Send a text message to a Discord channel by channelId.",
    schema: z.object({
      channelId: z.string().min(1),
      content: contentField(),
      embed: z.any().optional(),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("send_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      const channel = await client.channels.fetch(input.channelId);
      const msg = await channel.send({
        content: String(input.content),
        embeds: input.embed ? [input.embed] : undefined,
      });
      return ok({ messageId: msg.id });
    },
  },
  {
    name: "pin_message",
    description: "Pin a message in a channel by channelId and messageId.",
    schema: z.object({
      channelId: z.string().min(1),
      messageId: z.string().min(1),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("pin_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      const channel = await client.channels.fetch(input.channelId);
      const message = await channel.messages.fetch(input.messageId);
      await message.pin();
      return ok();
    },
  },
  {
    name: "unpin_message",
    description: "Remove a pin from a message by channelId and messageId.",
    schema: z.object({
      channelId: z.string().min(1),
      messageId: z.string().min(1),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("unpin_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      const channel = await client.channels.fetch(input.channelId);
      const message = await channel.messages.fetch(input.messageId);
      await message.unpin();
      return ok();
    },
  },
  {
    name: "create_thread",
    description: "Create a thread in a channel.",
    schema: z.object({
      channelId: z.string().min(1),
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
      const perm =
        type === "private"
          ? "CreatePrivateThreads"
          : "CreatePublicThreads";
      if (
        !(await hasPermission({ client, channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
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
    },
  },
  {
    name: "send_thread_message",
    description: "Send a message inside an existing thread.",
    schema: z.object({
      threadId: z.string().min(1),
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
      const thread = await client.channels.fetch(input.threadId);
      const msg = await thread.send(String(input.content));
      return ok({ messageId: msg.id });
    },
  },
  {
    name: "add_reaction",
    description: "Add an emoji reaction to a message.",
    schema: z.object({
      channelId: z.string().min(1),
      messageId: z.string().min(1),
      emoji: z.string().min(1),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("add_reaction");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      const channel = await client.channels.fetch(input.channelId);
      const message = await channel.messages.fetch(input.messageId);
      await message.react(String(input.emoji));
      return ok();
    },
  },
  {
    name: "delete_message",
    description: "Delete a message by channelId and messageId.",
    schema: z.object({
      channelId: z.string().min(1),
      messageId: z.string().min(1),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("delete_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      const channel = await client.channels.fetch(input.channelId);
      const message = await channel.messages.fetch(input.messageId);
      await message.delete();
      return ok();
    },
  },
  {
    name: "edit_message",
    description: "Edit a previously sent message.",
    schema: z.object({
      channelId: z.string().min(1),
      messageId: z.string().min(1),
      newContent: contentField(),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("edit_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      const channel = await client.channels.fetch(input.channelId);
      const message = await channel.messages.fetch(input.messageId);
      await message.edit(String(input.newContent));
      return ok();
    },
  },
  {
    name: "get_channel_info",
    description: "Get metadata about a channel by channelId.",
    schema: z.object({ channelId: z.string().min(1) }),
    async create(client, input) {
      const perm = getRequiredPermission("get_channel_info");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      const ch = await client.channels.fetch(input.channelId);
      return ok({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        isThread: !!ch.isThread(),
        memberCount: ch.memberCount ?? null,
        messageCount: ch.messages?.cache?.size ?? null,
      });
    },
  },
  {
    name: "list_threads",
    description: "List active threads in a channel or guild.",
    schema: z.object({
      channelId: z.string().optional(),
      guildId: z.string().optional(),
    }),
    async create(client, input) {
      if (!input.channelId && !input.guildId)
        return fail("channelId or guildId is required.");
      // Permission check — use channelId if provided, else skip for guild-level
      if (input.channelId) {
        const perm = getRequiredPermission("list_threads");
        if (
          !(await hasPermission({
            client,
            channelId: input.channelId,
            permissionName: perm,
          }))
        )
          return fail(`Missing permission: ${perm}`);
      }
      try {
        const target = input.channelId
          ? await client.channels.fetch(input.channelId)
          : await client.guilds.fetch(input.guildId);
        const threads = await target.threads.fetchActive();
        return ok({
          threads: threads.threads.map((t) => ({
            id: t.id,
            name: t.name,
            memberCount: t.memberCount,
            messageCount: t.messageCount,
          })),
        });
      } catch (err) {
        return fail(err);
      }
    },
  },
];

// ── Generic factory ────────────────────────────────────────────────
// Single function replaces 10 copy-paste wrappers.

function makeTool(def) {
  return ({ client }) =>
    tool((input) => def.create(client, input), {
      name: def.name,
      description: def.description,
      schema: def.schema,
    });
}

// Named exports (same names, same interface — no caller changes)
export const sendMessage = makeTool(definitions[0]);
export const pinMessage = makeTool(definitions[1]);
export const unpinMessage = makeTool(definitions[2]);
export const createThread = makeTool(definitions[3]);
export const sendThreadMessage = makeTool(definitions[4]);
export const addReaction = makeTool(definitions[5]);
export const deleteMessage = makeTool(definitions[6]);
export const editMessage = makeTool(definitions[7]);
export const getChannelInfo = makeTool(definitions[8]);
export const listThreads = makeTool(definitions[9]);
