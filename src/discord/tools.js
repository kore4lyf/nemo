import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { hasPermission, getRequiredPermission } from "./permissions.js";

function successResponse(extra = {}) {
  return { success: true, ...extra };
}

function failureResponse(error) {
  return { success: false, error: String(error) };
}

export function sendMessage({ client }) {
  return tool(
    async (input) => {
      try {
        const channelId = input.channelId;
        const content = input.content;
        const embed = input.embed;

        if (!channelId || content === undefined || content === null) {
          return failureResponse("channelId and content are required.");
        }

        if (String(content).length > 2000) {
          return failureResponse("Message content exceeds 2000 character limit.");
        }

        const requiredPermission = getRequiredPermission("send_message");
        const ok = await hasPermission({ client, channelId, permissionName: requiredPermission });
        if (!ok) {
          return failureResponse(`Missing permission: ${requiredPermission}`);
        }

        const channel = await client.channels.fetch(channelId);
        const message = await channel.send({ content: String(content), embeds: embed ? [embed] : undefined });
        return successResponse({ messageId: message.id });
      } catch (error) {
        return failureResponse(error);
      }
    },
    {
      name: "send_message",
      description: "Send a text message to a Discord channel by channelId.",
      schema: z.object({
        channelId: z.string().min(1),
        content: z.string().min(1).max(2000),
        embed: z.any().optional(),
      }),
    }
  );
}

export function pinMessage({ client }) {
  return tool(
    async (input) => {
      try {
        const { channelId, messageId } = input;
        if (!channelId || !messageId) {
          return failureResponse("channelId and messageId are required.");
        }

        const requiredPermission = getRequiredPermission("pin_message");
        const ok = await hasPermission({ client, channelId, permissionName: requiredPermission });
        if (!ok) {
          return failureResponse(`Missing permission: ${requiredPermission}`);
        }

        const channel = await client.channels.fetch(channelId);
        const message = await channel.messages.fetch(messageId);
        await message.pin();
        return successResponse();
      } catch (error) {
        return failureResponse(error);
      }
    },
    {
      name: "pin_message",
      description: "Pin a message in a channel by channelId and messageId.",
      schema: z.object({
        channelId: z.string().min(1),
        messageId: z.string().min(1),
      }),
    }
  );
}

export function unpinMessage({ client }) {
  return tool(
    async (input) => {
      try {
        const { channelId, messageId } = input;
        if (!channelId || !messageId) {
          return failureResponse("channelId and messageId are required.");
        }

        const requiredPermission = getRequiredPermission("unpin_message");
        const ok = await hasPermission({ client, channelId, permissionName: requiredPermission });
        if (!ok) {
          return failureResponse(`Missing permission: ${requiredPermission}`);
        }

        const channel = await client.channels.fetch(channelId);
        const message = await channel.messages.fetch(messageId);
        await message.unpin();
        return successResponse();
      } catch (error) {
        return failureResponse(error);
      }
    },
    {
      name: "unpin_message",
      description: "Remove a pin from a message by channelId and messageId.",
      schema: z.object({
        channelId: z.string().min(1),
        messageId: z.string().min(1),
      }),
    }
  );
}

export function createThread({ client }) {
  return tool(
    async (input) => {
      try {
        const { channelId, name, message, type = "public", autoArchiveDuration } = input;
        if (!channelId || !name) {
          return failureResponse("channelId and name are required.");
        }

        const channel = await client.channels.fetch(channelId);
        const permission = type === "private" ? "CreatePrivateThreads" : "CreatePublicThreads";
        const hasPermissionResult = await hasPermission({ client, channelId, permissionName: permission });
        if (!hasPermissionResult) {
          return failureResponse(`Missing permission: ${permission}`);
        }

        // Import ChannelType enum
        const { ChannelType } = await import("discord.js");
        const threadType = type === "private" ? ChannelType.PrivateThread : ChannelType.PublicThread;

        // Create thread (no duplicate code anymore)
        const thread = await channel.threads.create({
          name,
          type: threadType,
          autoArchiveDuration,
        });

        // Send initial message if provided
        if (message) {
          await thread.send(message);
        }

        return successResponse({ threadId: thread.id });
      } catch (error) {
        return failureResponse(error);
      }
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
    }
  );
}

export function sendThreadMessage({ client }) {
  return tool(
    async (input) => {
      try {
        const { threadId, content } = input;
        if (!threadId || content === undefined || content === null) {
          return failureResponse("threadId and content are required.");
        }

        if (String(content).length > 2000) {
          return failureResponse("Message content exceeds 2000 character limit.");
        }

        const requiredPermission = getRequiredPermission("send_thread_message");
        const ok = await hasPermission({ client, channelId: threadId, permissionName: requiredPermission });
        if (!ok) {
          return failureResponse(`Missing permission: ${requiredPermission}`);
        }

        const thread = await client.channels.fetch(threadId);
        const message = await thread.send(String(content));
        return successResponse({ messageId: message.id });
      } catch (error) {
        return failureResponse(error);
      }
    },
    {
      name: "send_thread_message",
      description: "Send a message inside an existing thread.",
      schema: z.object({
        threadId: z.string().min(1),
        content: z.string().min(1).max(2000),
      }),
    }
  );
}

