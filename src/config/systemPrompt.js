import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_PATH = resolve(__dirname, "../../AGENTS.md");

let cached = null;

export function getSystemPrompt() {
  if (cached === null) {
    try {
      cached = readFileSync(AGENTS_PATH, "utf8");
    } catch (err) {
      throw new Error(
        `AGENTS.md not found at ${AGENTS_PATH}. Ensure the agent knowledge base is present before starting.`
      );
    }
  }
  return cached;
}
