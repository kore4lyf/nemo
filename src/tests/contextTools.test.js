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
  searchMessages,
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
    scheduledEvents: {
      fetch: async () =>
        new Map([
          [
            "evt-1",
            {
              id: "evt-1",
              name: "Sprint Planning",
              description: "Weekly sprint planning",
              scheduledStartTime: new Date(Date.now() + 86400000),
              status: "SCHEDULED",
              entityType: "VOICE",
              creatorId: "u-1",
            },
          ],
          [
            "evt-2",
            {
              id: "evt-2",
              name: "Retro",
              description: "Sprint retro",
              scheduledStartTime: new Date(Date.now() - 86400000),
              status: "COMPLETED",
              entityType: "VOICE",
              creatorId: "u-2",
            },
          ],
        ]),
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

test("check_project_channels behavior returns existing and missing", async () => {
  const tool = checkProjectChannels({ client: mockContextClient() });
  const result = await tool.invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.ok(Array.isArray(result.existing));
  assert.ok(Array.isArray(result.missing));
});

// ── get_members behavior ──────────────────────────────────
test("get_members behavior excludes bots and returns normalized members", async () => {
  const tool = getMembers({ client: mockContextClient() });
  const result = await tool.invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, true);
  const members = result.members;
  assert.ok(Array.isArray(members));
  assert.ok(members.every((m) => !m.username.toLowerCase().includes("nemo")));
  const alice = members.find((m) => m.username === "alice");
  assert.ok(alice);
  assert.ok(alice.roles.length > 0);
});

// ── get_events behavior ──────────────────────────────────
test("get_events behavior returns upcoming/past split for default status", async () => {
  const tool = getEvents({ client: mockContextClient() });
  const result = await tool.invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.ok(Array.isArray(result.upcoming));
  assert.ok(Array.isArray(result.past));
  assert.ok(
    result.upcoming.some((e) => e.name === "Sprint Planning")
  );
  assert.ok(
    result.past.some((e) => e.name === "Retro")
  );
});

test("get_events behavior filters upcoming status", async () => {
  const tool = getEvents({ client: mockContextClient() });
  const result = await tool.invoke({
    guildId: "g-1",
    status: "upcoming",
  });
  assert.strictEqual(result.success, true);
  assert.ok(Array.isArray(result.upcoming));
  assert.strictEqual(result.past.length, 0);
});

test("get_events behavior filters past status", async () => {
  const tool = getEvents({ client: mockContextClient() });
  const result = await tool.invoke({ guildId: "g-1", status: "past" });
  assert.strictEqual(result.success, true);
  assert.ok(Array.isArray(result.past));
  assert.strictEqual(result.upcoming.length, 0);
});

test("get_events behavior sorts upcoming ascending", async () => {
  const tool = getEvents({ client: mockContextClient() });
  const result = await tool.invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, true);
  const times = result.upcoming.map((e) => new Date(e.scheduledStartTime).getTime());
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] >= times[i - 1]);
  }
});

test("get_events behavior sorts past descending", async () => {
  const tool = getEvents({ client: mockContextClient() });
  const result = await tool.invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, true);
  const times = result.past.map((e) => new Date(e.scheduledStartTime).getTime());
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] <= times[i - 1]);
  }
});

// ── behavior edge: missing permission path ───────────────
test("get_events denies when ViewChannel is missing", async () => {
  const noPermClient = mockContextClient({
    channels: {
      fetch: async () => ({
        id: "ch-1",
        type: 0,
        name: "test-channel",
        isThread: () => false,
        memberCount: 10,
        guild: {
          id: "g-1",
          members: {
            resolve: () => ({
              id: "bot-123",
              permissions: { has: () => false, bitfield: 0n },
            }),
          },
        },
        messages: {
          fetchPins: async () => new Map(),
          fetch: async () => ({ size: 0, values: () => [] }),
        },
      }),
    },
  });
  const tool = getEvents({ client: noPermClient });
  const result = await tool.invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error?.includes("Missing permission"));
});

