# Nemo — AI Project Manager for Discord

> An intelligent Discord assistant that helps teams plan, organize, monitor, and execute projects — acting as an always-on assistant project manager in your server.

Nemo maintains awareness of your project's state, team structure, objectives, timeline, and progress. It provides reminders, tracks milestones, identifies risks, answers questions, and keeps the team aligned — all through natural conversation in Discord channels and threads.

---

## Features

- **Conversational project management** — Talk to Nemo in plain language. It decides what to do, calls the right Discord tools, and reports back.
- **ReAct agent loop** — Powered by a LangChain reasoning-acting loop: the LLM reasons about each request, selects tools, executes them, and synthesizes a response.
- **25 Discord tools** — Send/edit/delete/pin messages, create threads, add reactions, inspect channels, list threads, get member info, check project channels, and more.
- **Permission-aware** — Every tool checks the bot's actual Discord permissions before acting. If a permission is missing, Nemo reports it cleanly instead of crashing.
- **Resilient by design** — Transient network/API failures are retried with exponential backoff. Rate limits (429) and 5xx errors are retried; content-moderation blocks fail fast.
- **Structured logging** — Timestamped, leveled logging (debug/info/warn/error) with a configurable `LOG_LEVEL`.
- **Environment-validated** — Required env vars are checked at startup via Zod. Crash early, not mid-request.
- **Tested** — 242 tests across 9 test files (tool schemas, behavior, adversarial, agent loop).

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
           | context.js|          |  tools/         |   | permissions.js |
           | (extracts |          | (25 tools)     |   | (per-tool gate)|
           |  channel, |          +-----------------+   +----------------+
           |  author,  |
           |  mentions)|
           +-----------+
```

### Request flow

1. A user sends a message mentioning Nemo in a channel.
2. `onMessage` filters bot messages, applies retry wrapper, enforces cooldown.
3. `processWithAgent`:
   - Builds all 25 Discord tools bound to the live client + triggering message.
   - Initializes `ChatOpenAI` LLM (temperature 0) and binds tools.
   - Extracts Discord context and injects it into the system prompt.
   - Runs a **ReAct loop** (max 6 iterations): LLM → tool calls → execute → feed truncated results back → repeat until text response.
4. Long responses are chunked into ≤2000-char Discord messages.

---

## Tools and Permissions

Nemo's agent has access to **25 Discord tools** organized in `action/` + `context/` directories (`src/discord/tools/`). Each tool checks permissions before execution.

### Action Tools

| Tool | Action | Required Discord Permission |
|------|--------|------------------------------|
| `send_message` | Send a text/embed message to a channel | `SendMessages` |
| `pin_message` | Pin a message in a channel | `PinMessages` |
| `unpin_message` | Remove a pin | `PinMessages` |
| `create_thread` | Create a public or private thread | `CreatePublicThreads` / `CreatePrivateThreads` |
| `send_thread_message` | Post a message inside an existing thread | `SendMessagesInThreads` |
| `add_reaction` | Add an emoji reaction to a message | `AddReactions` |
| `delete_message` | Delete a message (bot-authored only) | `ManageMessages` |
| `edit_message` | Edit a message (bot-authored only) | `ManageMessages` |
| `create_project_channels` | Create missing project channels | `ManageChannels` |

### Context Tools

| Tool | Action | Required Discord Permission |
|------|--------|------------------------------|
| `get_members` | List server members with roles | `ViewChannel` |
| `get_channels` | List all channels in a server | `ViewChannel` |
| `get_channel_info` | Fetch channel metadata | `ViewChannel` |
| `get_pinned_messages` | Get pinned messages in a channel | `ReadMessageHistory` |
| `get_recent_messages` | Get recent messages (capped) | `ReadMessageHistory` |
| `get_message` | Get a specific message by ID | `ReadMessageHistory` |
| `get_active_threads` | List active threads | `ViewChannel` |
| `list_threads` | List threads by channel or guild | `ViewChannel` |
| `get_thread_history` | Get message history of a thread | `ReadMessageHistory` |
| `get_server_state` | Get server overview | `ViewChannel` |
| `get_milestones` | Read messages from #milestones | `ReadMessageHistory` |
| `get_introduction` | Read messages from #introduction | `ReadMessageHistory` |
| `check_project_channels` | Check if required channels exist | `ViewChannel` |
| `get_events` | List scheduled events | `ViewChannel` |

---

## Getting Started

### Prerequisites

- **Node.js 20+** (ESM + fetch)
- A **Discord bot application** with a token
- An **OpenAI-compatible API key**

### 1. Clone and install

```bash
git clone https://github.com/kore4lyf/nemo.git
cd nemo
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=your_discord_bot_token
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.aimlapi.com/v1
OPENAI_MODEL=alibaba/qwen3-vl-flash
CLIENT_ID=your_bot_client_id
LOG_LEVEL=info
```

### 3. Set Discord bot permissions

Grant these **privileged intents**:
- Server Members Intent
- Message Content Intent

And these **bot permissions**:
- View Channels, Send Messages, Send Messages in Threads
- Manage Messages, Pin Messages, Add Reactions
- Create Public/Private Threads, Read Message History

### 4. Run

```bash
npm start        # Production
npm run dev      # Development (auto-restart)
```

---

## Testing

```bash
npm test                # Core suite
npm run test:adversarial  # Edge cases only
npm run test:all          # Full suite (242 tests)
```

---

## Project Structure

```
nemo/
├── src/
│   ├── index.js              # Entry point — login + event wiring
│   ├── agent/
│   │   └── agent.js          # ReAct loop, LLM init, tool binding
│   ├── bot/
│   │   ├── onMessage.js      # Handler with retry + chunking
│   │   └── queue.js          # P-queue + cooldown
│   ├── discord/
│   │   ├── tools/
│   │   │   ├── action/       # 8 tools
│   │   │   ├── context/      # 16 tools
│   │   │   └── shared/       # factory, permissions, sweep
│   │   ├── context.js        # Extracts context
│   │   └── tools/index.js    # Aggregates tools
│   ├── config/
│   │   ├── env.js
│   │   ├── constants.js
│   │   ├── logger.js
│   │   └── systemPrompt.js   # AGENTS.md hot-reload
│   └── tests/                # 9 test files
```

---

## Usage Examples

```
@Nemo create a thread called "Sprint 14 Planning"
@Nemo pin the last message in #project
@Nemo what channels are in this server?
@Nemo send a message to #dev saying "Deploy blocked on DB migration"
```

---

## Reliability

- Retry with exponential backoff (network, 429, 5xx)
- Non-retryable errors fail fast (moderation, 4xx)
- Cooldown feedback on rapid-fire mentions
- Reply chunking for long answers

---

## Security Notes

- Never commit `.env`
- Tool execution respects Discord role permissions
- Edit/delete only works on bot-authored messages

---

## Roadmap

- [ ] Slash command support
- [ ] Scheduled reminders (stored in pinned messages)
- [ ] Risk detection/dashboard
- [ ] Multi-server support
- [ ] External integrations (GitHub, Jira, Linear)

---

MIT © Korede Faleye