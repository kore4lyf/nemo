# Nemo — AI Project Manager for Discord

> An intelligent Discord assistant that helps teams plan, organize, monitor, and execute projects — acting as an always-on assistant project manager in your server.

Nemo maintains awareness of your project's state, team structure, objectives, timeline, and progress. It provides reminders, tracks milestones, identifies risks, answers questions, and keeps the team aligned — all through natural conversation in Discord channels and threads.

---

## What Nemo Does Right Now

- **Coordination in Discord** — Nemo operates where the team already talks. It creates threads, pins references, routes updates, and summarizes channel state without leaving Discord.
- **Read-only cartographer** — Nemo can inspect channels, messages, threads, members, introductions, milestones, events, and server overviews using 23 tools.
- **Agentic action layer** — With mention-only triggers and a 6-iteration ReAct loop, Nemo decides whether to act, read, or reply based on live server state.
- **Permission-respecting** — Every tool is gated by actual Discord permissions. Missing permissions are reported cleanly; no silent failures.
- **Resilient invocation** — Async retry with backoff for transient failures, structured logging, early env validation, and adversarial test coverage.

## What's Coming Next

- Persistent task ownership, assignment, and milestone CRUD
- Scheduled reminders and recurring check-ins
- Risk dashboards and status summaries beyond raw Discord data
- Slash commands and confirmation steps for destructive actions
- Rate/cost controls for high-volume servers
- Multi-server project templates and external tracker integrations

---

## How It Works

### Trigger

Nemo responds only when:
- the message author is **not a bot**
- the message **mentions Nemo**

If both are true, the request enters the handler in `src/bot/onMessage.js`.

### Request lifecycle

1. **Receive** — Discord gateway delivers a `MessageCreate` event.
2. **Filter** — Ignore bot messages; require mention.
3. **Retry wrap** — `async-retry` with 3 attempts, 2s–30s backoff, transient-failure classification in `src/bot/onMessage.js`.
4. **Build tools** — `src/discord/tools/index.js` binds all 23 action/context tools to the live Discord client.
5. **Extract context** — `src/discord/context.js` pulls channel, guild, message, author, and mention data.
6. **Load persona** — `src/config/systemPrompt.js` reads `AGENTS.md` once from disk and caches it for the process lifetime.
7. **Fetch recent conversation** — `src/agent/agent.js` reads the last 20 messages from the current channel, reverses them to chronological order, truncates each to 500 characters, and injects a plain-text transcript into the system message.
8. **ReAct loop** — Up to 6 iterations:
   - LLM receives system prompt + context + user message
   - LLM returns text and/or tool calls
   - If tool calls exist, Nemo executes them and feeds results back as `ToolMessage` entries
   - If no tool calls, Nemo returns the text response immediately
9. **Safety fallback** — If iterations exhaust without a final text reply, Nemo asks the LLM to summarize what was done so far.
10. **Reply** — The final response is sent as a reply to the triggering message.

### Architecture diagram

```
Discord Gateway
      |
      v
+-----------+    +--------------+    +------------------+
|  index.js |--->|  onMessage   |--->|  processWithAgent |
|  (login + |    |  (retry wrap)|    |  (ReAct loop)     |
|   intents)|    +--------------+    +--------+---------+
+-----------+                                |
                                             v
                                +------------------------+
                                |  LLM (ChatOpenAI)      |
                                |  + bound Discord tools |
                                +----------+-------------+
                                           |
                  +------------------------+------------------------+
                  v                        v                        v
           +-----------+          +-----------------+   +----------------+
           | context.js|          |  tools/index.js |   | permissions.js |
           | (extracts |          |  + action/      |   |  (per-tool gate)|
           |  channel, |          |    context/     |   +----------------+
           |  author,  |          |    shared/      |
           |  mentions)|          +-----------------+
           +-----------+
```

---

## Memory Model

Nemo has **no persistent memory across requests or restarts**. Understanding what it remembers—and what it doesn’t—is important for setting the right expectations.

### What it uses per request

| Source | Lifetime | Notes |
|--------|----------|-------|
| `AGENTS.md` system prompt | Process lifetime | Cached on first read; changes require a restart to take effect. |
| Current message context | Single request | Channel, guild, message id, author, content, mentions. |
| Last 20 channel messages | Single request | Fetched live at request time; formatted as `[author]: content`. |

### What it does not have

- No database of project state
- No conversation history across channels
- No indexed archive of the team’s decisions
- No task ownership or milestone ledger outside Discord messages

