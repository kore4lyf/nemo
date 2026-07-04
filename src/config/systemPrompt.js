// Loads AGENTS.md (the persistent system prompt) once and caches it.
// The agent imports getSystemPrompt() and prepends it to the dynamic
// per-message Context block in agent.js. Keeping the file read here
// (rather than inline in agent.js) means tests can mock it and the
// prompt can evolve without touching the agent's request loop.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// AGENTS.md lives at the project root (the directory above src/config/).
const AGENTS_MD_PATH = resolve(__dirname, "../../AGENTS.md");

let cachedPrompt = null;

function readAgentsMd() {
  try {
    const raw = readFileSync(AGENTS_MD_PATH, "utf8");
    // Trim trailing whitespace + a leading H1 if present, so the prompt
    // starts at the first real section. We keep the rest verbatim.
    const trimmed = raw.replace(/^# .*\n+/m, "").trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    logger.warn(`Could not read AGENTS.md at ${AGENTS_MD_PATH}: ${err.code || err.message}`);
    return null;
  }
}

/**
 * Return the cached AGENTS.md content. Reads the file on first call;
 * every subsequent call returns the same string for the process lifetime.
 *
 * @returns {string} The system prompt text. If AGENTS.md is missing or
 *   unreadable, returns a minimal fallback so the agent still works —
 *   the fallback is logged once at warn level.
 */
export function getSystemPrompt() {
  if (cachedPrompt !== null) return cachedPrompt;

  const text = readAgentsMd();
  if (text) {
    cachedPrompt = text;
    return cachedPrompt;
  }

  // Fallback: keeps the bot functional if AGENTS.md is removed or renamed.
  // Logged at warn (above) so the operator knows the file is missing.
  cachedPrompt = [
    "You are Nemo, a project manager that lives in this Discord server.",
    "Help the team plan, organize, monitor, and execute projects together.",
    "Read the server before acting. Confirm before destructive actions.",
    "Never invent data. If a tool returns empty, say so.",
  ].join("\n");
  return cachedPrompt;
}

// Exported for tests and for a future "reload prompt without restart" path.
export function _resetSystemPromptCache() {
  cachedPrompt = null;
}

export { AGENTS_MD_PATH };
