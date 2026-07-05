# Nemo — AI Project Manager for Discord

> An intelligent Discord assistant that helps teams plan, organize, monitor, and execute projects — acting as an always-on assistant project manager in your server.

Nemo maintains awareness of your project's state, team structure, objectives, timeline, and progress. It provides reminders, tracks milestones, identifies risks, answers questions, and keeps the team aligned — all through natural conversation in Discord channels and threads.

---

## Features

- **Conversational project management** — Talk to Nemo in plain language. It decides what to do, calls the right Discord tools, and reports back.
- **ReAct agent loop** — Powered by a LangChain reasoning-acting loop: the LLM reasons about each request, selects tools, executes them, and synthesizes a response.
- **23 Discord tools** — Send/edit/delete/pin messages, create threads, add reactions, inspect channels, list threads, get member info, check project channels, and more.
- **Permission-aware** — Every tool checks the bot's actual Discord permissions before acting. If a permission is missing, Nemo reports it cleanly instead of crashing.
- **Resilient by design** — Transient network/API failures are retried with exponential backoff. Rate limits (429) and 5xx errors are retried; content-moderation blocks fail fast.
- **Structured logging** — Timestamped, leveled logging (debug/info/warn/error) with a configurable `LOG_LEVEL`.
- **Environment-validated** — Required env vars are checked at startup via Zod. Crash early, not mid-request.
- **Tested** — Behavior tests, tool tests, API tests, and adversarial test suites included.

---

## Architecture

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
           | context.js|          |  tools.js (x10) |   | permissions.js |
           | (extracts |          | (LangChain tools)|   | (per-tool gate)|
           |  channel, |          +-----------------+   +----------------+
           |  author,  |
           |  mentions)|
           +-----------+
```

### Request flow

1. A user sends a message in a channel where Nemo is present.
2. `onMessage` filters out bot messages, then calls `processWithAgent` through a retry wrapper.
3. `processWithAgent`:
   - Builds all 23 Discord tools bound to the live client.
   - Initializes a `ChatOpenAI` LLM and binds the tools to it.
   - Extracts Discord context (channel, author, mentions) and injects it into the system prompt.
   - Runs a **ReAct loop** (max 6 iterations): LLM → tool calls → execute → feed results back → repeat until the LLM returns a final text response.
4. The final response is sent as a reply to the original message.

---

## Tools and Permissions

Nemo's agent has access to 23 Discord tools. Each tool is gated by a permission check before execution.

### Action Tools

| Tool | Action | Required Discord Permission |
|------|--------|------------------------------|
| `send_message` | Send a text/embed message to a channel | `SendMessages` |
| `pin_message` | Pin a message in a channel | `PinMessages` |
| `unpin_message` | Remove a pin | `PinMessages` |
| `create_thread` | Create a public or private thread | `CreatePublicThreads` / `CreatePrivateThreads` |
| `send_thread_message` | Post a message inside an existing thread | `SendMessagesInThreads` |
| `add_reaction` | Add an emoji reaction to a message | `AddReactions` |
| `delete_message` | Delete a message (with confirmation) | `ManageMessages` |
| `edit_message` | Edit a previously sent message (with confirmation) | `ManageMessages` |

### Context Tools

| Tool | Action | Required Discord Permission |
|------|--------|------------------------------|
| `get_members` | List server members with roles and status | `ViewChannel` |
| `get_channels` | List all channels in a server | `ViewChannel` |
| `get_channel_info` | Fetch channel metadata | `ViewChannel` |
| `get_pinned_messages` | Get pinned messages in a channel | `ReadMessageHistory` |
| `get_recent_messages` | Get recent messages in a channel | `ReadMessageHistory` |
| `get_message` | Get a specific message by ID | `ReadMessageHistory` |
| `get_active_threads` | List active threads | `ViewChannel` |
| `list_threads` | List threads by channel or guild | `ViewChannel` |
| `get_thread_history` | Get message history of a thread | `ReadMessageHistory` |
| `get_server_state` | Get server overview (members, channels, threads) | `ViewChannel` |
| `get_milestones` | Read messages from #milestones channel | `ReadMessageHistory` |
| `get_introduction` | Read messages from #introduction channel | `ReadMessageHistory` |
| `check_project_channels` | Check if required project channels exist | `ViewChannel` |
| `create_project_channels` | Create missing project channels | `ManageChannels` |
| `get_events` | List scheduled events | `ViewChannel` |

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
OPENAI_MODEL=gpt-4o-mini
CLIENT_ID=your_bot_client_id
GUILD_ID=optional_guild_id_for_dev
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Bot token from the Discord Developer Portal |
| `OPENAI_API_KEY` | Yes | API key for your LLM provider |
| `OPENAI_BASE_URL` | No | Defaults to `https://api.aimlapi.com/v1`. Any OpenAI-compatible endpoint works. |
| `OPENAI_MODEL` | No | Defaults to `alibaba/qwen3-vl-flash` |
| `CLIENT_ID` | Yes | Bot application/client ID |
| `GUILD_ID` | No | Dev server ID (for faster slash-command registration) |
| `LOG_LEVEL` | No | `debug` / `info` / `warn` / `error` (defaults to `info`) |

