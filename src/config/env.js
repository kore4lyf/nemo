import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_BASE_URL: z.string().url().default("https://api.aimlapi.com/v1"),
  OPENAI_MODEL: z.string().default("alibaba/qwen3-vl-flash"),
  CLIENT_ID: z.string().min(1, "CLIENT_ID is required"),
  GUILD_ID: z.string().optional(),
});

export const env = envSchema.parse(process.env);
