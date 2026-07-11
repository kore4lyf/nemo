import PQueue from "p-queue";
import { logger } from "../config/logger.js";

// ── Global concurrency queue ──────────────────────────────────────────
// Limits how many processWithAgent calls run in parallel. Prevents
// denial-of-wallet when a busy channel fires 50+ mentions at once.
const CONCURRENT_LIMIT = parseInt(process.env.CONCURRENT_AGENT_LIMIT || "3", 10);

export const agentQueue = new PQueue({
  concurrency: CONCURRENT_LIMIT,
  intervalCap: 10,
  interval: 60_000, // hard cap: 10 agent calls per minute globally
});

// ── Per-user cooldown ─────────────────────────────────────────────────
// Prevents a single user from burning the budget with rapid-fire mentions.
const USER_COOLDOWN_MS = parseInt(process.env.USER_COOLDOWN_MS || "5_000", 10);
const lastInvocation = new Map(); // userId → timestamp

/**
 * Returns true if the user is still within their cooldown window.
 * Automatically cleans up stale entries.
 */
export function isOnCooldown(userId) {
  const last = lastInvocation.get(userId);
  if (!last) return false;
  if (Date.now() - last < USER_COOLDOWN_MS) return true;
  lastInvocation.delete(userId);
  return false;
}

/**
 * Records that a user just invoked the agent. Call before queuing.
 */
export function recordInvocation(userId) {
  // Evict expired entries on every write (time-based, not size-based)
  const cutoff = Date.now() - USER_COOLDOWN_MS * 2;
  for (const [id, ts] of lastInvocation) {
    if (ts < cutoff) lastInvocation.delete(id);
  }
  lastInvocation.set(userId, Date.now());
}

/**
 * Reject-style error for cooldown. Caller should reply with a short nudge.
 */
export class CooldownError extends Error {
  constructor(userId, msRemaining) {
    super(`User ${userId} on cooldown (${msRemaining}ms remaining)`);
    this.name = "CooldownError";
    this.msRemaining = msRemaining;
  }
}

// Log queue saturation for ops visibility
agentQueue.on("active", () => {
  logger.debug(`Queue: ${agentQueue.pending} pending, ${agentQueue.size} waiting`);
});

agentQueue.on("error", (err) => {
  logger.error("Queue error:", err.message);
});

export { CONCURRENT_LIMIT, USER_COOLDOWN_MS };
