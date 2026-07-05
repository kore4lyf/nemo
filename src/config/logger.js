import { getLogger } from "./log4js.js";

const base = getLogger("app");
base.level = (process.env.LOG_LEVEL || "info").toLowerCase();
const LEVELS = { debug: "debug", info: "info", warn: "warn", error: "error" };

function log(level, requestId, ...args) {
  const msg = args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
  const prefix = requestId ? `[${requestId}] ` : "";
  base[LEVELS[level] || "info"](prefix + msg);
}

export const appLogger = {
  debug: (...args) => log("debug", null, ...args),
  info: (...args) => log("info", null, ...args),
  warn: (...args) => log("warn", null, ...args),
  error: (...args) => log("error", null, ...args),
};

export const logger = appLogger;

export function scopedLogger(requestId) {
  return {
    debug: (...args) => log("debug", requestId, ...args),
    info: (...args) => log("info", requestId, ...args),
    warn: (...args) => log("warn", requestId, ...args),
    error: (...args) => log("error", requestId, ...args),
  };
}
