import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { extractContext } from "../discord/context.js";
import { LLM_DEFAULTS } from "../config/constants.js";
import { logger } from "../config/logger.js";
import {
  sendMessage,
  pinMessage,
  unpinMessage,
  createThread,
  sendThreadMessage,
  addReaction,
  deleteMessage,
  editMessage,
  getChannelInfo,
  listThreads,
} from "../discord/tools.js";

// Build all Discord tools bound to a live client
function buildDiscordTools(client) {
  return [
    sendMessage({ client }),
    pinMessage({ client }),
    unpinMessage({ client }),
    createThread({ client }),
    sendThreadMessage({ client }),
    addReaction({ client }),
    deleteMessage({ client }),
    editMessage({ client }),
    getChannelInfo({ client }),
    listThreads({ client }),
  ];
}

// Main entry point: process a Discord message through the ReAct agent
export async function processWithAgent({ client, message }) {
  // Build tools bound to THIS client instance
  const tools = buildDiscordTools(client);

  // Initialize LLM and bind tools so the model can call them
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || LLM_DEFAULTS.BASE_URL,
    model: process.env.OPENAI_MODEL || LLM_DEFAULTS.MODEL,
    temperature: 0.1,
  });
  const llmWithTools = llm.bindTools(tools);

  // Extract Discord context (channel, message, author, mentions)
  const context = extractContext({ client, message });

  // Tool-name lookup map for the ReAct loop
  const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

  // System prompt — includes context so the LLM knows channel/message IDs
  const systemMessage = new SystemMessage({
    content: [
      "You are Nemo, an AI-powered project manager Discord bot.",
      "Help users manage their Discord server through natural conversation.",
      "You have access to Discord tools. Use them when the user asks you to do something.",
      "After executing a tool, tell the user what happened in a short, friendly message.",
      "If you don't need a tool, just reply normally.",
      "",
      "Context:",
      `  Channel: ${context.currentChannel?.name ?? "unknown"} (${context.currentChannel?.id ?? "?"})`,
      `  Guild: ${context.currentChannel?.guildId ?? "?"}`,
      `  Current message ID: ${context.currentMessage?.id ?? "?"}`,
      `  Current message author: ${context.currentMessage?.author ?? "unknown"}`,
      `  Current message content: ${context.currentMessage?.content ?? ""}`,
      `  Mentioned users: ${context.mentionedUsers?.map((u) => `${u.name} (${u.id})`).join(", ") || "none"}`,
    ].join("\n"),
  });

  // ReAct loop: LLM decides tool calls → execute → feed results back
  const messages = [systemMessage, new HumanMessage(message.content)];
  const MAX_ITERATIONS = 6;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Call the LLM (with tools bound)
      const response = await llmWithTools.invoke(messages);
      messages.push(response);

      // If no tool calls, the model is done — return the final text
      if (!response.tool_calls || response.tool_calls.length === 0) {
        return response.content || "Done — no text response from the model.";
      }

      // Execute every tool call the model requested
      for (const call of response.tool_calls) {
        const fn = toolMap[call.name];
        if (!fn) {
          messages.push(
            new ToolMessage({
              content: JSON.stringify({ success: false, error: `Unknown tool: ${call.name}` }),
              tool_call_id: call.id,
            })
          );
          continue;
        }

        // Invoke the tool with the LLM's arguments
        const result = await fn.invoke(call.args);
        messages.push(
          new ToolMessage({
            content: JSON.stringify(result),
            tool_call_id: call.id,
          })
        );
      }
    }

    // Safety: if we exhausted iterations, ask the model for a summary
    const final = await llmWithTools.invoke([
      ...messages,
      new HumanMessage("Please summarise what you did so far."),
    ]);
    return final.content || "Done — iteration limit reached.";
  } catch (error) {
    logger.error("Agent error:", error);
    return `Sorry, I hit an error while processing your request: ${error.message}`;
  }
}