This means Nemo reconstructs project understanding by **actively reading Discord** during a request. For example, when asked about blocked work, it may call `get_recent_messages`, `get_milestones`, and `get_pinned_messages` in the same turn rather than recalling from long-term memory.

---

## Features

- **Conversational project management** — Talk to Nemo in plain language. It decides what to do, calls the right Discord tools, and reports back.
- **ReAct agent loop** — Powered by LangChain: the LLM reasons, selects tools, executes them, and synthesizes a response across up to 6 iterations.
- **23 Discord tools** — Write, read, and audit Discord state from one agent surface:
  - **Messaging:** send, edit, delete, pin/unpin messages, post in threads
  - **Threading:** create threads, send thread messages, list active threads, read thread history
  - **Channels:** inspect channels, audit required project channels, create missing project channels
  - **Members & introductions:** list members and read the #introduction channel
  - **Milestones & events:** read #milestones posts and guild scheduled events
  - **History:** read recent messages, pinned messages, single messages, thread history, and server overviews
- **Permission-aware** — Every tool checks the bot's actual Discord permissions before acting. If a permission is missing, Nemo reports it cleanly.
- **Resilient by design** — Transient network/API failures are retried with exponential backoff. Rate limits (429) and 5xx errors are retried; content-moderation blocks fail fast.
- **Structured logging** — Timestamped, leveled logging (debug/info/warn/error) with a configurable `LOG_LEVEL`.
- **Environment-validated** — Required env vars are checked at startup via Zod. Crash early, not mid-request.
- **Tested** — Behavior tests, tool tests, API tests, and adversarial test suites included.

---

## Tools and Permissions

Nemo's agent has access to 23 Discord tools. Each tool is gated by a permission check before execution.

### Action tools

| Tool | Action | Required Discord Permission |
|------|--------|------------------------------|
| `send_message` | Send a text/embed message to a channel | `SendMessages` |
| `pin_message` | Pin a message in a channel | `PinMessages` |
| `unpin_message` | Remove a pin from a message | `PinMessages` |
| `delete_message` | Delete a message by id | `ManageMessages` |
| `edit_message` | Edit a previously sent message | `ManageMessages` |
| `create_thread` | Create a public or private thread | `CreatePublicThreads` / `CreatePrivateThreads` |
| `send_thread_message` | Post a message inside an existing thread | `SendMessagesInThreads` |
| `add_reaction` | Add an emoji reaction to a message | `AddReactions` |
| `create_project_channels` | Create missing required project channels | `ManageChannels` |

### Read-only context tools

| Tool | Action | Required Discord Permission |
|------|--------|------------------------------|
| `get_channels` | List channels in a guild | `ViewChannel` |
| `get_channel_info` | Get metadata about a channel | `ViewChannel` |
| `check_project_channels` | Audit which required project channels exist | `ViewChannel` |
| `get_members` | List members in a channel or guild | `ViewChannel` |
| `get_milestones` | Fetch milestone messages from #milestones | `ReadMessageHistory` |
| `get_introduction` | Fetch introduction messages from #introduction | `ReadMessageHistory` |
| `get_server_state` | Composite snapshot of server stats | `ViewChannel` |
| `get_events` | List guild scheduled events | `ViewChannel` |
| `get_pinned_messages` | Read pinned messages in a channel | `ReadMessageHistory` |
| `get_recent_messages` | Read recent messages in a channel | `ReadMessageHistory` |
| `get_message` | Fetch a single message by id | `ReadMessageHistory` |
| `get_active_threads` | List active threads in a channel or guild | `ViewChannel` |
| `list_threads` | Back-compat alias for active threads | `ViewChannel` |
| `get_thread_history` | Read recent messages in a thread | `ReadMessageHistory` |

If the bot lacks the required permission, the tool returns `{ success: false, error: "Missing permission: <PERM>" }` and the agent reports this to the user gracefully.

---

## Getting Started

### Prerequisites

- **Node.js 18+** (uses native ESM and fetch)
- A **Discord bot application** with a token and client ID
- An **OpenAI-compatible API key** (OpenAI, AIML API, or any compatible endpoint)

### 1. Clone and install

```bash
git clone <your-repo-url> nemo
cd nemo
npm install
```

### 2. Configure environment

