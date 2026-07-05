import retry from "async-retry";
import { randomUUID } from "node:crypto";
import { processWithAgent } from "../agent/agent.js";
import { logger, scopedLogger } from "../config/logger.js";
import { agentQueue, isOnCooldown, recordInvocation, CooldownError } from "./queue.js";

// ── Message dedup ──────────────────────────────────────────────────────
// Prevents double-processing when Discord replays events after shard resume.
const PROCESSED_TTL_MS = 5 * 60 * 1000; // 5 minutes
const processedMessages = new Map(); // messageId → timestamp

function isDuplicate(messageId) {
  const ts = processedMessages.get(messageId);
  if (!ts) return false;
  if (Date.now() - ts < PROCESSED_TTL_MS) return true;
  processedMessages.delete(messageId);
  return false;
}

function markProcessed(messageId) {
  processedMessages.set(messageId, Date.now());
  // Periodic cleanup
  if (processedMessages.size > 500) {
    const cutoff = Date.now() - PROCESSED_TTL_MS;
    for (const [id, ts] of processedMessages) {
      if (ts < cutoff) processedMessages.delete(id);
    }
  }
}

// Error classification — only retry transient failures
function isRetryable(err) {
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

  const status = err.status || err.statusCode || err.response?.status;
  if (status === 429 || status === 529) return true;
  if (status >= 500) return true;
  if (status >= 400 && status < 500) return false;

  const msg = err.message?.toLowerCase() || "";
  if (msg.includes("content moderation") || msg.includes("safety") || msg.includes("blocked")) {
    return false;
  }

  return false;
}

async function callAgent({ client, message, requestId }) {
  const reqLog = scopedLogger(requestId);
  return retry(
    async (bail) => {
      try {
        return await processWithAgent({ client, message, requestId });
      } catch (err) {
        if (!isRetryable(err)) bail(err);
        throw err;
      }
    },
    {
      retries: 3,
      minTimeout: 2000,
      maxTimeout: 30_000,
      onRetry: (err, attempt) =>
        reqLog.warn(`Retry ${attempt}/3 — ${err.code || err.status || err.message}`),
    }
  );
}

export async function onMessage(message) {
  if (message.author.bot) return;
  if (!message.mentions.has(message.client.user)) return;

  // Dedup: skip if this message was already processed (shard resume replay)
  if (isDuplicate(message.id)) {
    logger.debug(`Dedup: skipping replayed message ${message.id}`);
    return;
  }
  markProcessed(message.id);

  const { client } = message;
  const userId = message.author.id;
  const requestId = randomUUID().slice(0, 8);
  const reqLog = scopedLogger(requestId);

  // Per-user cooldown — reject rapid-fire mentions
  if (isOnCooldown(userId)) {
    reqLog.debug(`Cooldown hit for user ${userId}`);
    await message.reply("Slow down — try again in a few seconds.").catch(() => {});
    return;
  }
  recordInvocation(userId);

  reqLog.info(`Message from ${message.author.username} in #${message.channel?.name || "unknown"}`);

  // Enqueue through p-queue for global concurrency control
  agentQueue
    .add(async () => {
      const response = await callAgent({ client, message, requestId });
      if (response?.trim()) {
        try {
          await message.reply(response);
        } catch (replyErr) {
          reqLog.warn("Failed to send reply:", replyErr.message);
        }
      }
    })
    .catch((error) => {
      reqLog.error("Agent failed:", error.message || error);
      message
        .reply("Something went wrong — try again in a moment.")
        .catch(() => {});
    });
}
