/**
 * ADVERSARIAL TESTS — AGENT-CHANNEL-2 deliverable
 * Tools: check_project_channels, create_project_channels, get_events, get_members
 * Purpose: Find missing permission checks, wrong return shapes, edge cases.
 */
import { test } from "node:test";
import assert from "node:assert";
import { channelContext } from "../discord/tools/context/channels.js";
import { channelActions } from "../discord/tools/action/channels.js";
import { eventContext } from "../discord/tools/context/events.js";
import { memberContext } from "../discord/tools/context/members.js";

// ── Find tool definitions by name ──────────────────────────────────
const checkProjectDef = channelContext.find((d) => d.name === "check_project_channels");
const createProjectDef = channelActions.find((d) => d.name === "create_project_channels");
const getEventsDef = eventContext.find((d) => d.name === "get_events");
const getMembersDef = memberContext.find((d) => d.name === "get_members");

// ── Mock helpers ───────────────────────────────────────────────────

const V = 0x400n;  // ViewChannel
const M = 0x10n;   // ManageChannels

function makeGuild(overrides = {}) {
  return {
    id: "g-1",
    memberCount: 5,
    channels: {
      cache: {
        first: () => ({ id: "ch-1" }),
        values: () => overrides.channels ?? [
          { id: "ch-1", name: "general", type: 0, parentId: null },
          { id: "ch-2", name: "project", type: 0, parentId: null },
          { id: "ch-3", name: "introduction", type: 0, parentId: null },
        ],
        [Symbol.iterator]() {
          return (overrides.channels ?? [
            { id: "ch-1", name: "general", type: 0, parentId: null },
            { id: "ch-2", name: "project", type: 0, parentId: null },
            { id: "ch-3", name: "introduction", type: 0, parentId: null },
          ]).values();
        },
      },
      create: async ({ name, type }) => {
        const ch = { id: `new-${name}`, name, type };
        return ch;
      },
    },
    members: {
      fetch: async () => ({
        size: 3,
        values: () => overrides.members ?? [
          { user: { id: "u-1", username: "alice", bot: false }, nickname: "Ali", roles: { cache: { keys: () => ["r-1"] } }, presence: { status: "online" } },
          { user: { id: "u-2", username: "bob", bot: false }, nickname: null, roles: { cache: { keys: () => [] } }, presence: { status: "idle" } },
          { user: { id: "u-bot", username: "Nemo", bot: true }, nickname: null, roles: { cache: { keys: () => [] } } },
        ],
      }),
      resolve: (id) => (id === "bot-123" ? { id: "bot-123", permissions: { has: () => true, bitfield: 0x1FFFFFFFFFFFFFn } } : null),
    },
    scheduledEvents: {
      fetch: async () => ({
        size: overrides.events?.length ?? 0,
        values: () => overrides.events ?? [],
      }),
    },
  };
}

function makeClient(perms, guildOverrides = {}) {
  const guild = makeGuild(guildOverrides);
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
          members: {
            resolve: (uid) => (uid === "bot-123" ? {
              id: "bot-123",
              permissions: { has: (bit) => (perms & BigInt(bit)) !== 0n, bitfield: perms },
            } : null),
          },
        },
        messages: { fetch: async () => new Map() },
      }),
    },
  };
}

// ══════════════════════════════════════════════════════════════════
// 1. check_project_channels — behavior tests
// ══════════════════════════════════════════════════════════════════

test("check_project_channels: returns existing and missing", async () => {
  const client = makeClient(V);
  const result = await checkProjectDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.ok(Array.isArray(result.existing));
  assert.ok(Array.isArray(result.missing));
  // Our mock has "project" and "introduction" but not "milestones"
  const existingNames = result.existing.map((c) => c.name);
  const missingNames = result.missing.map((c) => c.name);
  assert.ok(existingNames.includes("project"));
  assert.ok(existingNames.includes("introduction"));
  assert.ok(missingNames.includes("milestones"));
});

test("check_project_channels: case-insensitive match", async () => {
  const client = makeClient(V, {
    channels: [
      { id: "ch-1", name: "Project", type: 0, parentId: null },
      { id: "ch-2", name: "MILESTONES", type: 0, parentId: null },
      { id: "ch-3", name: "Introduction", type: 0, parentId: null },
    ],
  });
  const result = await checkProjectDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.missing.length, 0, "All channels should match case-insensitively");
  assert.strictEqual(result.existing.length, 3);
});