Copy the example and fill in your values:

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=your_discord_bot_token
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=x-ai/grok-4-1-fast-reasoning
CLIENT_ID=your_bot_client_id
GUILD_ID=optional_guild_id_for_dev
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Bot token from the Discord Developer Portal |
| `OPENAI_API_KEY` | Yes | API key for your LLM provider |
| `OPENAI_BASE_URL` | No | Defaults to `https://api.aimlapi.com/v1`. Any OpenAI-compatible endpoint works. |
| `OPENAI_MODEL` | No | Defaults to `x-ai/grok-4-1-fast-reasoning` |
| `CLIENT_ID` | Yes | Bot application/client ID |
| `GUILD_ID` | No | Dev server ID (for faster slash-command registration) |
| `LOG_LEVEL` | No | `debug` / `info` / `warn` / `error` (defaults to `info`) |

### 3. Set Discord bot permissions

When inviting the bot, grant at least these **privileged intents**:

- **Server Members Intent** (not required for current tools, but recommended)
- **Message Content Intent** (required — Nemo reads message content)
- **Server Messages Intent** (recommended)

And these **bot permissions** in the server:

- View Channels
- Send Messages
- Send Messages in Threads
- Manage Messages (delete/edit)
- Pin Messages
- Add Reactions
- Create Public Threads
- Create Private Threads
- Read Message History
- Manage Channels (required for `create_project_channels`)

### 4. Run

```bash
# Production
npm start

# Development (auto-restart on file change)
npm run dev
```

You should see:

```
[12:00:00] Nemo starting...
[12:00:01] Logged in as Nemo#1234
```

---

## Usage Examples

Nemo is triggered by @mention. Once mentioned, it decides whether to read Discord state, take action, or reply in plain language.

### Coordination

```
You: @Nemo create a thread called "Sprint 14 Planning" in this channel
Nemo: Created the thread "Sprint 14 Planning" — it's ready for discussion.

You: @Nemo send a message to #dev saying "Deploy is blocked on the DB migration"
Nemo: Sent the message to #dev. The team should see it shortly.

You: @Nemo pin this message
Nemo: Pinned the message for easy reference.
```

### Context gathering

```
You: @Nemo what channels are in this server?
Nemo: Here's what I found in this guild — #general, #dev, #milestones, and #project.

You: @Nemo show me recent messages in #project
Nemo: From last 20 messages in #project:
  [alice]: updated the API spec
  [bob]: QA results are in
  [carol]: block on infra

You: @Nemo what threads are active right now?
Nemo: I found 3 active threads, including "Sprint 14 Planning" and "Infra incident".
```

### Project reading

```
You: @Nemo summarize #milestones
Nemo: I read the #milestones channel and found 5 milestone posts. The most recent says "Beta launch — status: pending — owner: Korede". Want me to check for blockers?

You: @Nemo list upcoming server events
Nemo: Upcoming events:
  - "Sprint Review" on July 10
  - "All-hands" on July 15
```

---

## Testing

Nemo ships with a layered test suite using Node's built-in test runner:

```bash
# Core suite (tools, behavior, API)
npm test

# Adversarial tests only
npm run test:adversarial

# Everything
npm run test:all
```

| Script | What it covers |
|--------|----------------|
| `npm test` | Tool schemas, agent behavior, API integration |
| `npm run test:adversarial` | Edge cases, malformed input, permission failures |
| `npm run test:all` | The full `src/tests/*.test.js` suite |

Tests run with `NODE_ENV=test`, which disables env validation so suites can import without real credentials.

---

## Project Structure

```
nemo/
├── src/
│   ├── index.js                      # Entry point — Discord client login & event wiring
│   ├── agent/
│   │   └── agent.js                  # ReAct loop, LLM init, tool binding
│   ├── bot/
│   │   └── onMessage.js              # Message handler with retry wrapper
│   ├── discord/
│   │   ├── tools/
│   │   │   ├── index.js              # Tool registry and factory bindings
│   │   │   ├── action/
│   │   │   │   ├── index.js
│   │   │   │   ├── messages.js
│   │   │   │   ├── threads.js
│   │   │   │   ├── reactions.js
│   │   │   │   └── channels.js
│   │   │   ├── context/
│   │   │   │   ├── index.js
│   │   │   │   ├── channels.js
│   │   │   │   ├── messages.js
│   │   │   │   ├── threads.js
│   │   │   │   ├── members.js
│   │   │   │   ├── milestones.js
│   │   │   │   ├── introductions.js
│   │   │   │   ├── servers.js
│   │   │   │   └── events.js
│   │   │   └── shared/
│   │   │       ├── factory.js
│   │   │       ├── permissions.js
│   │   │       ├── schemas.js
│   │   │       └── response.js
│   │   ├── context.js                # Extracts channel/author/mention context
│   │   └── permissions.js            # Per-tool permission checks
│   ├── config/
│   │   ├── env.js                    # Zod env validation
│   │   ├── constants.js              # Tool names, permission map, LLM defaults
│   │   ├── logger.js                 # Structured leveled logger
│   │   └── systemPrompt.js           # Nemo persona and PM behavior prompt
│   └── tests/
│       ├── tools.test.js
│       ├── behavior.test.js
│       ├── api.test.js
│       ├── contextTools.test.js
│       ├── systemPrompt.test.js
│       ├── actionChannels.test.js
│       ├── adversarial-tools.test.js
│       ├── adversarial-agent.test.js
│       ├── adversarial-onmessage.test.js
│       ├── adversarial-project-tools.test.js
│       └── adversarial-security.test.js
├── .env.example
├── package.json
└── README.md
```

