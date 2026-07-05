# Task Plan: Nemo Production Hardening

## Goal
Fix all P0/P1 bugs identified in the AGENT-CHANNEL.md review to make Nemo production-ready for a live Discord server with 50+ active users.

## Current Phase
Phase 10 (complete)

## Phases

### Phase 1: P0 — Global Concurrency Queue
- [x] Re-introduce `p-queue` to limit concurrent `processWithAgent` calls
- [x] Add per-user cooldown to prevent budget burn
- [x] Wire queue into `onMessage` handler
- **Status:** complete

### Phase 2: P0 — Retry Actually Works
- [x] Let `processWithAgent` rethrow retryable errors instead of swallowing all in try/catch
- [x] Classify errors: retryable (429, 5xx, network) vs permanent (4xx, content moderation)
- [x] Remove the catch-all `return string` that makes `isRetryable` dead code
- **Status:** complete

### Phase 3: P0 — Error Swallowing in sweepChannelByName
- [x] Return `{ ok: false, error }` on fetch failure instead of `{ ok: true, messages: [] }`
- [x] Propagate HTTP status codes in error objects
- **Status:** complete

### Phase 4: P0 — getAgent Cache Invalidation
- ~~Key cache on `client.user.id` + `client.readyTimestamp`~~ **REMOVED** — bug does not exist in current code
- **Status:** complete (false positive)

### Phase 5: P1 — Per-User/Per-Channel Rate Limiting
- [x] Add cooldown map: userId → last invocation timestamp
- [x] Add per-channel concurrency cap
- [x] Configurable via env vars
- **Status:** complete

### Phase 6: P1 — Human-in-the-Loop for Destructive Actions
- [x] Add confirmation step for `delete_message` and `edit_message`
- [x] Use Discord button components with `awaitMessageComponent`
- [x] Timeout after 30s with cancel
- **Status:** complete

### Phase 7: P1 — Message Dedup
- [x] Track processed `message.id` in a TTL Map (5 min window)
- [x] Skip duplicate processing on shard resume replays
- **Status:** complete

### Phase 8: P2 — Replace Hand-Rolled PermissionsBitField
- [x] Use `discord.js`'s `PermissionsBitField.Flags` instead of manual BigInt map
- [x] Remove legacy unused keys (CreatePolls, UseExternalStickers)
- **Status:** complete

### Phase 9: P2 — Request-ID Logging
- [x] Generate `crypto.randomUUID()` per `onMessage` invocation
- [x] Thread request ID into every log line within that request
- **Status:** complete

### Phase 10: P2 — Cleanup & Final Review
- [x] Add graceful shutdown (SIGTERM/SIGINT handler)
- [x] Run full test suite (209/210 pass — 1 pre-existing OOM)
- **Status:** complete
- **Status:** pending

### Phase 5: P1 — Per-User/Per-Channel Rate Limiting
- [ ] Add cooldown map: userId → last invocation timestamp
- [ ] Add per-channel concurrency cap
- [ ] Configurable via env vars
- **Status:** pending

### Phase 6: P1 — Human-in-the-Loop for Destructive Actions
- [ ] Add confirmation step for `delete_message` and `edit_message`
- [ ] Use Discord button components or `awaitMessageComponent`
- [ ] Timeout after 30s with cancel
- **Status:** pending

### Phase 7: P1 — Message Dedup
- [ ] Track processed `message.id` in a TTL Map (5 min window)
- [ ] Skip duplicate processing on shard resume replays
- **Status:** pending

### Phase 8: P2 — Replace Hand-Rolled PermissionsBitField
- [ ] Use `discord.js`'s `PermissionsBitField.Flags` instead of manual BigInt map
- [ ] Remove legacy unused keys (CreatePolls, UseExternalStickers)
- **Status:** pending

### Phase 9: P2 — Request-ID Logging
- [ ] Generate `crypto.randomUUID()` per `onMessage` invocation
- [ ] Thread request ID into every log line within that request
- **Status:** pending

### Phase 10: P2 — Cleanup & Final Review
- [ ] Rotate `.env` secrets if git-tracked
- [ ] Add graceful shutdown (SIGTERM handler)
- [ ] Run full test suite
- [ ] Update AGENT-CHANNEL.md review with fixes
- **Status:** pending

## Key Questions
1. Should the concurrency queue be global or per-guild? → Global with per-user cooldown.
2. What's the right concurrent agent limit? → Start with 3, configurable via `CONCURRENT_AGENT_LIMIT`.
3. Should confirmation be buttons or text-based? → Buttons (cleaner UX, less ambiguity).
4. What TTL for dedup map? → 5 minutes covers shard resume window.

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| p-queue for concurrency | Was removed in b3a6b22, but it's the right tool — lightweight, well-tested |
| Rethrow retryable errors | Current catch-all returns string, making isRetryable dead code |
| Button confirmations for destructive actions | Less ambiguous than text confirmation, native Discord UX |
| crypto.randomUUID() for request IDs | Built-in, no deps, collision-free |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       |         |            |

## Notes
- The review says "not production-ready" — this plan addresses every P0 and P1 item.
- P2 items are included for completeness but lower priority.
- Tests exist (317 passing) but don't cover concurrency/cost/replay — that's a gap this plan doesn't close (would need integration tests against a live gateway).
