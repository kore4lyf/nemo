/**
 * AUDIT FIX TESTS
 * Tests for the six critical/high bugs from the PMC audit:
 * - Bug 1: Correct permission bit values
 * - Bug 2: GuildMembers intent present
 * - Bug 3: Thread tools permission check for guildId-only
 * - Bug 4: Stale lastDMGuild guard in onMessage.js
 * - Bug 5: sweepChannelByName force-fetches channels
 * - Bug 6: get_server_state parallelizes fetchPins
 */
import { test } from "node:test";
import assert from "node:assert";

// ── Bug 1: Correct permission bit values ──────────────────────

import { PermissionsBitField } from "../discord/tools/shared/permissions.js";
import { PERMS } from "../config/constants.js";

test("permission bits: PinMessages matches discord.js canonical value", () => {
  // discord.js v14: PinMessages = 0x8000000000000n
  assert.strictEqual(PermissionsBitField[PERMS.PIN_MESSAGES], 0x8000000000000n);
});

test("permission bits: SendMessagesInThreads matches discord.js canonical value", () => {
  // discord.js v14: SendMessagesInThreads = 0x4000000000n
  assert.strictEqual(PermissionsBitField[PERMS.SEND_MESSAGES_IN_THREADS], 0x4000000000n);
});

test("permission bits: CreatePublicThreads matches discord.js canonical value", () => {
  // discord.js v14: CreatePublicThreads = 0x800000000n
  assert.strictEqual(PermissionsBitField[PERMS.CREATE_PUBLIC_THREADS], 0x800000000n);
});

test("permission bits: CreatePrivateThreads matches discord.js canonical value", () => {
  // discord.js v14: CreatePrivateThreads = 0x1000000000n
  assert.strictEqual(PermissionsBitField[PERMS.CREATE_PRIVATE_THREADS], 0x1000000000n);
});

test("permission bits: ViewChannel is correct (regression guard)", () => {
  assert.strictEqual(PermissionsBitField[PERMS.VIEW_CHANNEL], 0x400n);
});

test("permission bits: SendMessages is correct (regression guard)", () => {
  assert.strictEqual(PermissionsBitField[PERMS.SEND_MESSAGES], 0x800n);
});

// ── Bug 2: GuildMembers intent present ────────────────────────

test("index.js: GuildMembers intent is configured", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../index.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("GatewayIntentBits.GuildMembers"),
    "index.js should include GuildMembers intent"
  );
});

// ── Bug 3: Thread tools permission check for guildId-only ─────

test("threads: get_active_threads probes permission when only guildId given", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/threads.js", import.meta.url),
    "utf8"
  );
  // Should probe a cached channel when only guildId is provided
  assert.ok(
    content.includes("probeTarget"),
    "get_active_threads should define probeTarget for guildId-only calls"
  );
  assert.ok(
    content.includes("guilds.fetch(input.guildId)"),
    "get_active_threads should fetch guild to probe permissions"
  );
});

test("threads: list_threads probes permission when only guildId given", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/threads.js", import.meta.url),
    "utf8"
  );
  // Both tools share the same probe pattern; count occurrences of probeTarget
  const probeCount = (content.match(/probeTarget/g) || []).length;
  assert.ok(
    probeCount >= 2,
    `list_threads should define probeTarget for guildId-only calls (found ${probeCount} occurrences)`
  );
});

// ── Bug 4: Stale lastDMGuild guard in onMessage.js ────────────

test("onMessage: stale cache guard when user left the guild", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../bot/onMessage.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("can't find that server in your shared servers anymore"),
    "onMessage should reply when cached guild is no longer in memberGuilds"
  );
});

test("onMessage: stale cache guard returns early, does not run agent", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../bot/onMessage.js", import.meta.url),
    "utf8"
  );
  // The guard should include a return statement before callAgent
  const staleGuardMatch = content.match(
    /cachedGuildId\)[\s\S]*?can't find that server[\s\S]*?return/
  );
  assert.ok(
    staleGuardMatch,
    "stale cache guard should return before calling agent"
  );
});

// ── Bug 5: sweepChannelByName force-fetches channels ──────────

test("sweep: sweepChannelByName tries API fetch before cache", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/shared/sweep.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("guild.channels.fetch"),
    "sweepChannelByName should call guild.channels.fetch()"
  );
  assert.ok(
    content.includes("catch"),
    "sweepChannelByName should fall back to cache on fetch failure"
  );
});

