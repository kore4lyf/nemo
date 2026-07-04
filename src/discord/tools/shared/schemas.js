import { z } from "zod";

// Reusable Zod field helpers. Same shape as before so tests stay valid.
export const channelIdField = z.string().min(1);
export const messageIdField = z.string().min(1);
export const threadIdField = z.string().min(1);
export const guildIdField = z.string().min(1);

// Text content for messages — Discord limit is 2000 chars.
export const contentField = (extra = {}) =>
  z.string().min(1).max(2000).describe(extra.describe || "");

// Convenience: an idempotent reader schema for "give me a channel or a guild"
export const targetSchema = z
  .object({
    channelId: channelIdField.optional(),
    guildId: guildIdField.optional(),
  })
  .refine((v) => v.channelId || v.guildId, {
    message: "channelId or guildId is required.",
  });
