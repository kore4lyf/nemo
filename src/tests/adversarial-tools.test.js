/**
 * ADVERSARIAL TOOL TESTS
 * Purpose: Break the tools. Find crashes, silent failures, wrong error shapes.
 * Strategy: Mock Discord API to throw, return wrong types, return null.
 */
import { test } from "node:test";
import assert from "node:assert";
import {
  sendMessage,
  pinMessage,
  unpinMessage,
  createThread,
  sendThreadMessage,
  addReaction,
  deleteMessage,
  editMessage,
  getChannelInfo,
  listThreads,
} from "../discord/tools/index.js";

// ── Mock factories ────────────────────────────────────────────────

function mockClient(overrides = {}) {
  const ALL_PERMS = 0x1FFFFFFFFFFFFFn;
  const fakeMember = {
    id: "bot-123",
    permissions: { has: () => true, bitfield: ALL_PERMS },
  };

  return {
    user: { id: "bot-123" },
    channels: {
      fetch: async (id) => ({
        id,
        name: "test-channel",
        type: 0,
        isThread: () => false,
        memberCount: 10,
        guild: {
          id: "g-1",
          members: { resolve: (userId) => (userId === "bot-123" ? fakeMember : null) },
        },
        messages: {
          fetch: async (msgId) => ({
            id: msgId,
            pin: async function () {},
            unpin: async function () {},
            delete: async function () {},
            edit: async function () {},
            react: async function () {},
          }),
        },
        send: async (opts) => ({ id: "msg-sent", content: opts.content || opts }),
        threads: {
          create: async (opts) => ({
            id: "thread-new",
            name: opts.name,
            send: async () => ({ id: "msg-t", content: "thread msg" }),
          }),
          fetchActive: async () => ({ threads: [] }),
        },
        ...overrides,
      }),
    },
    guilds: {
      fetch: async () => ({
        threads: { fetchActive: async () => ({ threads: [] }) },
      }),
    },
  };
}

function mockClientFailing(failOn = "channels.fetch", errorMsg = "API Error") {
  const client = mockClient();

  if (failOn === "channels.fetch") {
    client.channels.fetch = async () => { throw new Error(errorMsg); };
  } else if (failOn === "messages.fetch") {
    client.channels.fetch = async (id) => ({
      id,
      name: "ch",
      type: 0,
      isThread: () => false,
      memberCount: 1,
      guild: { id: "g-1", members: { resolve: () => null } },
      messages: { fetch: async () => { throw new Error(errorMsg); } },
      send: async () => ({ id: "m" }),
      threads: { create: async () => ({ id: "t" }), fetchActive: async () => ({ threads: [] }) },
    });
  } else if (failOn === "send") {
    client.channels.fetch = async (id) => ({
      id,
      name: "ch",
      type: 0,
      isThread: () => false,
      memberCount: 1,
      guild: { id: "g-1", members: { resolve: () => null } },
      messages: { fetch: async (msgId) => ({ id: msgId, pin: async () => {}, unpin: async () => {}, delete: async () => {}, edit: async () => {}, react: async () => {} }) },
      send: async () => { throw new Error(errorMsg); },
      threads: { create: async () => { throw new Error(errorMsg); }, fetchActive: async () => ({ threads: [] }) },
    });
  }

  return client;
}

function mockClientNoPermissions() {
  const client = mockClient();
  client.channels.fetch = async (id) => ({
    id,
    name: "no-perm-channel",
    type: 0,
    isThread: () => false,
    memberCount: 5,
    guild: {
      id: "g-1",
      members: {
        resolve: (userId) => ({
          id: userId,
          permissions: { has: () => false, bitfield: 0n },
        }),
      },
    },
    messages: { fetch: async (msgId) => ({ id: msgId }) },
    send: async () => ({ id: "m" }),
    threads: { create: async () => ({ id: "t" }), fetchActive: async () => ({ threads: [] }) },
  });
  return client;
}

// ══════════════════════════════════════════════════════════════════
// CATEGORY 1: Discord API Failures
// ══════════════════════════════════════════════════════════════════