---

## Reliability

- **Retry with backoff** — `onMessage` wraps the agent call in `async-retry` (3 attempts, 2s–30s backoff). Only transient failures are retried.
- **Non-retryable errors fail fast** — Content moderation blocks, 4xx client errors, and unknown tool calls are not retried.
- **Graceful degradation** — Discord shard disconnects auto-reconnect. Unhandled rejections and uncaught exceptions are logged but do not crash the process.
- **Input guards** — Zod schemas enforce content length (max 2000 chars), required fields, and enum constraints on every tool call.

---

## Security Notes

- **Never commit your `.env`** — it is in `.gitignore`.
- DMs are supported for server members only. Nemo uses a lightweight last-seen-server memory to guess the project context, but if that context is missing it will ask for clarification instead of guessing.
- Tool execution is permission-gated at the Discord role level — the bot can only do what your server allows.
- Keep your `DISCORD_TOKEN` and `OPENAI_API_KEY` private. Rotate them if exposed.

---

## Troubleshooting

- **Nemo doesn't reply in DMs** — Make sure the DM sender is a member of at least one server with Nemo, and that they have mentioned Nemo there at least once so a last-seen server is cached.
- **Permission errors** — The bot needs `Read Message History` for milestone/thread tools and `Manage Channels` for `create_project_channels`.
- **Missing `.env` values** — Startup validation will fail loudly if required variables are absent. Check your `.env` and restart.
- **LLM errors** — Check `OPENAI_BASE_URL`, `OPENAI_MODEL`, and your API key. Nemo reports tool or LLM call failures as normal replies when possible.
- **Slow replies** — Nemo may fetch recent channel history and then run up to 6 LLM iterations with tool calls. On busy servers, replies can take longer than a simple bot.

---

## Direct Messages

Nemo supports DMs, but with a narrower contract than server channels.

- **Server membership required** — DMs from non-members are ignored.
- **Last-seen server heuristic** — Nemo remembers the last server where a user mentioned it, and uses that as the default project context in DMs.
- **No cached project yet** — If there is no last-seen server for the user, Nemo replies with a short prompt asking them to mention Nemo in the relevant server first.
- **Guild-specific tools still need a server** — Some actions, like milestone reads or project-channel setup, remain tied to a specific guild. In ambiguous cases, Nemo will ask which project before acting.

---

## Current Scope

This version focuses on **Discord-native coordination and state reading**:

- Acting on messages, threads, reactions, and required project channels
- Reading channel layout, message history, members, introductions, milestones, and events
- Conversational assistance grounded in actual server state

**Not yet implemented:**

- Persistent task ownership and structured milestone CRUD
- Scheduled reminders and recurring check-ins
- Risk detection dashboards and external tracker integrations
- Slash commands and confirmation guardrails for destructive actions
- Long-term memory across restarts or channels

These are planned for future releases based on current usage patterns.

---

## Roadmap

Nemo is actively evolving. Planned capabilities:

- [ ] Slash command registration and interaction support
- [ ] Persistent project state (milestones, deadlines, task ownership)
- [ ] Scheduled reminders and recurring check-ins
- [ ] Risk detection and status dashboards
- [ ] Multi-server project templates
- [ ] Integration with external trackers (Jira, GitHub Issues, Linear)
- [ ] Confirmation guardrails for destructive edits/deletes
- [ ] Rate/cost controls for high-traffic servers

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Write tests for new tools or behavior
4. Ensure `npm run test:all` passes
5. Open a PR with a clear description

---

## License

MIT © Korede Faleye

---

## Author

**Korede Faleye** — [GitHub](https://github.com/kore4lyf)

---

Nemo is named after the clownfish — small, alert, and always keeping the reef organized.