test("check_project_channels: no channels exist → all missing", async () => {
  const client = makeClient(V, { channels: [] });
  const result = await checkProjectDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.existing.length, 0);
  assert.strictEqual(result.missing.length, 3);
});

test("check_project_channels: all channels exist → none missing", async () => {
  const client = makeClient(V, {
    channels: [
      { id: "ch-1", name: "project", type: 0 },
      { id: "ch-2", name: "milestones", type: 0 },
      { id: "ch-3", name: "introduction", type: 0 },
    ],
  });
  const result = await checkProjectDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.existing.length, 3);
  assert.strictEqual(result.missing.length, 0);
});

test("check_project_channels: partial name match should NOT count", async () => {
  // "project-general" should NOT match "project"
  const client = makeClient(V, {
    channels: [
      { id: "ch-1", name: "project-general", type: 0 },
      { id: "ch-2", name: "my-milestones", type: 0 },
      { id: "ch-3", name: "introduction-chat", type: 0 },
    ],
  });
  const result = await checkProjectDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  // None of these should match the exact required names
  assert.strictEqual(result.existing.length, 0, "Partial names should not match");
  assert.strictEqual(result.missing.length, 3);
});

test("check_project_channels: guild fetch fails → returns error", async () => {
  const client = makeClient(V);
  client.guilds.fetch = async () => { throw new Error("Guild not found"); };
  const result = await checkProjectDef.create(client, { guildId: "bad" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test("check_project_channels: no permission → returns error", async () => {
  const client = makeClient(0n); // No permissions at all
  const result = await checkProjectDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes("Missing permission"));
});

// ══════════════════════════════════════════════════════════════════
// 2. get_events — behavior tests
// ══════════════════════════════════════════════════════════════════

test("get_events: returns upcoming and past events", async () => {
  const client = makeClient(V, {
    events: [
      { id: "e-1", name: "Sprint Review", description: "review", scheduledStartTime: new Date("2026-07-10"), status: "SCHEDULED", entityType: "STAGE_INSTANCE", creatorId: "u-1" },
      { id: "e-2", name: "Old Meeting", description: "done", scheduledStartTime: new Date("2026-06-01"), status: "COMPLETED", entityType: "VOICE", creatorId: "u-2" },
    ],
  });
  const result = await getEventsDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.ok(Array.isArray(result.upcoming));
  assert.ok(Array.isArray(result.past));
  assert.strictEqual(result.upcoming.length, 1);
  assert.strictEqual(result.past.length, 1);
  assert.strictEqual(result.upcoming[0].name, "Sprint Review");
  assert.strictEqual(result.past[0].name, "Old Meeting");
});

test("get_events: status='upcoming' filters correctly", async () => {
  const client = makeClient(V, {
    events: [
      { id: "e-1", name: "Future", scheduledStartTime: new Date("2026-08-01"), status: "SCHEDULED" },
      { id: "e-2", name: "Active", scheduledStartTime: new Date("2026-07-04"), status: "ACTIVE" },
      { id: "e-3", name: "Past", scheduledStartTime: new Date("2026-06-01"), status: "COMPLETED" },
      { id: "e-4", name: "Canceled", scheduledStartTime: new Date("2026-06-15"), status: "CANCELED" },
    ],
  });
  const result = await getEventsDef.create(client, { guildId: "g-1", status: "upcoming" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.upcoming.length, 2, "SCHEDULED + ACTIVE should be upcoming");
  assert.strictEqual(result.past.length, 0, "past should be empty when filtering upcoming");
  const names = result.upcoming.map((e) => e.name);
  assert.ok(names.includes("Future"));
  assert.ok(names.includes("Active"));
});

test("get_events: status='past' filters correctly", async () => {
  const client = makeClient(V, {
    events: [
      { id: "e-1", name: "Future", scheduledStartTime: new Date("2026-08-01"), status: "SCHEDULED" },
      { id: "e-2", name: "Past", scheduledStartTime: new Date("2026-06-01"), status: "COMPLETED" },
      { id: "e-3", name: "Canceled", scheduledStartTime: new Date("2026-06-15"), status: "CANCELED" },
    ],
  });
  const result = await getEventsDef.create(client, { guildId: "g-1", status: "past" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.upcoming.length, 0);
  assert.strictEqual(result.past.length, 2, "COMPLETED + CANCELED should be past");
});

test("get_events: no events → empty arrays", async () => {
  const client = makeClient(V, { events: [] });
  const result = await getEventsDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.upcoming.length, 0);
  assert.strictEqual(result.past.length, 0);
});

test("get_events: upcoming sorted ascending by start time", async () => {
  const client = makeClient(V, {
    events: [
      { id: "e-1", name: "Later", scheduledStartTime: new Date("2026-08-01"), status: "SCHEDULED" },
      { id: "e-2", name: "Sooner", scheduledStartTime: new Date("2026-07-10"), status: "SCHEDULED" },
    ],
  });
  const result = await getEventsDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.upcoming[0].name, "Sooner");
  assert.strictEqual(result.upcoming[1].name, "Later");
});

test("get_events: past sorted descending by start time", async () => {
  const client = makeClient(V, {
    events: [
      { id: "e-1", name: "Older", scheduledStartTime: new Date("2026-05-01"), status: "COMPLETED" },
      { id: "e-2", name: "Newer", scheduledStartTime: new Date("2026-06-01"), status: "COMPLETED" },
    ],
  });
  const result = await getEventsDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.past[0].name, "Newer");
  assert.strictEqual(result.past[1].name, "Older");
});

test("get_events: guild fetch fails → returns error", async () => {
  const client = makeClient(V);
  client.guilds.fetch = async () => { throw new Error("Guild not found"); };
  const result = await getEventsDef.create(client, { guildId: "bad" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test("get_events: normalizeEvent handles missing fields", async () => {
  const client = makeClient(V, {
    events: [
      { id: "e-1", name: "Bare", scheduledStartTime: new Date("2026-07-10"), status: "SCHEDULED" },
    ],
  });
  const result = await getEventsDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.upcoming[0].description, null);
  assert.strictEqual(result.upcoming[0].entityType, null);
  assert.strictEqual(result.upcoming[0].creatorId, null);
});

// ══════════════════════════════════════════════════════════════════
// 3. get_members — behavior tests
// ══════════════════════════════════════════════════════════════════

test("get_members: excludes bots", async () => {
  const client = makeClient(V);
  const result = await getMembersDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.ok(Array.isArray(result.members));
  const usernames = result.members.map((m) => m.username);
  assert.ok(!usernames.includes("Nemo"), "Bot should be excluded");
  assert.ok(usernames.includes("alice"));
  assert.ok(usernames.includes("bob"));
});

test("get_members: all bots → empty array", async () => {
  const client = makeClient(V, {
    members: [
      { user: { id: "u-bot1", username: "Bot1", bot: true }, nickname: null, roles: { cache: { keys: () => [] } } },
      { user: { id: "u-bot2", username: "Bot2", bot: true }, nickname: null, roles: { cache: { keys: () => [] } } },
    ],
  });
  const result = await getMembersDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.members.length, 0);
});

test("get_members: no members → empty array", async () => {
  const client = makeClient(V, { members: [] });
  const result = await getMembersDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.members.length, 0);
});

test("get_members: returns roles as array of IDs", async () => {
  const client = makeClient(V);
  const result = await getMembersDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  const alice = result.members.find((m) => m.username === "alice");
  assert.ok(alice);
  assert.ok(Array.isArray(alice.roles));
  assert.ok(alice.roles.includes("r-1"));
});

test("get_members: displayName uses nickname fallback", async () => {
  const client = makeClient(V);
  const result = await getMembersDef.create(client, { guildId: "g-1" });
  const alice = result.members.find((m) => m.username === "alice");
  assert.strictEqual(alice.displayName, "Ali", "Should use nickname");
  const bob = result.members.find((m) => m.username === "bob");
  assert.strictEqual(bob.displayName, "bob", "Should fallback to username");
});

test("get_members: guild fetch fails → returns error", async () => {
  const client = makeClient(V);
  client.guilds.fetch = async () => { throw new Error("Guild not found"); };
  const result = await getMembersDef.create(client, { guildId: "bad" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test("get_members: no permission → returns error", async () => {
  const client = makeClient(0n);
  const result = await getMembersDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes("Missing permission"));
});

// ══════════════════════════════════════════════════════════════════
// 4. create_project_channels — additional edge cases
// ══════════════════════════════════════════════════════════════════

test("create_project_channels: empty channels array → nothing created, nothing skipped", async () => {
  const client = makeClient(V | M);
  const result = await createProjectDef.create(client, { guildId: "g-1", channels: [] });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.created.length, 0);
  assert.strictEqual(result.skipped.length, 0);
});

test("create_project_channels: all already exist → all skipped", async () => {
  const client = makeClient(V | M, {
    channels: [
      { id: "ch-1", name: "project", type: 0 },
      { id: "ch-2", name: "milestones", type: 0 },
      { id: "ch-3", name: "introduction", type: 0 },
    ],
  });
  const result = await createProjectDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.created.length, 0);
  assert.strictEqual(result.skipped.length, 3);
});

test("create_project_channels: invalid name in array → rejects", async () => {
  const client = makeClient(V | M);
  const result = await createProjectDef.create(client, { guildId: "g-1", channels: ["project", "hacked"] });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes("Invalid channel name"));
  assert.ok(result.error.includes("hacked"));
});

test("create_project_channels: case-insensitive skip", async () => {
  const client = makeClient(V | M, {
    channels: [{ id: "ch-1", name: "Project", type: 0 }],
  });
  const result = await createProjectDef.create(client, { guildId: "g-1", channels: ["project"] });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.skipped.length, 1);
  assert.strictEqual(result.created.length, 0);
});

test("create_project_channels: guild fetch fails → returns error", async () => {
  const client = makeClient(V | M);
  client.guilds.fetch = async () => { throw new Error("Guild not found"); };
  const result = await createProjectDef.create(client, { guildId: "bad" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test("create_project_channels: channel creation fails → returns error", async () => {
  const client = makeClient(V | M);
  client.guilds.fetch = async () => {
    const guild = makeGuild();
    guild.channels.create = async () => { throw new Error("Rate limited"); };
    return guild;
  };
  const result = await createProjectDef.create(client, { guildId: "g-1" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes("Rate limited"));
});

// ══════════════════════════════════════════════════════════════════
// 5. Permission bitfield verification
// ══════════════════════════════════════════════════════════════════

test("ManageChannels bitfield is correct (0x10n = 16)", async () => {
  const { PermissionsBitField } = await import("../discord/tools/shared/permissions.js");
  assert.strictEqual(PermissionsBitField["ManageChannels"], 0x10n);
});

test("ViewChannel bitfield is correct (0x400n = 1024)", async () => {
  const { PermissionsBitField } = await import("../discord/tools/shared/permissions.js");
  assert.strictEqual(PermissionsBitField["ViewChannel"], 0x400n);
});

test("MANAGE_CHANNELS maps to ManageChannels in TOOL_PERMISSIONS", async () => {
  const { TOOL_PERMISSIONS, TOOLS, PERMS } = await import("../config/constants.js");
  assert.strictEqual(TOOL_PERMISSIONS[TOOLS.CREATE_PROJECT_CHANNELS], PERMS.MANAGE_CHANNELS);
});

test("CHECK_PROJECT_CHANNELS maps to ViewChannel in TOOL_PERMISSIONS", async () => {
  const { TOOL_PERMISSIONS, TOOLS, PERMS } = await import("../config/constants.js");
  assert.strictEqual(TOOL_PERMISSIONS[TOOLS.CHECK_PROJECT_CHANNELS], PERMS.VIEW_CHANNEL);
});

test("GET_EVENTS maps to ViewChannel in TOOL_PERMISSIONS", async () => {
  const { TOOL_PERMISSIONS, TOOLS, PERMS } = await import("../config/constants.js");
  assert.strictEqual(TOOL_PERMISSIONS[TOOLS.GET_EVENTS], PERMS.VIEW_CHANNEL);
});

// ══════════════════════════════════════════════════════════════════
// 6. PROJECT_CHANNELS constant
// ══════════════════════════════════════════════════════════════════

test("PROJECT_CHANNELS has exactly 3 required channels", async () => {
  const { PROJECT_CHANNELS } = await import("../config/constants.js");
  const names = Object.values(PROJECT_CHANNELS);
  assert.strictEqual(names.length, 3);
  assert.ok(names.includes("project"));
  assert.ok(names.includes("milestones"));
  assert.ok(names.includes("introduction"));
});

test("PROJECT_CHANNELS keys are PROJECT, MILESTONES, INTRODUCTION", async () => {
  const { PROJECT_CHANNELS } = await import("../config/constants.js");
  assert.ok("PROJECT" in PROJECT_CHANNELS);
  assert.ok("MILESTONES" in PROJECT_CHANNELS);
  assert.ok("INTRODUCTION" in PROJECT_CHANNELS);
});

console.log("✅ Adversarial AGENT-CHANNEL-2 tests complete");
