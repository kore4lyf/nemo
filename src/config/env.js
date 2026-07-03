import { z } from "zod";
import { LLM_DEFAULTS } from "./constants.js";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  // Allow any valid URL (including http://localhost for local mocks)
  OPENAI_BASE_URL: z.string().url().or(z.string().startsWith("http://")).default(LLM_DEFAULTS.BASE_URL),
  OPENAI_MODEL: z.string().default(LLM_DEFAULTS.MODEL),
  CLIENT_ID: z.string().min(1),
});

// Validate on import — crashes early if required vars are missing
// Wrapped in try/catch so tests can import without crashing
let env;
try {
  env = envSchema.parse(process.env);
} catch (err) {
  // In test environments, env vars may not be set — don't crash
  if (process.env.NODE_ENV === "test") {
    env = {};
  } else {
    throw err;
  }
}

export { env };
