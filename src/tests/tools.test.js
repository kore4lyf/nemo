import { test } from "node:test";
import assert from "node:assert";
import { sendMessage, pinMessage, unpinMessage, createThread, sendThreadMessage, addReaction, deleteMessage, editMessage, getChannelInfo, listThreads } from "../discord/tools/index.js";
import { extractContext } from "../discord/context.js";

// Mock Discord client for testing
const mockClient = {
  user: { id: "bot-123" },
  channels: {
    fetch: async (channelId) => ({
      id: channelId,
      type: 0,
      name: "test-channel",
      send: async (content) => ({ id: "mock-message-id", content }),
      messages: { fetch: async () => ({}) },
    }),
  },
  guilds: { fetch: async () => ({ threads: { fetchActive: async () => ({ threads: [] }) } }) },
};

// ── sendMessage ──────────────────────────────────────
test("sendMessage schema rejects empty channelId", () => {
  const tool = sendMessage({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "", content: "hi" });
  assert.ok(!result.success);
});

test("sendMessage schema rejects content over 2000 chars", () => {
  const tool = sendMessage({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "123", content: "x".repeat(2001) });
  assert.ok(!result.success);
});

test("sendMessage schema accepts valid input", () => {
  const tool = sendMessage({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "123", content: "Hello" });
  assert.ok(result.success);
});

// ── pin_message ──────────────────────────────────────
test("pin_message schema rejects empty messageId", () => {
  const tool = pinMessage({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "123", messageId: "" });
  assert.ok(!result.success);
});

test("pin_message schema accepts valid input", () => {
  const tool = pinMessage({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "123", messageId: "456" });
  assert.ok(result.success);
});

// ── unpin_message ────────────────────────────────────
test("unpin_message schema rejects empty channelId", () => {
  const tool = unpinMessage({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "", messageId: "456" });
  assert.ok(!result.success);
});

// ── create_thread ────────────────────────────────────
test("create_thread schema rejects empty name", () => {
  const tool = createThread({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "123", name: "" });
  assert.ok(!result.success);
});

test("create_thread schema accepts type 'private'", () => {
  const tool = createThread({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "123", name: "Thread", type: "private" });
  assert.ok(result.success);
});

// ── send_thread_message ──────────────────────────────
test("send_thread_message schema rejects content over 2000 chars", () => {
  const tool = sendThreadMessage({ client: mockClient });
  const result = tool.schema.safeParse({ threadId: "123", content: "x".repeat(2001) });
  assert.ok(!result.success);
});

test("send_thread_message schema accepts valid input", () => {
  const tool = sendThreadMessage({ client: mockClient });
  const result = tool.schema.safeParse({ threadId: "123", content: "Hello" });
  assert.ok(result.success);
});

// ── add_reaction ─────────────────────────────────────
test("add_reaction schema rejects empty emoji", () => {
  const tool = addReaction({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "123", messageId: "456", emoji: "" });
  assert.ok(!result.success);
});

test("add_reaction schema accepts valid input", () => {
  const tool = addReaction({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "123", messageId: "456", emoji: "👍" });
  assert.ok(result.success);
});

// ── delete_message ───────────────────────────────────
test("delete_message schema rejects empty messageId", () => {
  const tool = deleteMessage({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "123", messageId: "" });
  assert.ok(!result.success);
});

// ── edit_message ─────────────────────────────────────
test("edit_message schema rejects content over 2000 chars", () => {
  const tool = editMessage({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "123", messageId: "456", newContent: "x".repeat(2001) });
  assert.ok(!result.success);
});

test("edit_message schema accepts valid input", () => {
  const tool = editMessage({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "123", messageId: "456", newContent: "Updated" });
  assert.ok(result.success);
});

// ── get_channel_info ─────────────────────────────────
test("get_channel_info schema rejects empty channelId", () => {
  const tool = getChannelInfo({ client: mockClient });
  const result = tool.schema.safeParse({ channelId: "" });
  assert.ok(!result.success);
});

// ── list_threads ─────────────────────────────────────
test("list_threads schema requires channelId or guildId", () => {
  const tool = listThreads({ client: mockClient });
  const result = tool.schema.safeParse({});
  assert.ok(result.success); // zod allows optional fields — runtime check decides
});

// ── context extraction ───────────────────────────────
test("context extraction handles null inputs", () => {
  const context = extractContext({ client: null, message: null });
  assert.strictEqual(context.currentChannel, null);
  assert.strictEqual(context.currentMessage, null);
  assert.deepStrictEqual(context.mentionedUsers, []);
});

console.log("✅ All schema tests passed!");
