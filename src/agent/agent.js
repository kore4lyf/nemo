import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { extractContext } from "../discord/context.js";
import { LLM_DEFAULTS } from "../config/constants.js";
import { getSystemPrompt } from "../config/systemPrompt.js";
import { logger, scopedLogger } from "../config/logger.js";
import { getLogger } from "../config/log4js.js";
import { buildAllTools } from "../discord/tools/index.js";

const agentTrace = getLogger("agent");

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
    temperature: 0,
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

  // ── Agent trace ────────────────────────────────────────────────
  // Structured logging of every step: user message → tool calls → results → final output.
  // Written to logs/nemo-agent.log for offline analysis / improvement.
  const trace = {
    requestId,
    channel: context.currentChannel?.name ?? "unknown",
    guild: context.currentChannel?.guildId ?? "?",
    user: context.currentMessage?.author ?? "unknown",
    userMessage: message.content.slice(0, 2000),
    model: process.env.OPENAI_MODEL || LLM_DEFAULTS.MODEL,
    steps: [],
    finalOutput: null,
    error: null,
  };

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Call the LLM (with tools bound)
      const response = await llmWithTools.invoke(messages);
      messages.push(response);

      // If no tool calls, the model is done — return the final text
      if (!response.tool_calls || response.tool_calls.length === 0) {
        const output = response.content || "Done. Let me know if there's anything else you need.";
        trace.finalOutput = typeof output === "string" ? output.slice(0, 2000) : JSON.stringify(output).slice(0, 2000);
        agentTrace.info(JSON.stringify(trace));
        reqLog.info(`Agent done (${i + 1} iterations)`);
        return output;
      }

      // Log each tool call + result
      for (const call of response.tool_calls) {
        const fn = toolMap[call.name];
        if (!fn) {
          messages.push(
            new ToolMessage({
              content: JSON.stringify({ success: false, error: `Unknown tool: ${call.name}` }),
              tool_call_id: call.id,
            })
          );
          trace.steps.push({
            iteration: i,
            tool: call.name,
            args: call.args,
            success: false,
            error: `Unknown tool: ${call.name}`,
          });
          continue;
        }

        reqLog.info(`Tool[${i}]: ${call.name}(${JSON.stringify(call.args).slice(0, 500)})`);

        // Invoke the tool with the LLM's arguments
        const result = await fn.invoke(call.args);
        messages.push(
          new ToolMessage({
            content: JSON.stringify(result),
            tool_call_id: call.id,
          })
        );

        const isError = result && typeof result === "object" && (result.success === false || result.error);
        const resultSummary = isError
          ? { success: false, error: result.error || result.message || "unknown" }
          : { success: true, summary: truncateResult(result) };

        trace.steps.push({
          iteration: i,
          tool: call.name,
          args: call.args,
          ...resultSummary,
        });

        reqLog.info(`Tool[${i}] ${call.name}: ${resultSummary.success ? "OK" : "FAIL"}`);
      }
    }

    // Safety: if we exhausted iterations, ask the model for a summary
    const final = await llmWithTools.invoke([
      ...messages,
      new HumanMessage("Please summarise what you did so far."),
    ]);
    const output = final.content || "Done — iteration limit reached.";
    trace.finalOutput = typeof output === "string" ? output.slice(0, 2000) : JSON.stringify(output).slice(0, 2000);
    trace.exhausted = true;
    agentTrace.info(JSON.stringify(trace));
    reqLog.info(`Agent done (iteration limit)`);
    return output;
  } catch (error) {
    trace.error = error.message;
    agentTrace.info(JSON.stringify(trace));
    reqLog.error("Agent error:", error);
    // Rethrow so the retry wrapper in onMessage.js can classify and retry
    // transient errors (429, 5xx, network). Permanent errors (4xx, content
    // moderation) will be caught by the outer catch in onMessage and
    // returned to the user as a failure message.
    throw error;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

// Truncate a tool result to a compact summary suitable for log analysis.
function truncateResult(result, maxLen = 500) {
  if (!result) return String(result);
  if (typeof result !== "object") {
    const s = String(result);
    return s.length > maxLen ? s.slice(0, maxLen) + "..." : s;
  }

  // Arrays: summarise length, truncate first few items
  if (Array.isArray(result)) {
    if (result.length === 0) return "[]";
    const items = result.slice(0, 3).map((item) => truncateResult(item, 100));
    const rest = result.length > 3 ? `... (+${result.length - 3} more)` : "";
    return `[${items.join(", ")}${rest}]`;
  }

  // Objects: truncate each value
  const entries = Object.entries(result).slice(0, 12);
  const truncated = entries.map(([k, v]) => {
    if (v === null || v === undefined) return `${k}: null`;
    if (typeof v === "string") return `${k}: ${v.length > 120 ? v.slice(0, 120) + "..." : v}`;
    if (typeof v === "object") return `${k}: ${truncateResult(v, 80)}`;
    return `${k}: ${v}`;
  });
  const joined = truncated.join(", ");
  return joined.length > maxLen ? joined.slice(0, maxLen) + "..." : `{${joined}}`;
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
    const recent = [...fetched.values()]
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
