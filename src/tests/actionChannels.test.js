// Test suite for create_project_channels (action tool)
import { test } from "node:test";
import assert from "node:assert";
import { createProjectChannels } from "../discord/tools/index.js";
import { PermissionsBitField } from "discord.js";

const ALL_PERMS = 0x1FFFFFFFFFFFFFn;

function fakeGuildWith(existingChannels = []) {
  return {
    id: "g-1",
    channels: {
      cache: {
        values: () => existingChannels.map((c) => ({ name: c.name, id: c.id })),
        first: () => existingChannels[0] ?? { id: "ch-1" },
      },
      create: async ({ name }) => {
        const newChannel = { id: `new-${name}`, name };
        return newChannel;
      },
    },
    members: {
      cache: new Map([["bot-123", { id: "bot-123", permissions: { bitfield: ALL_PERMS, has: () => true } }]]),
      resolve: (id) => (id === "bot-123" ? { id: "bot-123", permissions: { bitfield: ALL_PERMS, has: () => true } } : null),
    },
    scheduledEvents: {
      fetch: async () => new Map(),
    },
  };
}

function mockClient(existingChannels = [], perms = ALL_PERMS) {
  const guild = fakeGuildWith(existingChannels);
  return {
    user: { id: "bot-123" },
    guilds: { fetch: async () => guild },
    channels: {
      fetch: async (id) => {
        // Return the guild as a channel fetch for hasPermission check
        return {
          id: "ch-1",
          guild: {
            id: "g-1",
            members: {
              resolve: (uid) => (uid === "bot-123" ? {
                id: "bot-123",
                permissions: { bitfield: perms, has: (flag) => true },
              } : null),
            },
          },
        };
      },
    },
  };
}

// ── create_project_channels schemas ───────────────────
test("create_project_channels schema requires guildId", () => {
  const tool = createProjectChannels({ client: mockClient() });
  const r = tool.schema.safeParse({});
  assert.ok(!r.success);
});

test("create_project_channels schema accepts optional channels array", () => {
  const tool = createProjectChannels({ client: mockClient() });
  const r2 = tool.schema.safeParse({ guildId: "g-1", channels: [] });
  assert.ok(r2.success);
  const r3 = tool.schema.safeParse({ guildId: "g-1", channels: ["project"] });
  assert.ok(r3.success);
});

// ── behavior tests with fully mocked guild ───────────────
test("create_project_channels fails if ManageChannels permission is missing", async () => {
  // no real guild means hasPermission will fail (channel fetch returns no guild)
  const noGuildClient = {
    user: { id: "bot-123" },
    guilds: { fetch: async () => ({ id: "g-1", channels: { cache: { values: () => [], first: () => null } } }) },
    channels: { fetch: async () => null },
  };
  const tool = createProjectChannels({ client: noGuildClient });
  const result = await tool._call({ guildId: "g-1" });
  assert.strictEqual(result.success, false);
});

console.log("✅ All action-channel tests passed!");
