# Progress Log

## Session: 2026-07-05

### Phase 1: Requirements & Discovery
- **Status:** complete
- Read AGENT-CHANNEL.md review, validated against code, found 3 false positives

### Phase 2: P0 — Global Concurrency Queue
- **Status:** complete
- Created `src/bot/queue.js` with p-queue (concurrency: 3, 10/min cap)
- Added per-user cooldown (5s default)
- Wired into onMessage.js

### Phase 3: P0 — Fix Retry
- **Status:** complete
- Changed agent.js catch-all to rethrow errors
- isRetryable wrapper in onMessage.js now actually fires

### Phase 4: P0 — Sweep Error Swallowing
- **Status:** complete
- sweep.js returns `{ ok: false, error, status }` on fetch failure
- No more false success with empty data

### Phase 5: P1 — Button Confirmations
- **Status:** complete
- delete_message and edit_message show Confirm/Cancel buttons
- 30s timeout, cancel on no response
- Factory updated to thread `message` through tools

### Phase 6: P1 — Message Dedup
- **Status:** complete
- TTL Map (5min) tracks processed message IDs
- Skips shard resume replays

### Phase 7: P2 — PermissionsBitField
- **Status:** complete
- Replaced manual BigInt map with discord.js PermissionsBitField.Flags
- Removed unused legacy keys

### Phase 8: P2 — Request-ID Logging
- **Status:** complete
- Added scopedLogger to logger.js
- 8-char UUID generated per onMessage, threaded through agent

### Phase 9: P2 — Graceful Shutdown
- **Status:** complete
- SIGTERM/SIGINT handlers drain queue (30s timeout) then disconnect

### Phase 10: Final Review
- **Status:** complete
- 209/210 tests pass (1 pre-existing OOM)
- All planning files updated

## Test Results
| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| npm test | 35 | 0 | Core tools + behavior |
| adversarial-project-tools | 38 | 0 | Permission bits, channels, events, members |
| adversarial-onmessage | 42 | 0 | Injection, security |
| adversarial-agent | 30 | 0 | Agent behavior |
| adversarial-tools | 30 | 0 | Tool edge cases |
| adversarial-security | 1 | 0 | Security |
| contextTools | 26+ | 0 | Schema tests pass; behavior tests OOM in full suite (pre-existing) |
| behavior | 5 | 0 | Message actions |
| api | 2 | 0 | API |

## Files Created/Modified
- `src/bot/queue.js` (NEW) — concurrency queue + cooldown
- `src/bot/onMessage.js` — queue, cooldown, dedup, request-ID
- `src/agent/agent.js` — rethrow errors, scoped logging
- `src/discord/tools/shared/sweep.js` — honest error returns
- `src/discord/tools/shared/permissions.js` — discord.js flags
- `src/discord/tools/shared/factory.js` — thread message through
- `src/discord/tools/action/messages.js` — button confirmations
- `src/discord/tools/action/index.js` — pass message
- `src/discord/tools/context/index.js` — pass message
- `src/discord/tools/index.js` — pass message
- `src/config/logger.js` — scopedLogger
- `src/index.js` — graceful shutdown
