import "dotenv/config";
import "./config/env.js";
import { Client, GatewayIntentBits, Events } from "discord.js";
import retry from "async-retry";
import { processWithAgent } from "./agent/agent.js";

async function callAgent({ client, message }) {
  return retry(
    async (bail) => {
      try {
        return await processWithAgent({ client, message });
      } catch (err) {
        // Don't retry on non-network errors (bad input, LLM errors, etc.)
        const isNetworkError =
          err.code === "UND_ERR_CONNECT_TIMEOUT" ||
          err.code === "ENOTFOUND" ||
          err.code === "ECONNRESET" ||
          err.message?.includes("timeout");

        if (!isNetworkError) bail(err);
        throw err;
      }
    },
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 5000,
      onRetry: (err, attempt) =>
        console.warn(`⚠️ Retry ${attempt}: ${err.code || err.message}`),
    }
  );
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
    rest: { timeout: 30_000 },
    // Auto-reconnect: discord.js does this by default, but let's be explicit
    failIfChannelNotGuaranteed: false,
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`✅ Logged in as ${readyClient.user.tag}`);
  });

  // Reconnection logging — never crash on these
  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(`⚠️ Shard ${shardId} disconnected (code: ${event.code}). Auto-reconnecting...`);
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    console.log(`🔄 Shard ${shardId} reconnecting...`);
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    console.log(`✅ Shard ${shardId} resumed (${replayedEvents} events replayed)`);
  });

  // Catch-all: log but never crash
  client.on(Events.Error, (error) => {
    console.error("❌ Client error (non-fatal):", error.message);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    try {
      const response = await callAgent({ client, message });
      if (response?.trim()) {
        await message.reply(response);
      }
    } catch (error) {
      console.error("Agent failed:", error.message || error);
      await message.reply("Something went wrong — try again in a moment.").catch(() => {});
    }
  });

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("❌ DISCORD_TOKEN not set");
    process.exit(1);
  }

  await client.login(token);
}

main().catch((err) => {
  console.error("❌ Fatal:", err.message || err);
  process.exit(1);
});

// Never crash on unhandled errors — keep the bot alive
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled rejection (non-fatal):", err?.message || err);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception (non-fatal):", err.message);
});
