import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
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
import { extractContext } from "../discord/context.js";

// Import all Discord tools and create a unified tools array
const discordTools = [
  sendMessage({ client: null }),
  pinMessage({ client: null }),
  unpinMessage({ client: null }),
  createThread({ client: null }),
  sendThreadMessage({ client: null }),
  addReaction({ client: null }),
  deleteMessage({ client: null }),
  editMessage({ client: null }),
  getChannelInfo({ client: null }),
  listThreads({ client: null }),
];

// Create a simple agent function that can call tools
export async function processWithAgent({ client, message, tools }) {
  // Initialize LLM with environment variables
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    temperature: 0.1,
  });

  // Extract context
  const context = extractContext({ client, message });
  
  // Create the system prompt with available tools
  const systemPrompt = `You are Nemo, an AI-powered project manager Discord bot. Help users manage their Discord server through natural conversation.

Available tools:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

When a user asks you to do something:
1. Extract the relevant information from the context (channelId, messageId, etc.)
2. Use the appropriate tool to accomplish the task
3. Respond with a friendly, helpful message about what you did
4. If something goes wrong, explain what happened and suggest alternatives

Always be polite, clear, and helpful. Focus on making the user's Discord experience better.

Context: ${JSON.stringify(context)}`;

  try {
    // Create messages for the LLM
    const messages = [
      new SystemMessage({ content: systemPrompt }),
      new HumanMessage({ content: message.content })
    ];

    // Get response from LLM
    const response = await llm.invoke(messages);
    return response.content;
  } catch (error) {
    console.error("Agent processing error:", error);
    return `Sorry, I encountered an error while processing your request: ${error.message}`;
  }
}

// Process a user message through the agent
export async function processMessage({ client, message }) {
  try {
    // Extract context from the message
    const context = extractContext({ client, message });
    
    // Create the agent with the current client
    const agent = createAgent({ client });
    
    // Create the human message with context
    const humanMessage = new HumanMessage({
      content: message.content,
      additionalKwargs: {
        context,
        author: message.author.username,
        channel: message.channel.name,
        guild: message.guild?.name,
      },
    });

    // Invoke the agent
    const response = await agent.invoke({
      messages: [humanMessage],
    });

    // Return the agent's response
    return response.messages[response.messages.length - 1].content;
  } catch (error) {
    console.error("Agent processing error:", error);
    return `Sorry, I encountered an error while processing your request: ${error.message}`;
  }
}

// Alternative: Simple tool executor for when we don't need the full agent
export async function executeToolCall({ client, message, toolName, args }) {
  try {
    // Extract context to get current channel info
    const context = extractContext({ client, message });
    
    // If no tool name is provided, just respond conversationally
    if (!toolName) {
      return "I'm here to help! You can ask me to pin messages, create threads, send messages, and more. What would you like to do?";
    }

    // Find the requested tool
    const tool = discordTools.find(t => t.name === toolName);
    if (!tool) {
      return `I don't have a "${toolName}" tool available. Try commands like: pin_message, create_thread, send_message, etc.`;
    }

    // Parse arguments if they're a string
    let parsedArgs = args;
    if (typeof args === "string") {
      try {
        parsedArgs = JSON.parse(args);
      } catch {
        // If JSON parsing fails, treat as simple content
        parsedArgs = { content: args };
      }
    }

    // Add context to arguments if not provided
    if (!parsedArgs.channelId && context.currentChannel?.id) {
      parsedArgs.channelId = context.currentChannel.id;
    }

    // Execute the tool
    const result = await tool.invoke(parsedArgs);
    
    // Return a friendly response based on the result
    if (result.success) {
      if (result.messageId) {
        return `✅ Done! Message sent with ID: ${result.messageId}`;
      } else if (result.threadId) {
        return `✅ Thread created successfully with ID: ${result.threadId}`;
      } else {
        return "✅ Action completed successfully!";
      }
    } else {
      return `❌ ${result.error}`;
    }
  } catch (error) {
    console.error("Tool execution error:", error);
    return `❌ Error: ${error.message}`;
  }
}