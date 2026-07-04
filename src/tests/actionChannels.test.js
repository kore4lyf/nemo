// Adversarial test suite for create_project_channels.
// Tests the raw tool implementation (not just schema) with mock clients
// whose permission bitfields enforce real checks.
import { test } from "node:test";
import assert from "node:assert";
import { channelActions } from "../discord/tools/action/channels.js";

const createDef = channelActions.find((d) => d.name === "create_project_channels");

// Build a Discord client where the bot has the permission bits you specify
function makeClient(perms, existingChannels = []) {
  const channels = existingChannels.map((c) => ({ ...c, type: 0 }));

  const guild = {
    id: "g-1",
    channels: {
      cache: {
        first: () => channels[0] ?? null,
        values: () => [...channels],
      },
      create: async ({ name, type }) => {
        const ch = { id: `new-${name}`, name, type };
        channels.push(ch);
        return ch;
      },
    },
    members: {
      resolve: (id) =>
        id === "bot-123"
          ? {
              id: "bot-123",
              permissions: {
                bitfield: perms,
                // Discord.js style: has(bit) checks (bitfield & BigInt(bit)) != 0
                has: (bit) => (perms & BigInt(bit)) !== 0n,
              },
            }
          : null,
    },
  };

  const channelObj = {
    id: channels[0]?.id ?? "ch-1",
    guild: {
      id: "g-1",
      members: guild.members,
    },
  };

  return {
    user: { id: "bot-123" },
    guilds: { fetch: async () => guild },
    channels: { fetch: async () => channelObj },
  };
}

const V = 0x400n;  // ViewChannel
const M = 0x10n;   // ManageChannels

// ── A1: ManageChannels missing ───────────────────────────
test("A1: fails with real permission bit missing", async () => {
  const client = makeClient(V, [{ id: "ch-1", name: "gen" }]);
  const res = await createDef.create(client, { guildId: "g-1", channels: ["project"] });

  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes("Missing permission"));
  assert.ok(res.error.includes("ManageChannels"));
});

// ── A2: Invalid channel name ────────────────────────────
test("A2: rejects name outside PROJECT_CHANNELS", async () => {
  const client = makeClient(V | M, [{ id: "ch-1", name: "gen" }]);
  const res = await createDef.create(client, { guildId: "g-1", channels: ["random"] });

  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes("Invalid channel name"));
});

// ── A3: Skips existing, creates missing ────────────────
test("A3: skips existing channels, creates missing ones", async () => {
  const client = makeClient(V | M, [
    { id: "ch-proj", name: "project" },
  ]);

  const res = await createDef.create(client, {
    guildId: "g-1",
    channels: ["project", "milestones"],
  });

  assert.strictEqual(res.success, true);

  assert.strictEqual(res.skipped.length, 1);
  assert.strictEqual(res.skipped[0].name, "project");
  assert.strictEqual(res.skipped[0].reason, "already exists");

  assert.strictEqual(res.created.length, 1);
  assert.strictEqual(res.created[0].name, "milestones");
});

// ── A4: Creates all from scratch ────────────────────────
test("A4: creates all required channels when none exist", async () => {
  const client = makeClient(V | M, [{ id: "ch-1", name: "gen" }]);
  const res = await createDef.create(client, { guildId: "g-1" });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.created.length, 3);
  assert.strictEqual(res.skipped.length, 0);
  const names = res.created.map((c) => c.name);
  assert.ok(names.includes("project"));
  assert.ok(names.includes("milestones"));
  assert.ok(names.includes("introduction"));
});

// ── A5: Schema rejects empty guildId ────────────────────
test("A5: schema rejects empty guildId", () => {
  const r = createDef.schema.safeParse({ guildId: "" });
  assert.ok(!r.success);
});

// ── A6: Case-insensitive existing match ─────────────────
test("A6: 'Project' matches 'project' case-insensitively", async () => {
  const client = makeClient(V | M, [{ id: "ch-proj", name: "Project" }]);

  const res = await createDef.create(client, {
    guildId: "g-1",
    channels: ["project"],
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.skipped.length, 1);
  assert.strictEqual(res.skipped[0].name, "project");
});
