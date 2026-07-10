import log4js from "log4js";
import fs from "node:fs";
import path from "node:path";

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const layout = (logEvent) => {
  const data = logEvent.data[0] || "";
  if (typeof data !== "string") {
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }
  return data;
};

log4js.configure({
  appenders: {
    out: { type: "console", layout: { type: "pattern", pattern: "%m" } },
    file: {
      type: "file",
      filename: path.join(LOG_DIR, "nemo.log"),
      maxLogSize: 10 * 1024 * 1024,
      backups: 10,
      compress: true,
      mode: 0o640,
      layout: { type: "pattern", pattern: "%d %p %m" },
    },
    agent: {
      type: "file",
      filename: path.join(LOG_DIR, "nemo-agent.log"),
      maxLogSize: 50 * 1024 * 1024,
      backups: 20,
      compress: true,
      mode: 0o640,
      layout: { type: "pattern", pattern: "%d %p %m" },
    },
  },
  categories: {
    default: { appenders: ["out", "file"], level: process.env.LOG_LEVEL || "info" },
    agent: { appenders: ["agent"], level: "info" },
  },
});

export const getLogger = (category = "default") => log4js.getLogger(category);
