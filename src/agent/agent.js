import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { extractContext } from "../discord/context.js";
import { LLM_DEFAULTS } from "../config/constants.js";
import { getSystemPrompt } from "../config/systemPrompt.js";
import { logger } from "../config/logger.js";
import { buildAllTools } from "../discord/tools/index.js";

// Main entry point: process a Discord message through the ReAct agent
export async function processWithAgent({ client, message, dmResolvedGuild }) {
  // Build all Discord tools bound to a live client (action + context)
  const tools = buildAllTools({ client });

  // Initialize LLM and bind tools so the model can call them
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || LLM_DEFAULTS.BASE_URL,
    model: process.env.OPENAI_MODEL || LLM_DEFAULTS.MODEL,
    temperature: 0.1,
  });
  const llmWithTools = llm.bindTools(tools, { tool_choice: "auto" });

  // Extract Discord context (channel, message, author, mentions)
  const context = extractContext({ client, message, fallbackGuildId: dmResolvedGuild });

  // Fetch the last 20 messages from this channel so Nemo has conversation
  // awareness — who said what, what was decided, what was discussed.
  // This is the simplest memory: raw recent context, no indexing, no tools.
  let recentConversation = "";
  try {
    if (context.currentChannel?.id) {
      const channel = await client.channels.fetch(context.currentChannel.id);
      const recent = await channel.messages.fetch({ limit: 20 });
      recentConversation = [...recent.values()]
        .reverse()
        .map((m) => {
          const author = m.author?.username ?? m.author?.id ?? "unknown";
          const content = (m.content ?? "").slice(0, 500);
          return `  [${author}]: ${content}`;
        })
        .join("\n");
    }
  } catch (err) {
    // Non-fatal: if we can't fetch recent messages, continue without them.
    logger.warn("Could not fetch recent messages for context:", err.message);
  }

  // Tool-name lookup map for the ReAct loop
  const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

  // System prompt = persistent AGENTS.md payload (persona, voice, rules,
  // project-manager behavior) + a small per-message Context block with the
  // channel / guild / message IDs the tools may need. AGENTS.md is the
  // only place persona + behavior live; this block is state, not persona.
  const contextLines = [
    "Context:",
    `  Channel: ${context.currentChannel?.name ?? "unknown"} (${context.currentChannel?.id ?? "?"})`,
    `  Guild: ${context.currentChannel?.guildId ?? "?"}`,
    `  Current message ID: ${context.currentMessage?.id ?? "?"}`,
    `  Current message author: ${context.currentMessage?.author ?? "unknown"}`,
    `  Current message content: ${context.currentMessage?.content ?? ""}`,
    `  Mentioned users: ${context.mentionedUsers?.map((u) => `${u.name} (${u.id})`).join(", ") || "none"}`,
  ];

  if (recentConversation) {
    contextLines.push("");
    contextLines.push("  Recent conversation (last 20 messages):")
    contextLines.push(recentConversation);
  }

  const systemMessage = new SystemMessage({
    content: [getSystemPrompt(), "", contextLines.join("\n")].join("\n"),
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
    logger.error("Agent error:", error);
    return `Sorry, I hit an error while processing your request: ${error.message}`;
  }
}