export function addReaction({ client }) {
  return tool(
    async (input) => {
      try {
        const { channelId, messageId, emoji } = input;
        if (!channelId || !messageId || !emoji) {
          return failureResponse("channelId, messageId, and emoji are required.");
        }

        const requiredPermission = getRequiredPermission("add_reaction");
        const ok = await hasPermission({ client, channelId, permissionName: requiredPermission });
        if (!ok) {
          return failureResponse(`Missing permission: ${requiredPermission}`);
        }

        const channel = await client.channels.fetch(channelId);
        const message = await channel.messages.fetch(messageId);
        await message.react(String(emoji));
        return successResponse();
      } catch (error) {
        return failureResponse(error);
      }
    },
    {
      name: "add_reaction",
      description: "Add an emoji reaction to a message.",
      schema: z.object({
        channelId: z.string().min(1),
        messageId: z.string().min(1),
        emoji: z.string().min(1),
      }),
    }
  );
}

export function deleteMessage({ client }) {
  return tool(
    async (input) => {
      try {
        const { channelId, messageId } = input;
        if (!channelId || !messageId) {
          return failureResponse("channelId and messageId are required.");
        }

        const requiredPermission = getRequiredPermission("delete_message");
        const ok = await hasPermission({ client, channelId, permissionName: requiredPermission });
        if (!ok) {
          return failureResponse(`Missing permission: ${requiredPermission}`);
        }

        const channel = await client.channels.fetch(channelId);
        const message = await channel.messages.fetch(messageId);
        await message.delete();
        return successResponse();
      } catch (error) {
        return failureResponse(error);
      }
    },
    {
      name: "delete_message",
      description: "Delete a message by channelId and messageId.",
      schema: z.object({
        channelId: z.string().min(1),
        messageId: z.string().min(1),
      }),
    }
  );
}

export function editMessage({ client }) {
  return tool(
    async (input) => {
      try {
        const { channelId, messageId, newContent } = input;
        if (!channelId || !messageId || newContent === undefined || newContent === null) {
          return failureResponse("channelId, messageId, and newContent are required.");
        }

        if (String(newContent).length > 2000) {
          return failureResponse("Message content exceeds 2000 character limit.");
        }

        const requiredPermission = getRequiredPermission("edit_message");
        const ok = await hasPermission({ client, channelId, permissionName: requiredPermission });
        if (!ok) {
          return failureResponse(`Missing permission: ${requiredPermission}`);
        }

        const channel = await client.channels.fetch(channelId);
        const message = await channel.messages.fetch(messageId);
        await message.edit(String(newContent));
        return successResponse();
      } catch (error) {
        return failureResponse(error);
      }
    },
    {
      name: "edit_message",
      description: "Edit a previously sent message.",
      schema: z.object({
        channelId: z.string().min(1),
        messageId: z.string().min(1),
        newContent: z.string().min(1).max(2000),
      }),
    }
  );
}

export function getChannelInfo({ client }) {
  return tool(
    async (input) => {
      try {
        const { channelId } = input;
        if (!channelId) {
          return failureResponse("channelId is required.");
        }

        const channel = await client.channels.fetch(channelId);
        return successResponse({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          isThread: !!channel.isThread(),
          memberCount: channel.memberCount ?? null,
          messageCount: channel.messages?.cache?.size ?? null,
        });
      } catch (error) {
        return failureResponse(error);
      }
    },
    {
      name: "get_channel_info",
      description: "Get metadata about a channel by channelId.",
      schema: z.object({
        channelId: z.string().min(1),
      }),
    }
  );
}

export function listThreads({ client }) {
  return tool(
    async (input) => {
      try {
        const { channelId, guildId } = input;
        if (!channelId && !guildId) {
          return failureResponse("channelId or guildId is required.");
        }

        if (channelId) {
          const channel = await client.channels.fetch(channelId);
          const threads = await channel.threads.fetchActive();
          const result = threads.threads.map((thread) => ({
            id: thread.id,
            name: thread.name,
            memberCount: thread.memberCount,
            messageCount: thread.messageCount,
          }));
          return successResponse({ threads: result });
        }

        const guild = await client.guilds.fetch(guildId);
        const threads = await guild.threads.fetchActive();
        const result = threads.threads.map((thread) => ({
          id: thread.id,
          name: thread.name,
          memberCount: thread.memberCount,
          messageCount: thread.messageCount,
        }));
        return successResponse({ threads: result });
      } catch (error) {
        return failureResponse(error);
      }
    },
    {
      name: "list_threads",
      description: "List active threads in a channel or guild.",
      schema: z.object({
        channelId: z.string().optional(),
        guildId: z.string().optional(),
      }),
    }
  );
}
