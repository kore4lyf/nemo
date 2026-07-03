import "dotenv/config";
import "./config/env.js";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { processWithAgent } from "./agent/agent.js";

// ── Retry config (OpenCode/Kilo Code pattern) ──────────────────────
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30_000;
const JITTER_MS = 500;

// ── Error classification ───────────────────────────────────────────
function isRetryable(err) {
  // Network-level errors — always retry
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
    // Rate limit — retry (respect Retry-After header)
    if (status === 429 || status === 529) return true;
    // Server errors — retry
    if (status >= 500) return true;
    // Client errors — don't retry (bad request, auth, forbidden)
    if (status >= 400 && status < 500) return false;
  }

  // Content moderation / safety blocks — don't retry
  const msg = err.message?.toLowerCase() || "";
  if (msg.includes("content moderation") || msg.includes("safety") || msg.includes("blocked")) {
    return false;
  }

  return false;
}

function getRetryDelay(err, attempt) {
  // Respect Retry-After header if present
  const retryAfter = err.headers?.["retry-after"] || err.response?.headers?.["retry-after"];
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) return seconds * 1000;
  }

  // Exponential backoff: 2s → 4s → 8s → 16s (capped at 30s)
  const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  // Add jitter to prevent retry storms
  return delay + Math.random() * JITTER_MS;
}

// ── Retry wrapper ──────────────────────────────────────────────────
async function callAgent({ client, message }) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await processWithAgent({ client, message });
    } catch (err) {
      lastError = err;

      if (!isRetryable(err) || attempt === MAX_RETRIES) {
        throw err;
      }

      const delay = getRetryDelay(err, attempt);
      console.warn(
        `⚠️ Retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delay)}ms — ${err.code || err.status || err.message}`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
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

  // Reconnection events — never crash
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

  // Message handler
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

// Never crash on unhandled errors
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled rejection (non-fatal):", err?.message || err);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception (non-fatal):", err.message);
});
