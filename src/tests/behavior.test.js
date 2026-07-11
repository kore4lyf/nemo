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
import { extractContext } from "../discord/context.js";

// ── Mock Discord client ────────────────────────────────────────────
function mockClient(overrides = {}) {
  const sent = [];
  const threads = [];

  // Fake permission bitfield — all permissions enabled
  const ALL_PERMS = 0x1FFFFFFFFFFFFFn;
  const fakeMember = {
    id: "bot-123",
    permissions: {
      has: () => true,
      bitfield: ALL_PERMS,
    },
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
          members: {
            resolve: (userId) => (userId === "bot-123" ? fakeMember : null),
          },
        },
        messages: {
          fetch: async (msgId) => ({
            id: msgId || "msg-123",
            author: { id: "bot-123", username: "Nemo" },
            pin: async function () { this.pinned = true; },
            unpin: async function () { this.unpinned = true; },
            delete: async function () { this.deleted = true; },
            edit: async function (c) { this.content = c; },
            react: async function (e) { this.reactions = e; },
            pinned: false,
          }),
        },
        send: async (opts) => {
          const msg = { id: `msg-${sent.length}`, content: opts.content || opts };
          sent.push(msg);
          return msg;
        },
        threads: {
          create: async (opts) => {
            const thread = { id: `thread-${threads.length}`, name: opts.name, send: async (c) => ({ id: "msg-t", content: c }) };
            threads.push(thread);
            return thread;
          },
          fetchActive: async () => ({
            threads: [{ id: "t-1", name: "active-thread", memberCount: 3, messageCount: 5 }],
          }),
        },
        ...overrides,
      }),
    },
    guilds: {
      fetch: async () => ({
        threads: {
          fetchActive: async () => ({
            threads: [{ id: "t-2", name: "guild-thread", memberCount: 2, messageCount: 3 }],
          }),
        },
      }),
    },
    _sent: sent,
    _threads: threads,
  };
}

// ── Tool behavior tests ────────────────────────────────────────────

test("sendMessage returns success with messageId", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", content: "hello" });
  assert.strictEqual(result.success, true);
  assert.ok(result.messageId);
});

test("sendMessage fails with empty channelId", async () => {
  const client = mockClient();
  const tool = sendMessage({ client });
  try {
    await tool.invoke({ channelId: "", content: "hello" });
    assert.fail("Should have thrown for empty channelId");
  } catch (err) {
    assert.ok(err.message.includes("Invalid input") || err.message.includes(" Too small"));
  }
});

test("pinMessage returns success", async () => {
  const client = mockClient();
  const tool = pinMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1" });
  assert.strictEqual(result.success, true);
});

test("unpinMessage returns success", async () => {
  const client = mockClient();
  const tool = unpinMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1" });
  assert.strictEqual(result.success, true);
});

test("createThread returns threadId", async () => {
  const client = mockClient();
  const tool = createThread({ client });
  const result = await tool.invoke({ channelId: "ch-1", name: "Sprint Planning" });
  assert.strictEqual(result.success, true);
  assert.ok(result.threadId);
});

test("sendThreadMessage returns messageId", async () => {
  const client = mockClient();
  const tool = sendThreadMessage({ client });
  const result = await tool.invoke({ threadId: "t-1", content: "Let's discuss" });
  assert.strictEqual(result.success, true);
  assert.ok(result.messageId);
});

test("addReaction returns success", async () => {
  const client = mockClient();
  const tool = addReaction({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1", emoji: "👍" });
  assert.strictEqual(result.success, true);
});

test("deleteMessage returns success", async () => {
  const client = mockClient();
  const tool = deleteMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1" });
  assert.strictEqual(result.success, true);
});

test("editMessage returns success", async () => {
  const client = mockClient();
  const tool = editMessage({ client });
  const result = await tool.invoke({ channelId: "ch-1", messageId: "msg-1", newContent: "Updated" });
  assert.strictEqual(result.success, true);
});

test("getChannelInfo returns channel metadata", async () => {
  const client = mockClient();
  const tool = getChannelInfo({ client });
  const result = await tool.invoke({ channelId: "ch-1" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.id, "ch-1");
  assert.strictEqual(result.name, "test-channel");
  assert.strictEqual(result.memberCount, 10);
});

test("listThreads returns threads by channelId", async () => {
  const client = mockClient();
  const tool = listThreads({ client });
  const result = await tool.invoke({ channelId: "ch-1" });
  assert.strictEqual(result.success, true);
  assert.ok(Array.isArray(result.threads));
  assert.strictEqual(result.threads[0].name, "active-thread");
});

test("listThreads returns threads by guildId", async () => {
  const client = mockClient();
  const tool = listThreads({ client });
  const result = await tool.invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.ok(Array.isArray(result.threads));
  assert.strictEqual(result.threads[0].name, "guild-thread");
});

test("listThreads fails without channelId or guildId", async () => {
  const client = mockClient();
  const tool = listThreads({ client });
  const result = await tool.invoke({});
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes("required"));
});

// ── Context extraction behavior ────────────────────────────────────

test("extractContext returns full context from real-like message", () => {
  const message = {
    id: "msg-456",
    content: "Pin this message",
    author: { username: "korede", id: "user-789" },
    channel: { id: "ch-100", name: "general" },
    guild: { id: "g-200" },
    mentions: { users: { map: (fn) => [{ id: "u-1", username: "alice" }].map(fn) } },
  };

  const context = extractContext({ client: {}, message });
  assert.strictEqual(context.currentChannel.id, "ch-100");
  assert.strictEqual(context.currentChannel.name, "general");
  assert.strictEqual(context.currentChannel.guildId, "g-200");
  assert.strictEqual(context.currentMessage.id, "msg-456");
  assert.strictEqual(context.currentMessage.author, "korede");
  assert.strictEqual(context.currentMessage.content, "Pin this message");
  assert.strictEqual(context.mentionedUsers[0].name, "alice");
});

test("extractContext handles partial message gracefully", () => {
  const context = extractContext({ client: null, message: null });
  assert.strictEqual(context.currentChannel, null);
  assert.strictEqual(context.currentMessage, null);
  assert.deepStrictEqual(context.mentionedUsers, []);
});

console.log("✅ All behavior tests passed!");
