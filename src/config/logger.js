// Simple structured logger. Replace console.* calls site-wide.
// Levels: debug < info < warn < error. Set LOG_LEVEL env var to filter.

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || "info"] ?? LEVELS.info;

function log(level, requestId, ...args) {
  if (LEVELS[level] < currentLevel) return;
  const prefix = { debug: "🔍", info: "ℹ️", warn: "⚠️", error: "❌" }[level] || "";
  const ts = new Date().toISOString().slice(11, 19);
  const rid = requestId ? ` [${requestId}]` : "";
  console[level === "error" ? "error" : "log"](`${prefix} [${ts}]${rid}`, ...args);
}

export const logger = {
  debug: (...args) => log("debug", null, ...args),
  info: (...args) => log("info", null, ...args),
  warn: (...args) => log("warn", null, ...args),
  error: (...args) => log("error", null, ...args),
};

/** Create a logger scoped to a specific request ID. */
export function scopedLogger(requestId) {
  return {
    debug: (...args) => log("debug", requestId, ...args),
    info: (...args) => log("info", requestId, ...args),
    warn: (...args) => log("warn", requestId, ...args),
    error: (...args) => log("error", requestId, ...args),
  };
}
