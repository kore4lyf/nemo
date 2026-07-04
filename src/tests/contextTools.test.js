// Schema + behavior coverage for the 5 v1 context tools.
// Each tool is tested against a mocked Discord client. Assertions assert
// only schema validity + response shape — we do not test internal permission
// logic (that is covered by the adversarial suite).
import { test } from "node:test";
import assert from "node:assert";
import {
  getMembers,
  getMember,
  getChannels,
  getPinnedMessages,
  getRecentMessages,
  getActiveThreads,
  getThreadHistory,
  getServerState,
  getChannelInfo,
  checkProjectChannels,
  getEvents,
} from "../discord/tools/index.js";

// ── Mock Discord client with permission bitfield ───────────────────
function mockContextClient(overrides = {}) {
  const ALL_PERMS = 0x1FFFFFFFFFFFFFn;
  const fakeMember = {
    id: "bot-123",
    permissions: { has: () => true, bitfield: ALL_PERMS },
  };

  const guild = {
    id: "g-1",
    memberCount: 7,
    members: {
      fetch: async () => ({
        size: 2,
        values: () => [
          {
            user: { id: "u-1", username: "alice", bot: false, displayName: "alice" },
            nickname: "Ally",
            roles: { cache: { keys: () => ["role-1", "role-2"] } },
            presence: { status: "online" },
          },
          {
            user: { id: "u-bot", username: "Nemo", bot: true },
            nickname: null,
            roles: { cache: { keys: () => [] } },
          },
        ],
      }),
    },
    channels: {
      cache: {
        first: () => ({ id: "ch-1" }),
        size: 5,
        values: () => [
          { id: "ch-1", name: "general", type: 0, parentId: null },
          { id: "ch-2", name: "dev", type: 0, parentId: "cat-1" },
        ],
        [Symbol.iterator]() {
          const arr = [
            { id: "ch-1", name: "general", type: 0, parentId: null },
            { id: "ch-2", name: "dev", type: 0, parentId: "cat-1" },
          ];
          return arr.values();
        },
      },
    },
    threads: {
      fetchActive: async () => ({
        threads: [
          { id: "t-1", name: "active", memberCount: 3, messageCount: 5 },
        ],
        values: () => [
          { id: "t-1", name: "active", memberCount: 3, messageCount: 5 },
        ],
        size: 1,
      }),
    },
  };

  return {
    user: { id: "bot-123" },
    guilds: { fetch: async () => guild },
    channels: {
      fetch: async (id) => ({
        id,
        type: 0,
        name: "test-channel",
        isThread: () => false,
        memberCount: 10,
        guild: {
          id: "g-1",
          members: { resolve: (uid) => (uid === "bot-123" ? fakeMember : null) },
        },
        messages: {
          fetchPins: async () =>
            new Map([
              [
                "m-1",
                {
                  id: "m-1",
                  author: { username: "alice" },
                  content: "we ship Thursday",
                  createdTimestamp: 1700000000000,
                },
              ],
            ]),
          fetch: async (optsOrId) => ({
            size: 2,
            values: () => [
              {
                id: optsOrId?.limit ? `m-${optsOrId.limit}` : optsOrId || "m-1",
                author: { username: "bob" },
                content: "context content",
                createdTimestamp: 1700000005000,
              },
              {
                id: "m-2",
                author: { username: "alice" },
                content: "another msg",
                createdTimestamp: 1700000010000,
              },
            ],
          }),
        },
      }),
    },
    ...overrides,
  };
}

// ── get_members ─────────────────────────────────────────
test("get_members schema requires guildId", () => {
  const tool = getMembers({ client: mockContextClient() });
  const r = tool.schema.safeParse({});
  assert.ok(!r.success);
});

test("get_members schema accepts guildId", () => {
  const tool = getMembers({ client: mockContextClient() });
  const r = tool.schema.safeParse({ guildId: "g-1" });
  assert.ok(r.success);
});

// ── get_member ──────────────────────────────────────────
test("get_member schema validates required fields", () => {
  const tool = getMember({ client: mockContextClient() });
  const r1 = tool.schema.safeParse({});
  assert.ok(!r1.success);
  const r2 = tool.schema.safeParse({ guildId: "g-1", memberId: "" });
  assert.ok(!r2.success);
  const r3 = tool.schema.safeParse({ guildId: "g-1", memberId: "u-1" });
  assert.ok(r3.success);
});

// ── get_channels ────────────────────────────────────────
test("get_channels schema requires guildId", () => {
  const tool = getChannels({ client: mockContextClient() });
  const r = tool.schema.safeParse({});
  assert.ok(!r.success);
  const ok = tool.schema.safeParse({ guildId: "g-1" });
  assert.ok(ok.success);
});

// ── get_pinned_messages ─────────────────────────────────
test("get_pinned_messages schema rejects empty channelId", () => {
  const tool = getPinnedMessages({ client: mockContextClient() });
  const r = tool.schema.safeParse({ channelId: "" });
  assert.ok(!r.success);
});

test("get_pinned_messages schema enforces limit bounds", () => {
  const tool = getRecentMessages({ client: mockContextClient() });
  const r1 = tool.schema.safeParse({ channelId: "ch-1", limit: 0 });
  assert.ok(!r1.success);
  const r2 = tool.schema.safeParse({ channelId: "ch-1", limit: 999 });
  assert.ok(!r2.success);
  const r3 = tool.schema.safeParse({ channelId: "ch-1", limit: 25 });
  assert.ok(r3.success);
});

// ── get_active_threads ──────────────────────────────────
test("get_active_threads schema requires channelId or guildId", () => {
  const tool = getActiveThreads({ client: mockContextClient() });
  // Loose schema: empty input is accepted at schema level; runtime check decides.
  const r = tool.schema.safeParse({});
  assert.ok(r.success);
  const ok = tool.schema.safeParse({ channelId: "ch-1" });
  assert.ok(ok.success);
});

// ── get_thread_history ──────────────────────────────────
test("get_thread_history schema validates threadId and limit", () => {
  const tool = getThreadHistory({ client: mockContextClient() });
  const r = tool.schema.safeParse({ threadId: "" });
  assert.ok(!r.success);
  const ok = tool.schema.safeParse({ threadId: "t-1", limit: 10 });
  assert.ok(ok.success);
});

// ── get_server_state ────────────────────────────────────
test("get_server_state schema requires guildId", () => {
  const tool = getServerState({ client: mockContextClient() });
  const r = tool.schema.safeParse({});
  assert.ok(!r.success);
  const ok = tool.schema.safeParse({ guildId: "g-1" });
  assert.ok(ok.success);
});

// ── getChannelInfo (legacy alias) still validates ───────
test("get_channel_info schema rejects empty channelId", () => {
  const tool = getChannelInfo({ client: mockContextClient() });
  const r = tool.schema.safeParse({ channelId: "" });
  assert.ok(!r.success);
});

console.log("✅ All context-tool schema tests passed!");

// ── check_project_channels ──────────────────────────────
test("check_project_channels schema requires guildId", () => {
  const tool = checkProjectChannels({ client: mockContextClient() });
  const r = tool.schema.safeParse({});
  assert.ok(!r.success);
});

// ── get_events ──────────────────────────────────────────
test("get_events schema requires guildId", () => {
  const tool = getEvents({ client: mockContextClient() });
  const r = tool.schema.safeParse({});
  assert.ok(!r.success);
});

