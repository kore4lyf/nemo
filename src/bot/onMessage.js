import retry from "async-retry";
import { processWithAgent } from "../agent/agent.js";
import { logger } from "../config/logger.js";

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
      minTimeout: 2000,
      maxTimeout: 30_000,
      onRetry: (err, attempt) =>
        logger.warn(`Retry ${attempt}/3 — ${err.code || err.status || err.message}`),
    }
  );
}

export async function onMessage(message) {
  if (message.author.bot) return;
  if (!message.mentions.has(message.client.user)) return;

  const { client } = message;

  try {
    const response = await callAgent({ client, message });
    if (response?.trim()) {
      try {
        await message.reply(response);
      } catch (replyErr) {
        logger.warn("Failed to send reply:", replyErr.message);
      }
    }
  } catch (error) {
    logger.error("Agent failed:", error.message || error);
    await message.reply("Something went wrong — try again in a moment.").catch(() => {});
  }
}