### 3. Set Discord bot permissions

When inviting the bot, grant at least these **privileged intents**:

- **Server Members Intent** (required for `get_members` with presence)
- **Server Presences Intent** (required for member status info)
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
│   ├── index.js              # Entry point — Discord client login & event wiring
│   ├── agent/
│   │   └── agent.js          # ReAct loop, LLM init, tool binding
│   ├── bot/
│   │   └── onMessage.js      # Message handler with retry wrapper
│   ├── discord/
│   │   ├── tools.js          # 10 LangChain tool definitions
│   │   ├── permissions.js    # Per-tool permission checks
│   │   └── context.js        # Extracts channel/author/mention context
│   ├── config/
│   │   ├── env.js            # Zod env validation
│   │   ├── constants.js      # Tool names, permission map, LLM defaults
│   │   └── logger.js         # Structured leveled logger
│   └── tests/
│       ├── tools.test.js
│       ├── behavior.test.js
│       ├── api.test.js
│       └── adversarial-*.test.js
├── .env.example
├── package.json
└── README.md
```

---

## Usage Examples

Once Nemo is running, just talk to it in any channel it can see:

```
You: @Nemo create a thread called "Sprint 14 Planning" in this channel
Nemo: Created the thread "Sprint 14 Planning" — it's ready for discussion.

You: @Nemo pin the last message in this channel
Nemo: Pinned the message for easy reference.

You: @Nemo what channels are in this server?
Nemo: Here's what I found — #general (text), #dev (text), #sprint-14 (thread)…

You: @Nemo send a message to #dev saying "Deploy is blocked on the DB migration"
Nemo: Sent the message to #dev. The team should see it shortly.
```

Nemo decides autonomously whether a request needs a tool call or a plain text reply.

---

## Reliability

- **Retry with backoff** — `onMessage` wraps the agent call in `async-retry` (3 attempts, 2s–30s backoff). Only transient failures are retried.
- **Non-retryable errors fail fast** — Content moderation blocks, 4xx client errors, and unknown tool calls are not retried.
- **Graceful degradation** — Discord shard disconnects auto-reconnect. Unhandled rejections and uncaught exceptions are logged but do not crash the process.
- **Input guards** — Zod schemas enforce content length (max 2000 chars), required fields, and enum constraints on every tool call.

---

## Security Notes

- **Never commit your `.env`** — it is in `.gitignore`.
- The bot only acts on messages it can see; it does not read DMs unless the user explicitly opts in via intents.
- Tool execution is permission-gated at the Discord role level — the bot can only do what your server allows.
- Keep your `DISCORD_TOKEN` and `OPENAI_API_KEY` private. Rotate them if exposed.

---

## Roadmap

Nemo is actively evolving. Planned capabilities:

- [ ] Slash command registration and interaction support
- [ ] Persistent project state (milestones, deadlines, task ownership)
- [ ] Scheduled reminders and recurring check-ins
- [ ] Risk detection and status dashboards
- [ ] Multi-server project templates
- [ ] Integration with external trackers (Jira, GitHub Issues, Linear)

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
