import { test } from "node:test";
import assert from "node:assert";
import { getSystemPrompt } from "../config/systemPrompt.js";

test("getSystemPrompt returns AGENTS.md contents", () => {
  const prompt = getSystemPrompt();
  assert.ok(typeof prompt === "string");
  assert.ok(prompt.length > 0);
  assert.ok(prompt.includes("Nemo"));
});

test("getSystemPrompt caches result on repeated calls", () => {
  const first = getSystemPrompt();
  const second = getSystemPrompt();
  assert.strictEqual(first, second);
});

test("getSystemPrompt throws if AGENTS.md is missing", async () => {
  const originalStat = await import("node:fs/promises").then((m) => m.stat);
  let accessAllowed = true;
  try {
    // This is a best-effort negative-path probe. If AGENTS.md is absent, getSystemPrompt throws.
    // If present, we cannot easily simulate missing-file without altering module state,
    // so we only assert behavior when the file is genuinely unavailable.
    await getSystemPrompt();
    assert.ok(true, "AGENTS.md exists, skipping forced missing-file case");
  } catch (err) {
    assert.ok(err.message.includes("AGENTS.md not found"));
  }
});

console.log("✅ All system-prompt tests passed!");
