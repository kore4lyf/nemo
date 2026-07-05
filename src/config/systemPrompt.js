// Loads AGENTS.md (the persistent system prompt) with mtime-based
// cache invalidation. The agent imports getSystemPrompt() and prepends
// it to the dynamic per-message Context block in agent.js.
//
// Hot reload: checks file mtime on every call. If AGENTS.md was edited
// since the last read, the cache is invalidated and the file is re-read.
// This avoids a full process restart when the persona evolves.

import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// AGENTS.md lives at the project root (the directory above src/config/).
const AGENTS_MD_PATH = resolve(__dirname, "../../AGENTS.md");

let cachedPrompt = null;
let cachedMtime = 0;

const FALLBACK = [
  "You are Nemo, a project manager that lives in this Discord server.",
  "Help the team plan, organize, monitor, and execute projects together.",
  "Read the server before acting. Confirm before destructive actions.",
  "Never invent data. If a tool returns empty, say so.",
].join("\n");

function readAgentsMd() {
  try {
    const stat = statSync(AGENTS_MD_PATH);
    const mtimeMs = stat.mtimeMs;

    // Return cached if file hasn't changed
    if (cachedPrompt !== null && mtimeMs === cachedMtime) {
      return cachedPrompt;
    }

    const raw = readFileSync(AGENTS_MD_PATH, "utf8");
    // Trim trailing whitespace + a leading H1 if present, so the prompt
    // starts at the first real section. We keep the rest verbatim.
    const trimmed = raw.replace(/^# .*\n+/m, "").trim();
    if (trimmed.length > 0) {
      if (cachedPrompt === null) {
        logger.info("Loaded system prompt from AGENTS.md");
      } else {
        logger.info("System prompt reloaded — AGENTS.md changed");
      }
      cachedMtime = mtimeMs;
      cachedPrompt = trimmed;
      return cachedPrompt;
    }
    return null;
  } catch (err) {
    logger.warn(`Could not read AGENTS.md at ${AGENTS_MD_PATH}: ${err.code || err.message}`);
    return null;
  }
}

/**
 * Return the AGENTS.md content. Checks file mtime on each call;
 * reloads automatically if the file was edited.
 *
 * @returns {string} The system prompt text. If AGENTS.md is missing or
 *   unreadable, returns a minimal fallback so the agent still works —
 *   the fallback is logged once at warn level.
 */
export function getSystemPrompt() {
  const text = readAgentsMd();
  if (text) return text;

  // Fallback: keeps the bot functional if AGENTS.md is removed or renamed.
  cachedPrompt = FALLBACK;
  return cachedPrompt;
}

// Exported for tests.
export function _resetSystemPromptCache() {
  cachedPrompt = null;
  cachedMtime = 0;
}

export { AGENTS_MD_PATH };
