import "dotenv/config";
import "./config/env.js";
import { Client, GatewayIntentBits, Events } from "discord.js";
import retry from "async-retry";
import { processWithAgent } from "./agent/agent.js";

// ── Error classification (OpenCode/Kilo Code pattern) ──────────────
function isRetryable(err) {
  // Network-level errors
  if (
    err.code === "UND_ERR_CONNECT_TIMEOUT" ||
    err.code === "ENOTFOUND" ||
    err.code === "ECONNRESET" ||
    err.code === "ECONNREFUSED" ||
    err.code === "ETIMEDOUT" ||
    err.message?.includes("timeout")
  ) {
    return true;
  }

  // HTTP status codes
  const status = err.status || err.statusCode || err.response?.status;
  if (status) {
    if (status === 429 || status === 529) return true; // rate limit
    if (status >= 500) return true; // server errors
    if (status >= 400 && status < 500) return false; // client errors — don't retry
  }

  // Content moderation / safety — don't retry
  const msg = err.message?.toLowerCase() || "";
  if (msg.includes("content moderation") || msg.includes("safety") || msg.includes("blocked")) {
    return false;
  }

  return false;
}

// ── Retry wrapper ──────────────────────────────────────────────────
async function callAgent({ client, message }) {
  return retry(
    async (bail) => {
      try {
        return await processWithAgent({ client, message });
      } catch (err) {
        if (!isRetryable(err)) bail(err);
        throw err;
      }
    },
    {
      retries: 3,
      minTimeout: 2000,   // 2s base
      maxTimeout: 30_000, // 30s cap
      onRetry: (err, attempt) =>
        console.warn(`⚠️ Retry ${attempt}/3 — ${err.code || err.status || err.message}`),
    }
  );
}

// ── Bot setup ──────────────────────────────────────────────────────
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
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`✅ Logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(`⚠️ Shard ${shardId} disconnected (code: ${event.code}). Auto-reconnecting...`);
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    console.log(`🔄 Shard ${shardId} reconnecting...`);
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    console.log(`✅ Shard ${shardId} resumed (${replayedEvents} events replayed)`);
  });

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

// ── Entry point ────────────────────────────────────────────────────
main().catch((err) => {
  console.error("❌ Fatal:", err.message || err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled rejection (non-fatal):", err?.message || err);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception (non-fatal):", err.message);
});