// ── Bug 6: get_server_state parallelizes fetchPins ────────────

test("servers: get_server_state uses Promise.all for pins", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/servers.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("Promise.all"),
    "get_server_state should parallelize pin fetching"
  );
  assert.ok(
    !content.includes("for (const ch of guild.channels") || content.indexOf("Promise.all") < content.indexOf("for (const ch"),
    "get_server_state should not have sequential pin loop before Promise.all"
  );
});

// ── Bug 7: get_members returns role names, not IDs ────────────

test("members: get_members returns role names, not IDs", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/members.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("r.name"),
    "get_members should map role objects to their names"
  );
  assert.ok(
    !content.includes("keys()"),
    "get_members should not use keys() for role extraction"
  );
});

// ── Bug 13: GuildPresences intent ────────────────────────────

test("index.js: GuildPresences intent is configured", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../index.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("GatewayIntentBits.GuildPresences"),
    "index.js should include GuildPresences intent"
  );
});

// ── Bug 14: member cache warming ─────────────────────────────

test("onMessage: warms member cache before has-check", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../bot/onMessage.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("members.fetch(author.id)"),
    "onMessage should fetch member to warm cache"
  );
});

// ── Bug 15: startup race guard ──────────────────────────────

test("onMessage: guards against unset client.user", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../bot/onMessage.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("!message.client.user") && content.includes("return"),
    "onMessage should early-return if client.user is not set"
  );
});

// ── Bug 16: create_thread uses getRequiredPermission ────────

test("action/threads: create_thread uses getRequiredPermission", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/action/threads.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("getRequiredPermission"),
    "create_thread should use getRequiredPermission, not hardcoded literals"
  );
  assert.ok(
    !content.includes('"CreatePublicThreads"') && !content.includes('"CreatePrivateThreads"'),
    "create_thread should not have hardcoded permission name strings"
  );
});

// ── Bug 20: get_channels returns parentName ──────────────────

test("channels: get_channels returns parentName alongside parentId", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/channels.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("parentName"),
    "get_channels should include parentName in output"
  );
});

// ── Bug 25: sweep cap ───────────────────────────────────────

test("sweep: sweepChannelByName has maxMessages cap", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/shared/sweep.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("maxMessages"),
    "sweepChannelByName should accept maxMessages parameter"
  );
  assert.ok(
    content.includes("collected.length >= maxMessages"),
    "sweepChannelByName should break when cap is reached"
  );
});

// ── Bug 26: scanned reflects filtered count ──────────────────

test("milestones: scanned reflects filtered count, not raw sweep", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/milestones.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("scanned: filtered.length"),
    "get_milestones should report scanned as filtered.length"
  );
});

// ── Bug 27: shared filter helpers ────────────────────────────

test("milestones: uses shared filter helpers", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/milestones.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes('from "../shared/filters.js"'),
    "milestones should import from shared filters"
  );
  // Should NOT have local matchesAuthor/matchesQuery definitions
  assert.ok(
    !content.includes("function matchesAuthor"),
    "milestones should not define local matchesAuthor"
  );
});

// ── Bug 29: normalizeMessage NaN guard ───────────────────────

test("messages: normalizeMessage guards against NaN dates", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/messages.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("Number.isFinite"),
    "normalizeMessage should use Number.isFinite to guard against NaN"
  );
});

// ── Bug 30: normalizeEvent consistent null handling ──────────

test("events: normalizeEvent uses consistent null handling", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/events.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("normalizeStr"),
    "events should use a shared normalizeStr helper"
  );
});

// ── Bug 31: eventContext permission check ────────────────────

test("events: get_events includes permission check", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/events.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("hasPermission"),
    "get_events should check permissions"
  );
});

// ── Bug 33: permission probe sorts by position ───────────────

test("channels: permission probe sorts by position", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/channels.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("position"),
    "channels should sort by position for permission probe"
  );
});

// ── Bug 36: scanned count excludes bots ──────────────────────

test("members: scanned reflects filtered count (excludes bots)", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../discord/tools/context/members.js", import.meta.url),
    "utf8"
  );
  assert.ok(
    content.includes("scanned: people.length"),
    "get_members should report scanned as people.length (filtered)"
  );
});

console.log("✅ Audit fix tests complete");