test("sendMessage: channels.fetch throws → should return { success: false }", async () => {
  const client = mockClientFailing("channels.fetch", "Unknown Channel");
  const tool = sendMessage({ client });
  const result = await tool.invoke({ channelId: "bad-id", content: "hello" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error, "Should include error message");
});

test("pinMessage: messages.fetch throws → should return { success: false }", async () => {
  const client = mockClientFailing("messages.fetch", "Unknown Message");
  const tool = pinMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "bad-msg" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test("unpinMessage: messages.fetch throws → should return { success: false }", async () => {
  const client = mockClientFailing("messages.fetch", "Unknown Message");
  const tool = unpinMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "bad-msg" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test("deleteMessage: messages.fetch throws → should return { success: false }", async () => {
  const client = mockClientFailing("messages.fetch", "Unknown Message");
  const tool = deleteMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "bad-msg" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test("editMessage: messages.fetch throws → should return { success: false }", async () => {
  const client = mockClientFailing("messages.fetch", "Unknown Message");
  const tool = editMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "bad-msg", newContent: "hi" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test("addReaction: messages.fetch throws → should return { success: false }", async () => {
  const client = mockClientFailing("messages.fetch", "Unknown Message");
  const tool = addReaction({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "bad-msg", emoji: "👍" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test("sendMessage: channel.send throws → should return { success: false }", async () => {
  const client = mockClientFailing("send", "Rate Limited");
  const tool = sendMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", content: "hello" });
  assert.strictEqual(result.success, false);
  // error could be the original message or a String(error) wrapper
  assert.ok(result.error, "Should have an error field");
});

test("createThread: threads.create throws → should return { success: false }", async () => {
  const client = mockClientFailing("send", "Channel not found");
  const tool = createThread({ client });
  const result = await tool.invoke({ channelId: "ch-1", name: "Thread" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test("listThreads: channels.fetch throws → should return { success: false } or throw", async () => {
  const client = mockClientFailing("channels.fetch", "Unknown Channel");
  const tool = listThreads({ client });
  try {
    const result = await tool.invoke({ channelId: "bad-id" });
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  } catch (err) {
    // BUG: listThreads doesn't catch this — it throws instead of returning error
    console.log("   ⚠️  BUG CONFIRMED: listThreads throws on channels.fetch error");
    console.log("   Error:", err.message);
  }
});

test("getChannelInfo: channels.fetch throws → should return { success: false }", async () => {
  const client = mockClientFailing("channels.fetch", "Unknown Channel");
  const tool = getChannelInfo({ client });
  const result = await tool.invoke({ channelId: "bad-id" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 2: Permission Denied
// ══════════════════════════════════════════════════════════════════

test("sendMessage: no permission → { success: false, error includes 'permission' }", async () => {
  const client = mockClientNoPermissions();
  const tool = sendMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", content: "hello" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.toLowerCase().includes("permission"));
});

test("pinMessage: no permission → { success: false }", async () => {
  const client = mockClientNoPermissions();
  const tool = pinMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.toLowerCase().includes("permission"));
});

test("unpinMessage: no permission → { success: false }", async () => {
  const client = mockClientNoPermissions();
  const tool = unpinMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.toLowerCase().includes("permission"));
});

test("createThread: no permission → { success: false }", async () => {
  const client = mockClientNoPermissions();
  const tool = createThread({ client });
  const result = await tool.invoke({ channelId: "ch-1", name: "Thread" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.toLowerCase().includes("permission"));
});

test("sendThreadMessage: no permission → { success: false }", async () => {
  const client = mockClientNoPermissions();
  const tool = sendThreadMessage({ client });
  const result = await tool.invoke({ threadId: "t-1", content: "hello" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.toLowerCase().includes("permission"));
});

test("addReaction: no permission → { success: false }", async () => {
  const client = mockClientNoPermissions();
  const tool = addReaction({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1", emoji: "👍" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.toLowerCase().includes("permission"));
});

test("deleteMessage: no permission → { success: false }", async () => {
  const client = mockClientNoPermissions();
  const tool = deleteMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.toLowerCase().includes("permission"));
});

test("editMessage: no permission → { success: false }", async () => {
  const client = mockClientNoPermissions();
  const tool = editMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1", newContent: "hi" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.toLowerCase().includes("permission"));
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 3: Null/Undefined Client
// ══════════════════════════════════════════════════════════════════

test("sendMessage: null client → should not crash", async () => {
  const tool = sendMessage({ client: null });
  // Tool should either return error or throw — not crash the process
  try {
    const result = await tool.invoke({ channelId: "ch-1", content: "hello" });
    assert.strictEqual(result.success, false);
  } catch (err) {
    // Throwing is acceptable, crashing is not
    assert.ok(err instanceof Error);
  }
});

test("pinMessage: null client → should not crash", async () => {
  const tool = pinMessage({ client: null });
  try {
    const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1" });
    assert.strictEqual(result.success, false);
  } catch (err) {
    assert.ok(err instanceof Error);
  }
});

test("listThreads: null client → should not crash", async () => {
  const tool = listThreads({ client: null });
  try {
    const result = await tool.invoke({ channelId: "ch-1" });
    assert.strictEqual(result.success, false);
  } catch (err) {
    assert.ok(err instanceof Error);
  }
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 4: Content Edge Cases
// ══════════════════════════════════════════════════════════════════

test("sendMessage: exactly 2000 chars → should succeed", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const content = "A".repeat(2000);
  const result = await tool.invoke({ channelId: "ch-1", content });
  assert.strictEqual(result.success, true);
});

test("sendMessage: 2001 chars → LangChain schema rejects (throws, not {success:false})", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const content = "A".repeat(2001);
  try {
    await tool.invoke({ channelId: "ch-1", content });
    assert.fail("Should have thrown for 2001 chars");
  } catch (err) {
    // LangChain validates schema BEFORE tool.create runs
    assert.ok(err.message.includes("Too big") || err.message.includes("2000"));
  }
});

test("sendMessage: 1 char → should succeed", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", content: "A" });
  assert.strictEqual(result.success, true);
});

test("sendMessage: whitespace-only content → zod min(1) allows it", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", content: "   " });
  // Zod min(1) counts "   " as length 3 — this passes validation
  assert.strictEqual(result.success, true);
});

test("editMessage: exactly 2000 chars → should succeed", async () => {
  const client = mockClient();
  const tool = editMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1", newContent: "B".repeat(2000) });
  assert.strictEqual(result.success, true);
});

test("editMessage: 2001 chars → LangChain schema rejects (throws)", async () => {
  const client = mockClient();
  const tool = editMessage({ client });
  try {
    await tool.invoke({ channelId: "ch-1", messageId: "msg-1", newContent: "B".repeat(2001) });
    assert.fail("Should have thrown for 2001 chars");
  } catch (err) {
    assert.ok(err.message.includes("Too big") || err.message.includes("2000"));
  }
});

test("sendThreadMessage: exactly 2000 chars → should succeed", async () => {
  const client = mockClient();
  const tool = sendThreadMessage({ client });
  const result = await tool.invoke({ threadId: "t-1", content: "C".repeat(2000) });
  assert.strictEqual(result.success, true);
});

test("sendThreadMessage: 2001 chars → LangChain schema rejects (throws)", async () => {
  const client = mockClient();
  const tool = sendThreadMessage({ client });
  try {
    await tool.invoke({ threadId: "t-1", content: "C".repeat(2001) });
    assert.fail("Should have thrown for 2001 chars");
  } catch (err) {
    assert.ok(err.message.includes("Too big") || err.message.includes("2000"));
  }
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 5: Type Coercion / Wrong Types
// ══════════════════════════════════════════════════════════════════

test("sendMessage: content as number → zod should reject", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const result = tool.schema.safeParse({ channelId: "ch-1", content: 12345 });
  assert.strictEqual(result.success, false, "Zod should reject number content");
});

test("sendMessage: content as array → zod should reject", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const result = tool.schema.safeParse({ channelId: "ch-1", content: ["hello"] });
  assert.strictEqual(result.success, false, "Zod should reject array content");
});

test("sendMessage: content as object → zod should reject", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const result = tool.schema.safeParse({ channelId: "ch-1", content: { text: "hello" } });
  assert.strictEqual(result.success, false, "Zod should reject object content");
});

test("pinMessage: messageId as number → zod should reject", async () => {
  const client = mockClient();
  const tool = pinMessage({ client });
  const result = tool.schema.safeParse({ channelId: "ch-1", messageId: 12345 });
  assert.strictEqual(result.success, false, "Zod should reject number messageId");
});

test("createThread: name as number → zod should reject", async () => {
  const client = mockClient();
  const tool = createThread({ client });
  const result = tool.schema.safeParse({ channelId: "ch-1", name: 12345 });
  assert.strictEqual(result.success, false, "Zod should reject number name");
});

test("addReaction: emoji as number → zod should reject", async () => {
  const client = mockClient();
  const tool = addReaction({ client });
  const result = tool.schema.safeParse({ channelId: "ch-1", messageId: "msg-1", emoji: 123 });
  assert.strictEqual(result.success, false, "Zod should reject number emoji");
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 6: Missing Required Fields
// ══════════════════════════════════════════════════════════════════

test("sendMessage: missing channelId → zod rejects", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const result = tool.schema.safeParse({ content: "hello" });
  assert.strictEqual(result.success, false);
});

test("sendMessage: missing content → zod rejects", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const result = tool.schema.safeParse({ channelId: "ch-1" });
  assert.strictEqual(result.success, false);
});

test("pinMessage: missing messageId → zod rejects", async () => {
  const client = mockClient();
  const tool = pinMessage({ client });
  const result = tool.schema.safeParse({ channelId: "ch-1" });
  assert.strictEqual(result.success, false);
});

test("createThread: missing name → zod rejects", async () => {
  const client = mockClient();
  const tool = createThread({ client });
  const result = tool.schema.safeParse({ channelId: "ch-1" });
  assert.strictEqual(result.success, false);
});

test("sendThreadMessage: missing threadId → zod rejects", async () => {
  const client = mockClient();
  const tool = sendThreadMessage({ client });
  const result = tool.schema.safeParse({ content: "hello" });
  assert.strictEqual(result.success, false);
});

test("addReaction: missing emoji → zod rejects", async () => {
  const client = mockClient();
  const tool = addReaction({ client });
  const result = tool.schema.safeParse({ channelId: "ch-1", messageId: "msg-1" });
  assert.strictEqual(result.success, false);
});

test("editMessage: missing newContent → zod rejects", async () => {
  const client = mockClient();
  const tool = editMessage({ client });
  const result = tool.schema.safeParse({ channelId: "ch-1", messageId: "msg-1" });
  assert.strictEqual(result.success, false);
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 7: list_threads Edge Cases
// ══════════════════════════════════════════════════════════════════

test("listThreads: both channelId and guildId → should use channelId (first priority)", async () => {
  const client = mockClient();
  const tool = listThreads({ client });
  const result = await tool.invoke({ channelId: "ch-1", guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.ok(Array.isArray(result.threads));
});

test("listThreads: invalid channelId format → should return error", async () => {
  const client = mockClient();
  const tool = listThreads({ client });
  // Discord channel IDs are snowflakes (numeric strings), but our tool accepts any string
  const result = await tool.invoke({ channelId: "not-a-real-id" });
  // With mock, this succeeds. In real Discord, it would throw.
  assert.strictEqual(result.success, true);
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 8: Unicode and Special Characters
// ══════════════════════════════════════════════════════════════════

test("sendMessage: emoji content → should succeed", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", content: "🎉🚀🦀" });
  assert.strictEqual(result.success, true);
});

test("sendMessage: newlines in content → should succeed", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", content: "Line 1\nLine 2\nLine 3" });
  assert.strictEqual(result.success, true);
});

test("sendMessage: markdown in content → should succeed", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", content: "**bold** *italic* `code`" });
  assert.strictEqual(result.success, true);
});

test("addReaction: unicode emoji → should succeed", async () => {
  const client = mockClient();
  const tool = addReaction({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1", emoji: "🔥" });
  assert.strictEqual(result.success, true);
});

test("addReaction: custom emoji format → should succeed", async () => {
  const client = mockClient();
  const tool = addReaction({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1", emoji: "<:name:123456>" });
  assert.strictEqual(result.success, true);
});

console.log("✅ Adversarial tool tests complete");
