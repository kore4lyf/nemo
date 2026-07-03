// Simple structured logger. Replace console.* calls site-wide.
// Levels: debug < info < warn < error. Set LOG_LEVEL env var to filter.

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || "info"] ?? LEVELS.info;

function log(level, ...args) {
  if (LEVELS[level] < currentLevel) return;
  const prefix = { debug: "🔍", info: "ℹ️", warn: "⚠️", error: "❌" }[level] || "";
  const ts = new Date().toISOString().slice(11, 19);
  console[level === "error" ? "error" : "log"](`${prefix} [${ts}]`, ...args);
}

export const logger = {
  debug: (...args) => log("debug", ...args),
  info: (...args) => log("info", ...args),
  warn: (...args) => log("warn", ...args),
  error: (...args) => log("error", ...args),
};
