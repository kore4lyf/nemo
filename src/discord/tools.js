import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { hasPermission, getRequiredPermission } from "./permissions.js";

// Shared response helpers
const ok = (extra = {}) => ({ success: true, ...extra });
const fail = (error) => ({ success: false, error: String(error) });

// Factory: wraps an action with permission check + channel fetch
function withChannel(client, channelId, toolName, action) {
  return async () => {
    const perm = getRequiredPermission(toolName);
    if (!(await hasPermission({ client, channelId, permissionName: perm }))) {
      return fail(`Missing permission: ${perm}`);
    }
    const channel = await client.channels.fetch(channelId);
    return action(channel);
  };
}

// Factory: wraps an action with channel + message fetch + permission check
function withMessage(client, channelId, messageId, toolName, action) {
  return async () => {
    const perm = getRequiredPermission(toolName);
    if (!(await hasPermission({ client, channelId, permissionName: perm }))) {
      return fail(`Missing permission: ${perm}`);
    }
    const channel = await client.channels.fetch(channelId);
    const message = await channel.messages.fetch(messageId);
    return action(channel, message);
  };
}

// Content length guard (used by send_message, send_thread_message, edit_message)
const contentField = (extra = {}) => z.string().min(1).max(2000).describe(extra.describe || "");

function guard2000(content) {
  if (String(content).length > 2000) return fail("Message content exceeds 2000 character limit.");
  return null;
}

// ── Tool definitions ───────────────────────────────────────────────
// Each tool: { name, description, schema, create(client) → async () => result }

const definitions = [
  {
    name: "send_message",
    description: "Send a text message to a Discord channel by channelId.",
    schema: z.object({
      channelId: z.string().min(1),
      content: contentField(),
      embed: z.any().optional(),
    }),
    create: (client) => async (input) => {
      const err = guard2000(input.content);
      if (err) return err;
      return withChannel(client, input.channelId, "send_message", async (ch) => {
        const msg = await ch.send({
          content: String(input.content),
          embeds: input.embed ? [input.embed] : undefined,
        });
        return ok({ messageId: msg.id });
      })();
    },
  },
  {
    name: "pin_message",
    description: "Pin a message in a channel by channelId and messageId.",
    schema: z.object({ channelId: z.string().min(1), messageId: z.string().min(1) }),
    create: (client) => async (input) =>
      withMessage(client, input.channelId, input.messageId, "pin_message", async (_ch, msg) => {
        await msg.pin();
        return ok();
      })(),
  },
  {
    name: "unpin_message",
    description: "Remove a pin from a message by channelId and messageId.",
    schema: z.object({ channelId: z.string().min(1), messageId: z.string().min(1) }),
    create: (client) => async (input) =>
      withMessage(client, input.channelId, input.messageId, "unpin_message", async (_ch, msg) => {
        await msg.unpin();
        return ok();
      })(),
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
    create: (client) => async (input) => {
      const { channelId, name, message, type = "public", autoArchiveDuration } = input;
      const perm = type === "private" ? "CreatePrivateThreads" : "CreatePublicThreads";
      if (!(await hasPermission({ client, channelId, permissionName: perm }))) {
        return fail(`Missing permission: ${perm}`);
      }
      const { ChannelType } = await import("discord.js");
      const channel = await client.channels.fetch(channelId);
      const threadType = type === "private" ? ChannelType.PrivateThread : ChannelType.PublicThread;
      const thread = await channel.threads.create({ name, type: threadType, autoArchiveDuration });
      if (message) await thread.send(message);
      return ok({ threadId: thread.id });
    },
  },
  {
    name: "send_thread_message",
    description: "Send a message inside an existing thread.",
    schema: z.object({ threadId: z.string().min(1), content: contentField() }),
    create: (client) => async (input) => {
      const err = guard2000(input.content);
      if (err) return err;
      const perm = getRequiredPermission("send_thread_message");
      if (!(await hasPermission({ client, channelId: input.threadId, permissionName: perm }))) {
        return fail(`Missing permission: ${perm}`);
      }
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
    create: (client) => async (input) =>
      withMessage(client, input.channelId, input.messageId, "add_reaction", async (_ch, msg) => {
        await msg.react(String(input.emoji));
        return ok();
      })(),
  },
  {
    name: "delete_message",
    description: "Delete a message by channelId and messageId.",
    schema: z.object({ channelId: z.string().min(1), messageId: z.string().min(1) }),
    create: (client) => async (input) =>
      withMessage(client, input.channelId, input.messageId, "delete_message", async (_ch, msg) => {
        await msg.delete();
        return ok();
      })(),
  },
  {
    name: "edit_message",
    description: "Edit a previously sent message.",
    schema: z.object({
      channelId: z.string().min(1),
      messageId: z.string().min(1),
      newContent: contentField(),
    }),
    create: (client) => async (input) => {
      const err = guard2000(input.newContent);
      if (err) return err;
      return withMessage(
        client,
        input.channelId,
        input.messageId,
        "edit_message",
        async (_ch, msg) => {
          await msg.edit(String(input.newContent));
          return ok();
        }
      )();
    },
  },
  {
    name: "get_channel_info",
    description: "Get metadata about a channel by channelId.",
    schema: z.object({ channelId: z.string().min(1) }),
    create: (client) => async (input) => {
      const perm = getRequiredPermission("get_channel_info");
      if (!(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))) {
        return fail(`Missing permission: ${perm}`);
      }
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
    schema: z.object({ channelId: z.string().optional(), guildId: z.string().optional() }),
    create: (client) => async (input) => {
      if (!input.channelId && !input.guildId) return fail("channelId or guildId is required.");

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
    },
  },
];

// ── Public API ─────────────────────────────────────────────────────
// Named exports for backward compat with tests/agent.js
export function sendMessage({ client }) {
  return tool(definitions[0].create(client), {
    name: definitions[0].name,
    description: definitions[0].description,
    schema: definitions[0].schema,
  });
}

export function pinMessage({ client }) {
  return tool(definitions[1].create(client), {
    name: definitions[1].name,
    description: definitions[1].description,
    schema: definitions[1].schema,
  });
}

export function unpinMessage({ client }) {
  return tool(definitions[2].create(client), {
    name: definitions[2].name,
    description: definitions[2].description,
    schema: definitions[2].schema,
  });
}

export function createThread({ client }) {
  return tool(definitions[3].create(client), {
    name: definitions[3].name,
    description: definitions[3].description,
    schema: definitions[3].schema,
  });
}

export function sendThreadMessage({ client }) {
  return tool(definitions[4].create(client), {
    name: definitions[4].name,
    description: definitions[4].description,
    schema: definitions[4].schema,
  });
}

export function addReaction({ client }) {
  return tool(definitions[5].create(client), {
    name: definitions[5].name,
    description: definitions[5].description,
    schema: definitions[5].schema,
  });
}

export function deleteMessage({ client }) {
  return tool(definitions[6].create(client), {
    name: definitions[6].name,
    description: definitions[6].description,
    schema: definitions[6].schema,
  });
}

export function editMessage({ client }) {
  return tool(definitions[7].create(client), {
    name: definitions[7].name,
    description: definitions[7].description,
    schema: definitions[7].schema,
  });
}

export function getChannelInfo({ client }) {
  return tool(definitions[8].create(client), {
    name: definitions[8].name,
    description: definitions[8].description,
    schema: definitions[8].schema,
  });
}

export function listThreads({ client }) {
  return tool(definitions[9].create(client), {
    name: definitions[9].name,
    description: definitions[9].description,
    schema: definitions[9].schema,
  });
}
