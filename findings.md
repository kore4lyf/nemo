# Findings & Decisions

## Requirements
Source: AGENT-CHANNEL.md Production Readiness Review

- Fix 7 P0 critical bugs (concurrency, retry, error-swallowing, cache, DM race, regex, sweep)
- Fix 5 P1 serious design failures (idempotency, system prompt cache, bot message filtering, logging, confirmation)
- Fix 6 P2 smaller issues (permissions, dead code, .env, temperature, graceful shutdown, git state)
- Maintain existing 317 passing tests
- No new dependencies beyond `p-queue` (was previously used, removed in b3a6b22)

## Research Findings

### Codebase Architecture
- **Entry:** `src/index.js` — Discord client setup, event handlers
- **Agent:** `src/agent/agent.js` (97 lines) — ReAct loop, LLM binding, tool execution
- **Message handler:** `src/bot/onMessage.js` (71 lines) — Retry wrapper, message dispatch
- **Tools:** `src/discord/tools/` — action (messages, threads, reactions, channels) + context (members, channels, messages, milestones, etc.)
- **Shared:** `src/discord/tools/shared/` — permissions, sweep, factory, response, schemas
- **Config:** `src/config/` — env, constants, logger, systemPrompt

### Bug Analysis

**Bug 1 — agent.js: No caching bug exists.**
Review claims `getAgent()` caches against `client` identity. Actual code has NO `getAgent()` function — `processWithAgent` creates a fresh LLM + tools on every call. The review may be based on an older version or hallucinated. **This P0 is a false positive.**

**Bug 2 — onMessage.js: Retry is dead code.**
Confirmed. `processWithAgent` has a catch-all that returns a string. `callAgent` catches retryable errors and retries, but `processWithAgent` never throws — it returns `"Sorry, I hit an error..."`. The retry wrapper sees a successful string return, not an error. `isRetryable` is effectively dead code.

**Bug 3 — onMessage.js: No concurrency control.**
Confirmed. `client.on(Events.MessageCreate, onMessage)` fires `callAgent` as fire-and-forget. No queue, no limit. 50 msgs/sec = 50 concurrent LLM calls.

**Bug 4 — sweep.js: Error swallowing.**
Confirmed. Line ~42: `catch (err) { return { ok: true, messages: collected }; }` — fetch failure returns success with partial data. Outer catch: `return { ok: true, messages: [] }` — total failure returns success with empty data.

**Bug 5 — systemPrompt.js: Caches for process lifetime.**
Confirmed. `cachedPrompt` is set once, never invalidated. `_resetSystemPromptCache()` exists but is only used in tests.

**Bug 6 — permissions.js: Hand-rolled bitfield.**
Confirmed. Uses manual BigInt map instead of `discord.js`'s `PermissionsBitField.Flags`. Drift risk.

### What the Review Got Wrong
1. **No `getAgent()` function exists** — `processWithAgent` creates fresh LLM/tools each call. The P0 cache bug doesn't exist in current code.
2. **No `extractSwitchTarget` in onMessage.js** — The DM guild resolution and switch-target regex are not in the current codebase. May have been removed or the review hallucinated.
3. **No `interactions.js`** — File was deleted (git status shows `D src/bot/interactions.js`). The slash command confirmation P1 doesn't apply.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| p-queue for concurrency control | Was previously used (removed b3a6b22), lightweight, well-tested |
| Rethrow from processWithAgent | Let retry wrapper do its job instead of swallowing all errors |
| Return `{ ok: false, error }` on sweep failure | Honest error propagation instead of false success |
| Button confirmations for delete/edit | Native Discord UX, less ambiguous than text |
| crypto.randomUUID() for request IDs | No deps, collision-free, built-in |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Review contains hallucinated bugs (getAgent, extractSwitchTarget, interactions.js) | Cross-checked against actual source; excluded false positives from plan |

## Resources
- Project root: `/data/data/com.termux/files/home/code/nemo/`
- Review: `AGENT-CHANNEL.md`
- Package: `nemo@0.1.0`, deps: `@langchain/core`, `@langchain/openai`, `async-retry`, `discord.js`, `dotenv`, `zod`
- LLM: `alibaba/qwen3-vl-flash` via `api.aimlapi.com`

## Visual/Browser Findings
- None
