// Schema + behavior coverage for the context tools.
// Each tool is tested against a mocked Discord client. Assertions assert
// only schema validity + response shape — we do not test internal permission
// logic (that is covered by the adversarial suite).
import { test } from "node:test";
import assert from "node:assert";
import {
  getMembers,
  getChannels,
  getPinnedMessages,
  getRecentMessages,
  getActiveThreads,
  getThreadHistory,
  getServerState,
  getChannelInfo,
  checkProjectChannels,
  getEvents,
  getMilestones,
  getIntroduction,
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
      resolve: (id) => (id === "bot-123" ? fakeMember : null),
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

function createSweepMessages(items) {
  return {
    size: items.length,
    values: () => items,
    last: () => items[items.length - 1] || null,
  };
}

/*
 * Build a Discord-like paginator over a fixed list of messages.
 *
 * Models the contract `sweepChannelByName` relies on:
 *   - fetch({ limit, before: null }) → the oldest batch (Discord orders newest-first;
 *     we return items in declaration order).
 *   - fetch({ limit, before: <id> })   → the batch older than <id>.
 *   - fetch on an exhausted channel    → size:0 (the sweep loop's exit condition).
 *
 * Pure function of `opts.before` — NO toggled boolean, NO shared mutable
 * state across calls or tests. This is the fix for the heap-blowup that
 * happened when the previous mock returned the same page on every call and
 * never produced size:0, sending sweepChannelByName into an infinite loop.
 *
 * Items can carry any string id the test wants; pagination walks the array
 * by index (the position is the cursor), so ids don't have to be sortable
 * snowflakes. The exposed item.id is whatever the test set.
 */
function createMessagePaginator(items) {
  // Cursor state: the index of the next-oldest message to return.
  // Start at 0 (oldest-first). 'before' is an item id; we map it back to a
  // position by looking it up in the items array.
  const idToIndex = new Map(items.map((m, i) => [m.id, i]));
  let nextPos = 0;

  return async function fetch(opts = {}) {
    const { before } = opts;
    if (before != null) {
      const idx = idToIndex.get(before);
      // If before points at the oldest item, idx === 0 and there's nothing older.
      // If unknown id, treat as exhausted too (real Discord returns empty).
      nextPos = idx === undefined ? items.length : idx + 1;
    }
    const slice = items.slice(nextPos, nextPos + 100);
    return createSweepMessages(slice);
  };
}

function mockSweepClient({ channels, channelMessages } = {}) {
  const ALL_PERMS = 0x1FFFFFFFFFFFFFn;
  const defaultChannels = [
    { id: "ch-milestones", name: "milestones", type: 0 },
    { id: "ch-intro", name: "introduction", type: 0 },
  ];
  const channelList = channels ?? defaultChannels;

  const enriched = channelList.map((c) => {
    const contentList = (channelMessages && channelMessages[c.name]) || [];
    const items = contentList.map((content, idx) => ({
      id: `m-${c.name}-${idx}`,
      author: { username: `user-${idx}`, id: `${100000000000000000 + idx}` },
      content,
      createdTimestamp: 1700000000000 + idx,
    }));
    const fetch = createMessagePaginator(items);
    return {
      ...c,
      messages: {
        fetch: async (opts) => fetch(opts),
      },
    };
  });

  const guild = {
    id: "g-1",
    channels: {
      cache: {
        values: () => enriched,
        [Symbol.iterator]() {
          return enriched.values();
        },
        first: () => enriched[0],
      },
    },
  };

  return {
    user: { id: "bot-123" },
    guilds: { fetch: async () => guild },
    channels: {
      fetch: async (id) => {
        const found = enriched.find((c) => c.id === id);
        if (!found) return null;
        return {
          id: found.id,
          type: 0,
          name: found.name,
          guild: {
            id: "g-1",
            members: {
              resolve: () => ({
                id: "bot-123",
                permissions: { has: () => true, bitfield: ALL_PERMS },
              }),
            },
          },
          messages: { fetch: async (opts) => found.messages.fetch(opts) },
        };
      },
    },
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

test("get_members schema accepts optional memberId", () => {
  const tool = getMembers({ client: mockContextClient() });
  const r = tool.schema.safeParse({ guildId: "g-1", memberId: "u-1" });
  assert.ok(r.success);
});

test("get_members schema accepts optional query", () => {
  const tool = getMembers({ client: mockContextClient() });
  const r = tool.schema.safeParse({ guildId: "g-1", query: "alice" });
  assert.ok(r.success);
});

// ── get_milestones ──────────────────────────────────────
test("get_milestones schema requires guildId", () => {
  const tool = getMilestones({ client: mockSweepClient() });
  const r = tool.schema.safeParse({});
  assert.ok(!r.success);
});

test("get_milestones schema accepts guildId", () => {
  const tool = getMilestones({ client: mockSweepClient() });
  const r = tool.schema.safeParse({ guildId: "g-1" });
  assert.ok(r.success);
});

test("get_milestones: no args returns all messages", async () => {
  const client = mockSweepClient({
    channelMessages: {
      milestones: ["#1 Ship", "#2 Launch"],
      introduction: ["Hi I'm Alice"],
    },
  });
  const result = await getMilestones({ client }).invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.milestones.length, 2);
  assert.strictEqual(result.scanned, 2);
});

test("get_milestones: query filters by content", async () => {
  const client = mockSweepClient({
    channelMessages: {
      milestones: ["#1 Ship", "#2 Launch", "#3 Grow"],
    },
  });
  const result = await getMilestones({ client }).invoke({
    guildId: "g-1",
    query: "launch",
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.milestones.length, 1);
  assert.ok(result.milestones[0].content.toLowerCase().includes("launch"));
});

test("get_milestones: author filters by username", async () => {
  const byUser = await getMilestones({ client: mockSweepClient({
    channelMessages: {
      milestones: [
        "from user-0",
        "from user-1",
      ],
    },
  })}).invoke({
    guildId: "g-1",
    author: "user-0",
  });
  assert.strictEqual(byUser.success, true);
  assert.strictEqual(byUser.milestones.length, 1);
  assert.ok(byUser.milestones[0].content.includes("user-0"));
});

test('get_milestones: author filters by user id', async () => {
  const TWO_ITEMS = [
    { id: 'm-0', author: { username: 'user-0', id: '100000000000000000' }, content: 'from user-0', createdTimestamp: 1700000000000 },
    { id: 'm-1', author: { username: 'user-1', id: '100000000000000001' }, content: 'from user-1', createdTimestamp: 1700000001000 },
  ];
  const paginateMessages = {
    fetch: async (opts) => {
      if (opts && opts.before) {
        return { size: 0, values: () => [], last: () => null };
      }
      return {
        size: 2,
        values: () => TWO_ITEMS,
        last: () => TWO_ITEMS[TWO_ITEMS.length - 1],
      };
    },
  };
  const client = {
    user: { id: 'bot-123' },
    guilds: {
      fetch: async () => ({
        id: 'g-1',
        channels: {
          cache: {
            values: () => [
              { id: 'ch-milestones', name: 'milestones', type: 0, messages: paginateMessages },
            ],
            first: () => ({ id: 'ch-milestones' }),
          },
        },
      }),
    },
    channels: {
      fetch: async () => ({
        id: 'ch-milestones',
        guild: {
          id: 'g-1',
          members: {
            resolve: () => ({
              id: 'bot-123',
              permissions: { has: () => true, bitfield: 0x1FFFFFFFFFFFFFn },
            }),
          },
        },
        messages: paginateMessages,
      }),
    },
  };
  const byId = await getMilestones({ client }).invoke({
    guildId: 'g-1',
    author: '100000000000000001',
  });
  assert.strictEqual(byId.success, true);
  assert.strictEqual(byId.milestones.length, 1);
  assert.ok(byId.milestones[0].content.includes('user-1'));
});

test("get_milestones: empty result returns success with empty array", async () => {
  const client = mockSweepClient({
    channelMessages: { milestones: [] },
  });
  const result = await getMilestones({ client }).invoke({
    guildId: "g-1",
    query: "nothing",
  });
  assert.strictEqual(result.success, true);
  assert.deepEqual(result.milestones, []);
});

test("get_milestones: channel not found returns error", async () => {
  const client = mockSweepClient({
    channels: [{ id: "ch-1", name: "general", type: 0 }],
  });
  const result = await getMilestones({ client }).invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes("Milestones channel not found"));
});

// ── get_introduction ────────────────────────────────────
test("get_introduction schema requires guildId", () => {
  const tool = getIntroduction({ client: mockSweepClient() });
  const r = tool.schema.safeParse({});
  assert.ok(!r.success);
});

test("get_introduction schema accepts guildId", () => {
  const tool = getIntroduction({ client: mockSweepClient() });
  const r = tool.schema.safeParse({ guildId: "g-1" });
  assert.ok(r.success);
});

test("get_introduction: no args returns all messages", async () => {
  const client = mockSweepClient({
    channelMessages: {
      milestones: [],
      introduction: ["Hi I'm Alice", "Hi I'm Bob"],
    },
  });
  const result = await getIntroduction({ client }).invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.introductions.length, 2);
  assert.strictEqual(result.scanned, 2);
});

test("get_introduction: query and author filters together", async () => {
  const client = mockSweepClient({
    channelMessages: {
      introduction: [
        "Alice loves Rust",
        "Bob loves JS",
        "Alice also loves AI",
      ],
    },
  });
  const result = await getIntroduction({ client }).invoke({
    guildId: "g-1",
    author: "user-0",
    query: "rust",
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.introductions.length, 1);
});

test("get_introduction: empty result returns success with empty array", async () => {
  const client = mockSweepClient({
    channelMessages: { introduction: [] },
  });
  const result = await getIntroduction({ client }).invoke({
    guildId: "g-1",
    query: "unknown",
  });
  assert.strictEqual(result.success, true);
  assert.deepEqual(result.introductions, []);
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
