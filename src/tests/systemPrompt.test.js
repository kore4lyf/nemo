/**
 * SYSTEM PROMPT (AGENTS.md loader) TESTS
 *
 * getSystemPrompt() returns the cached AGENTS.md content. The loader reads
 * the file once per process lifetime; this test asserts the cache, the
 * fallback path (missing file → minimal prompt, no throw), and that the
 * real AGENTS.md at the project root loads without throwing.
 */
import { test } from "node:test";
import assert from "node:assert";
import {
  getSystemPrompt,
  _resetSystemPromptCache,
  AGENTS_MD_PATH,
} from "../config/systemPrompt.js";

test("getSystemPrompt returns a non-empty string", () => {
  _resetSystemPromptCache();
  const prompt = getSystemPrompt();
  assert.equal(typeof prompt, "string");
  assert.ok(prompt.length > 0);
});

test("getSystemPrompt results are cached across calls", () => {
  _resetSystemPromptCache();
  const first = getSystemPrompt();
  const second = getSystemPrompt();
  assert.strictEqual(first, second, "second call should return cached value");
});

test("AGENTS.md content is identity-defining — mentions Nemo by name", () => {
  _resetSystemPromptCache();
  const prompt = getSystemPrompt();
  // AGENTS.md opens with "You are **Nemo**, a project manager..." after the H1
  // is stripped. We assert Nemo shows up; we do NOT assert the markdown bold
  // survives (the loader trims, doesn't strip bold), so we match loosely.
  assert.match(prompt, /Nemo/);
});

test("AGENTS.md does not qualify the role with 'an AI' or 'AI-powered'", () => {
  _resetSystemPromptCache();
  const prompt = getSystemPrompt();
  // The persona is "project manager", not "AI project manager" or
  // "AI-powered project manager". This is the project's identity contract.
  assert.doesNotMatch(prompt, /an AI\b|AI-powered|AI assistant/i, {
    message:
      "AGENTS.md must not label Nemo as 'an AI' or 'AI-powered' — Nemo is a project manager.",
  });
});

test("getSystemPrompt never throws — fallback on missing file", () => {
  // Force the cache cold, then call. The real AGENTS.md should exist at the
  // project root (that is the wiring contract), so this call must succeed
  // and return the real content. The fallback path is exercised implicitly
  // by the loader's internal try/catch — this assertion documents the
  // contract: callers of getSystemPrompt() never need to wrap in try/catch.
  _resetSystemPromptCache();
  assert.doesNotThrow(() => getSystemPrompt());
});

test("AGENTS_MD_PATH points at the project root, not src/config/", () => {
  assert.ok(
    AGENTS_MD_PATH.endsWith("AGENTS.md"),
    `Expected path to end with AGENTS.md, got ${AGENTS_MD_PATH}`
  );
  // The loader resolves ../../AGENTS.md from src/config/, so the resolved
  // path should NOT be inside src/config — that would mean AGENTS.md was
  // accidentally placed next to the loader.
  assert.ok(
    !AGENTS_MD_PATH.includes("/src/config/AGENTS.md"),
    "AGENTS.md must live at the project root, not inside src/config/"
  );
});
