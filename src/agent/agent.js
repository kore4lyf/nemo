import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { extractContext } from "../discord/context.js";
import { LLM_DEFAULTS } from "../config/constants.js";
import { getSystemPrompt } from "../config/systemPrompt.js";
import { logger, scopedLogger } from "../config/logger.js";
import { buildAllTools } from "../discord/tools/index.js";

// Main entry point: process a Discord message through the ReAct agent
export async function processWithAgent({ client, message, requestId }) {
  const reqLog = requestId ? scopedLogger(requestId) : logger;
  // Build all Discord tools bound to a live client + triggering message
  // (message is threaded through so destructive tools can show confirmations)
  const tools = buildAllTools({ client, message });

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

  // System prompt = persistent AGENTS.md payload (persona, voice, rules,
  // project-manager behavior) + a small per-message Context block with the
  // channel / guild / message IDs the tools may need. AGENTS.md is the
  // only place persona + behavior live; this block is state, not persona.
  const systemMessage = new SystemMessage({
    content: [
      getSystemPrompt(),
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

  // Fetch recent conversation context (last 10 non-bot messages)
  const contextMessages = await fetchRecentContext(message);

  // ReAct loop: LLM decides tool calls → execute → feed results back
  const messages = [systemMessage, ...contextMessages, new HumanMessage(message.content)];
  const MAX_ITERATIONS = 6;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Call the LLM (with tools bound)
      const response = await llmWithTools.invoke(messages);
      messages.push(response);

      // If no tool calls, the model is done — return the final text
      if (!response.tool_calls || response.tool_calls.length === 0) {
        return response.content || "Done. Let me know if there's anything else you need.";
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
    reqLog.error("Agent error:", error);
    // Rethrow so the retry wrapper in onMessage.js can classify and retry
    // transient errors (429, 5xx, network). Permanent errors (4xx, content
    // moderation) will be caught by the outer catch in onMessage and
    // returned to the user as a failure message.
    throw error;
  }
}

// ── Conversation context ─────────────────────────────────────────────
// Fetches the last N messages from the channel to give Nemo short-term
// memory. Filters out bot messages and the triggering message itself.
const CONTEXT_MESSAGE_COUNT = 10;

async function fetchRecentContext(message) {
  try {
    if (!message.channel?.messages) return [];

    const fetched = await message.channel.messages.fetch({
      limit: CONTEXT_MESSAGE_COUNT + 5, // fetch extra to account for filtering
      before: message.id,
    });

    if (!fetched || fetched.size === 0) return [];

    // Filter: no bot messages, no empty content, newest first → reverse for chronological
    const recent = []
      .filter((msg) => !msg.author?.bot && msg.content?.trim())
      .slice(0, CONTEXT_MESSAGE_COUNT)
      .reverse(); // oldest first for LLM context

    return recent.map((msg) => {
      const author = msg.author?.username || "unknown";
      const isNemo = msg.author?.id === message.client?.user?.id;
      // Use AIMessage for Nemo's own messages, HumanMessage for others
      if (isNemo) {
        return new AIMessage(`[Nemo, earlier] ${msg.content}`);
      }
      return new HumanMessage(`[${author}] ${msg.content}`);
    });
  } catch (err) {
    // Non-fatal: context is nice-to-have, not required
    logger.debug(`Could not fetch conversation context: ${err.message}`);
    return [];
  }
}
