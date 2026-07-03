import "dotenv/config";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { env } from "./config/env.js";
import { extractContext } from "./discord/context.js";
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
} from "./discord/tools.js";
import { processWithAgent } from "./agent/agent.js";

let availableTools = [];

function buildTools(client) {
  const toolFactories = [
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

  availableTools = toolFactories.map((t) => {
    if (typeof t?.invoke === "function") {
      return t;
    }

    const configured = typeof t === "function" ? t({ client }) : t;
    if (typeof configured?.invoke === "function") {
      return configured;
    }

    throw new Error(`Invalid tool object returned for tool: ${t?.name}`);
  });
}

function findTool(name) {
  return availableTools.find((t) => t.name === name) || null;
}

async function executeToolCall(client, toolName, rawArgs) {
  const tool = findTool(toolName);
  if (!tool) {
    return { success: false, error: `Tool not found: ${toolName}` };
  }

  try {
    const parsed = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    const result = await tool.invoke(parsed);
    return result || { success: false, error: "Tool returned no result." };
  } catch (error) {
    // Handle Zod validation errors (ToolInputParsingException)
    if (error?.name === 'ToolInputParsingException' || error?.constructor?.name === 'ToolInputParsingException') {
      // Extract clean error message from Zod error format
      const errorMsg = error.message || '';
      const cleanMsg = errorMsg.split('\n')[1]?.trim() || 'Invalid input: schema validation failed';
      return { success: false, error: `Invalid input: ${cleanMsg}` };
    }
    return { success: false, error: String(error) };
  }
}

async function processNaturalLanguage({ client, message }) {
  try {
    // Extract context for the agent
    const context = extractContext({ client, message });
    
    // Build tools with the current client
    buildTools(client);
    
    // Try to process with the agent
    const response = await processWithAgent({
      client,
      message,
      tools: availableTools
    });
    
    return response;
  } catch (error) {
    console.error("Natural language processing error:", error);
    return "Sorry, I couldn't process your request. Please try a simpler command or check if I have the necessary permissions.";
  }
}

async function main() {
  console.log("🤖 Nemo starting...");

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`✅ Logged in as ${readyClient.user.tag}`);
    buildTools(readyClient.client || readyClient);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    
    // Extract context for logging
    const context = extractContext({ client, message });
    // console.log("[context]", JSON.stringify(context)); // Debug: uncomment for development

    // Check if it's a command (starts with !)
    if (message.content.startsWith("!")) {
      const raw = message.content.slice(1).trim();
      const [toolName, ...rest] = raw.split(/\s+/);
      const argsRaw = rest.join(" ");

      // Execute tool call for commands
      const result = await executeToolCall(client, toolName, argsRaw);
      const reply = `🛠️ **${toolName}**\n` + "```json\n" + JSON.stringify(result, null, 2) + "\n```";
      await message.reply({ content: reply });
      return;
    }

    // For natural language messages, try to process with the agent
    try {
      const response = await processNaturalLanguage({ client, message });
      if (response && response.trim()) {
        await message.reply(response);
      }
    } catch (error) {
      console.error("Natural language processing failed:", error);
      // Don't reply to avoid spam, just log the error
    }
  });

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("❌ DISCORD_TOKEN not set");
    process.exit(1);
  }

  await client.login(token);
}

main().catch(console.error);