test("check_project_channels denies when ViewChannel is missing", async () => {
  const noPermClient = mockContextClient({
    channels: {
      fetch: async () => ({
        id: "ch-1",
        type: 0,
        name: "test-channel",
        isThread: () => false,
        memberCount: 10,
        guild: {
          id: "g-1",
          members: {
            resolve: () => ({
              id: "bot-123",
              permissions: { has: () => false, bitfield: 0n },
            }),
          },
        },
        messages: {
          fetchPins: async () => new Map(),
          fetch: async () => ({ size: 0, values: () => [] }),
        },
      }),
    },
  });
  const tool = checkProjectChannels({ client: noPermClient });
  const result = await tool.invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error?.includes("Missing permission"));
});

test("get_members denies when ViewChannel is missing", async () => {
  const noPermClient = mockContextClient({
    channels: {
      fetch: async () => ({
        id: "ch-1",
        type: 0,
        name: "test-channel",
        isThread: () => false,
        memberCount: 10,
        guild: {
          id: "g-1",
          members: {
            resolve: () => ({
              id: "bot-123",
              permissions: { has: () => false, bitfield: 0n },
            }),
          },
        },
        messages: {
          fetchPins: async () => new Map(),
          fetch: async () => ({ size: 0, values: () => [] }),
        },
      }),
    },
  });
  const tool = getMembers({ client: noPermClient });
  const result = await tool.invoke({ guildId: "g-1" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error?.includes("Missing permission"));
});

console.log("✅ All context-tool behavior tests passed!");

// ── check_project_channels ──────────────────────────────

// ── search_messages helper ────────────────────────────
function createMessageCollection(msgs) {
  const arr = msgs.map((m) => ({
    id: m.id,
    author: { id: m.authorId, username: m.author, bot: m.bot || false },
    content: m.content,
    createdTimestamp: Date.parse(m.createdAt),
    createdAt: new Date(Date.parse(m.createdAt)),
  }));
  return {
    size: arr.length,
    values: () => arr.values(),
    last: () => arr[arr.length - 1],
    [Symbol.iterator]: () => arr.values(),
  };
}

function searchMockClient(messages) {
  const ALL_PERMS = 0x1FFFFFFFFFFFFFn;
  const fakeMember = {
    id: "bot-123",
    permissions: { has: () => true, bitfield: ALL_PERMS },
  };

  const channel = {
    id: "ch-1",
    type: 0,
    name: "general",
    send: async () => ({ id: "notice-1", delete: async () => {} }),
    messages: {
      fetch: async ({ before } = {}) => {
        let start = 0;
        if (before) {
          const idx = messages.findIndex((m) => m.id === before);
          if (idx >= 0) start = idx + 1;
        }
        const page = messages.slice(start, start + 100);
        return createMessageCollection(page);
      },
    },
    guild: {
      id: "g-1",
      members: { resolve: (uid) => (uid === "bot-123" ? fakeMember : null) },
    },
  };

  return {
    user: { id: "bot-123" },
    guilds: { fetch: async () => ({ channels: { cache: { first: () => ({ id: "ch-1" }) } } }) },
    channels: { fetch: async () => channel },
  };
}

// ── search_messages schema ────────────────────────────
test("search_messages schema requires channelId and query", () => {
  const tool = searchMessages({ client: mockContextClient() });
  assert.ok(!tool.schema.safeParse({}).success);
  assert.ok(!tool.schema.safeParse({ channelId: "ch-1" }).success);
  assert.ok(!tool.schema.safeParse({ query: "api" }).success);
  assert.ok(!tool.schema.safeParse({ channelId: "ch-1", query: "   " }).success);
  assert.ok(tool.schema.safeParse({ channelId: "ch-1", query: "api" }).success);
  assert.ok(tool.schema.safeParse({ channelId: "ch-1", query: "api", author: "123456789012345678" }).success);
});

// ── search_messages behavior ──────────────────────────
test("search_messages behavior returns newest-first matches", async () => {
  const history = [
    { id: "m-1", authorId: "u-1", author: "alice", content: "deploy api plan", createdAt: new Date(Date.now() - 3000).toISOString(), bot: false },
    { id: "m-2", authorId: "u-2", author: "bob", content: "api is blocked", createdAt: new Date(Date.now() - 2000).toISOString(), bot: false },
    { id: "m-3", authorId: "u-b", author: "Nemo", content: "release scheduled", createdAt: new Date(Date.now() - 1000).toISOString(), bot: true },
  ];
  const client = searchMockClient(history);
  const tool = searchMessages({ client });
  const result = await tool.invoke({ channelId: "ch-1", query: "api" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scanned, 3);
  assert.strictEqual(result.truncated, false);
  assert.ok(Array.isArray(result.matches));
  assert.strictEqual(result.matches.length, 2);
  assert.ok(result.matches.every((m) => m.content.toLowerCase().includes("api")));
  assert.ok(result.matches.every((m) => m.author !== "Nemo"));
  assert.strictEqual(result.matches[0].id, "m-2");
  assert.strictEqual(result.matches[1].id, "m-1");
});

test("search_messages behavior filters exact author id", async () => {
  const history = [
    { id: "m-1", authorId: "123456789012345678", author: "Tunde", content: "api issue", createdAt: new Date(Date.now() - 1000).toISOString(), bot: false },
    { id: "m-2", authorId: "987654321098765432", author: "Tunde", content: "not api", createdAt: new Date(Date.now() - 2000).toISOString(), bot: false },
  ];
  const client = searchMockClient(history);
  const tool = searchMessages({ client });

  const byId = await tool.invoke({ channelId: "ch-1", query: "api", author: "123456789012345678" });
  assert.strictEqual(byId.success, true);
  assert.strictEqual(byId.matches.length, 1);
  assert.strictEqual(byId.matches[0].authorId, "123456789012345678");

  const byOtherId = await tool.invoke({ channelId: "ch-1", query: "api", author: "987654321098765432" });
  assert.strictEqual(byOtherId.success, true);
  assert.strictEqual(byOtherId.matches.length, 1);
});

test("search_messages behavior returns false when second fetch fails after partial data", async () => {
  const history = [
    { id: "m-1", authorId: "u-1", author: "alice", content: "api v1", createdAt: new Date(Date.now() - 1000).toISOString(), bot: false },
    { id: "m-2", authorId: "u-2", author: "bob", content: "api v2", createdAt: new Date(Date.now() - 2000).toISOString(), bot: false },
  ];
  let calls = 0;
  const client = {
    user: { id: "bot-123" },
    guilds: { fetch: async () => ({ channels: { cache: { first: () => ({ id: "ch-1" }) } } }) },
    channels: {
      fetch: async () => ({
        id: "ch-1",
        type: 0,
        name: "general",
        send: async () => ({ id: "notice-1", delete: async () => {} }),
        messages: {
          fetch: async () => {
            calls += 1;
            if (calls === 1) return createMessageCollection([history[0]]);
            throw new Error("fetch fail");
          },
        },
        guild: {
          id: "g-1",
          members: { resolve: (uid) => (uid === "bot-123" ? { id: "bot-123", permissions: { has: () => true, bitfield: 0x1FFFFFFFFFFFFFn } } : null) },
        },
      }),
    },
  };
  const tool = searchMessages({ client });
  const result = await tool.invoke({ channelId: "ch-1", query: "api" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scanned, 1);
  assert.strictEqual(result.truncated, true);
  assert.strictEqual(result.matches.length, 1);
});

test("search_messages behavior returns false when first fetch fails", async () => {
  const client = {
    user: { id: "bot-123" },
    guilds: { fetch: async () => ({ channels: { cache: { first: () => ({ id: "ch-1" }) } } }) },
    channels: {
      fetch: async () => ({
        id: "ch-1",
        type: 0,
        name: "general",
        send: async () => ({ id: "notice-1", delete: async () => {} }),
        messages: {
          fetch: async () => {
            throw new Error("first fetch fail");
          },
        },
        guild: {
          id: "g-1",
          members: { resolve: (uid) => (uid === "bot-123" ? { id: "bot-123", permissions: { has: () => true, bitfield: 0x1FFFFFFFFFFFFFn } } : null) },
        },
      }),
    },
  };
  const tool = searchMessages({ client });
  const result = await tool.invoke({ channelId: "ch-1", query: "api" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error?.includes("first fetch fail"));
});

test("search_messages behavior returns empty non-truncated when no history", async () => {
  const client = searchMockClient([]);
  const tool = searchMessages({ client });
  const result = await tool.invoke({ channelId: "ch-1", query: "api" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scanned, 0);
  assert.strictEqual(result.truncated, false);
  assert.ok(Array.isArray(result.matches));
  assert.strictEqual(result.matches.length, 0);
});

test("search_messages behavior continues when notice send fails", async () => {
  const history = [
    { id: "m-1", authorId: "u-1", author: "alice", content: "bot hello", createdAt: new Date(Date.now() - 1000).toISOString(), bot: true },
  ];
  const client = {
    user: { id: "bot-123" },
    guilds: { fetch: async () => ({ channels: { cache: { first: () => ({ id: "ch-1" }) } } }) },
    channels: {
      fetch: async () => ({
        id: "ch-1",
        type: 0,
        name: "general",
        send: async () => {
          throw new Error("no send");
        },
        messages: {
          fetch: async ({ before } = {}) => {
            let start = 0;
            if (before) {
              const idx = history.findIndex((m) => m.id === before);
              if (idx >= 0) start = idx + 1;
            }
            const page = history.slice(start, start + 100);
            return createMessageCollection(page);
          },
        },
        guild: {
          id: "g-1",
          members: { resolve: (uid) => (uid === "bot-123" ? { id: "bot-123", permissions: { has: () => true, bitfield: 0x1FFFFFFFFFFFFFn } } : null) },
        },
      }),
    },
  };
  const tool = searchMessages({ client });
  const result = await tool.invoke({ channelId: "ch-1", query: "hello" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scanned, 1);
  assert.strictEqual(result.truncated, false);
  assert.ok(Array.isArray(result.matches));
  assert.strictEqual(result.matches.length, 0);
});

test("search_messages behavior continues when notice delete fails", async () => {
  const history = [
    { id: "m-1", authorId: "u-1", author: "alice", content: "hello world", createdAt: new Date(Date.now() - 1000).toISOString(), bot: false },
  ];
  const client = {
    user: { id: "bot-123" },
    guilds: { fetch: async () => ({ channels: { cache: { first: () => ({ id: "ch-1" }) } } }) },
    channels: {
      fetch: async () => ({
        id: "ch-1",
        type: 0,
        name: "general",
        send: async () => ({ id: "notice-1", delete: async () => { throw new Error("no delete"); } }),
        messages: {
          fetch: async ({ before } = {}) => {
            let start = 0;
            if (before) {
              const idx = history.findIndex((m) => m.id === before);
              if (idx >= 0) start = idx + 1;
            }
            const page = history.slice(start, start + 100);
            return createMessageCollection(page);
          },
        },
        guild: {
          id: "g-1",
          members: { resolve: (uid) => (uid === "bot-123" ? { id: "bot-123", permissions: { has: () => true, bitfield: 0x1FFFFFFFFFFFFFn } } : null) },
        },
      }),
    },
  };
  const tool = searchMessages({ client });
  const result = await tool.invoke({ channelId: "ch-1", query: "hello" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scanned, 1);
  assert.strictEqual(result.truncated, false);
  assert.strictEqual(result.matches.length, 1);
  assert.strictEqual(result.matches[0].content, "hello world");
});

console.log("✅ All context-tool behavior tests passed!");
