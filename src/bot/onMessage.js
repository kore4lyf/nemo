import PQueue from "p-queue";
import { retryAsync } from "../utils/retry.js";
import { logger } from "../config/logger.js";
import { processWithAgent } from "../agent/agent.js";

const MAX_QUEUED_JOBS = 20;
const MAX_CONCURRENCY = 1;
const JOB_TIMEOUT_MS = 15_000;

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

const queue = new PQueue({
  concurrency: MAX_CONCURRENCY,
  autoStart: true,
});

const inFlight = new Set();
const attempts = new Map();

function getJobKey(message) {
  return `${message.guildId ?? "dm"}:${message.channelId}:${message.id}`;
}

function recordAttempt(key) {
  const jobStatus = attempts.get(key);
  if (!jobStatus) {
    attempts.set(key, { count: 1, failed: false });
    return 1;
  }

  jobStatus.count += 1;
  if (jobStatus.count >= 3) jobStatus.failed = true;
  return jobStatus.count;
}

export function getQueueStatus(key) {
  const jobStatus = attempts.get(key);
  if (!jobStatus) return null;
  if (inFlight.has(key)) return { status: "processing", attempts: jobStatus.count };
  if (jobStatus.failed) return { status: "failed", attempts: jobStatus.count };
  return { status: "queued", attempts: jobStatus.count };
}

async function notifyStatus(message, text) {
  try {
    await message.reply(text);
  } catch (replyErr) {
    logger.warn("Failed to send status reply:", replyErr.message);
  }
}

export async function onMessage(message) {
  if (message.author?.bot) return;
  if (!message?.mentions?.has(message.client?.user)) return;

  const key = getJobKey(message);
  const status = getQueueStatus(key);
  if (status && status.status !== "failed") {
    await notifyStatus(
      message,
      "I'm already working on that — I'll reply here when it's done."
    );
    return;
  }

  if (queue.size >= MAX_QUEUED_JOBS) {
    await notifyStatus(message, "I'm at capacity right now — please retry shortly.");
    return;
  }

  let response;
  try {
    response = await queue.add(
      async () => {
        inFlight.add(key);
        recordAttempt(key);

        const result = await retryAsync(
          async () => {
            const agentResponse = await processWithAgent({
              client: message.client,
              message,
            });
            if (agentResponse?.trim()) {
              return { success: true, response: agentResponse };
            }
            return { success: true, response: null };
          },
          {
            retries: 2,
            minTimeout: 1000,
            maxTimeout: 10000,
            isRetryable: (err) => isRetryable(err),
            onRetry: (err, attempt) =>
              logger.warn(`Queue job retry ${attempt} for ${key}: ${err?.message || err}`),
          }
        );

        attempts.delete(key);
        inFlight.delete(key);
        return result;
      },
      {
        id: key,
        timeout: JOB_TIMEOUT_MS,
      }
    );
  } catch (err) {
    attempts.delete(key);
    inFlight.delete(key);
    logger.error("Agent queue job failed:", err?.message || err);
    await notifyStatus(
      message,
       "This request couldn't be completed after multiple attempts. Please try again later."
    ).catch(() => {});
    return;
  }

  if (response?.response?.trim()) {
    await notifyStatus(message, response.response).catch(() => {});
  }
}

queue.on("error", (err) => {
  logger.error("Queue error:", err?.message || err);
});
