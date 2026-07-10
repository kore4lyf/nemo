# Nemo — Expert Review Prompt

Copy the content below into ChatGPT (or your preferred LLM) and paste the relevant code files / docs when prompted.

---

## Prompt to Send

```
You are an experienced software architect and AI engineer reviewing a Discord project-management bot called Nemo. I need a thorough, honest, no-fluff review of everything — docs, architecture, code quality, system prompt design, deployment, testing, and potential improvements.

## Project TL;DR

Nemo is an AI agent that lives in a Discord server as a project manager. Users @mention it and it runs a ReAct loop (LangChain) with 23 Discord tools bound to an LLM. The LLM decides which tools to call, executes them, feeds results back in, and eventually returns a text reply. The server IS the project state — no database, no Kanban board, no external storage. Milestones, introductions, and events live as Discord messages in canonical channels.

Tech stack: Node.js 20, LangChain.js, discord.js v14, OpenAI-compatible API (currently Kilo AI), Zod, log4js, async-retry, p-queue. ~5,900 lines of JavaScript.

---

## Roadmap for Review

Go through each section below and give me your assessment, concerns, and specific improvement suggestions.

---

### 1. Concept & Product Decisions

The core idea: Nemo has NO database. The Discord server IS the database — channels ARE the project plan (milestones channel = plan of record, introductions = team roster, events = calendar). Nemo reads the server fresh on every message. This is explicit and intentional.

Questions:
- Is "server as database" a viable approach for a PM bot, or does it become a trap as the project scales? Where does it break first?
- The system prompt enforces that Nemo does not maintain a separate task list, does not auto-create channels, does not parse milestones into structured records. Sound constraints or overly restrictive?
- Compare this approach to a bot with SQLite + slash commands. What's the real tradeoff?
- Should Nemo eventually write structured data (e.g., JSON in a hidden channel, or a real DB), or is the plain-text-in-channels approach sustainable?

---

### 2. Architecture & Flow

Current flow:
```
Discord Message → onMessage.js (dedup + cooldown + retry wrapper + p-queue)
  → processWithAgent (agent.js)
    → Build 23 tools bound to client + message
    → Init ChatOpenAI LLM with tools bound
    → Extract Discord context (channel, author, mentions)
    → Fetch last 10 non-bot messages as conversation memory
    → ReAct loop (max 6 iterations):
        LLM.invoke(messages) → tool_calls? → execute each → append results → repeat
        → If no tool_calls, return final text
        → If exhausted, ask LLM to summarise
    → Reply to original message in Discord
```

Questions:
- The ReAct loop is a simple for-loop with no branching or agent routing. When does this pattern break? What are the signs that we need a more sophisticated agent architecture (sub-agents, routing, planner vs. executor)?
- 6 max iterations — how did we arrive at this? Should it be dynamic based on request complexity?
- Conversation memory is just the last 10 messages in the channel. Fine for short exchanges, but what happens with long-running project threads? Any alternative approaches?
- LangChain's ChatOpenAI with bindTools is the backbone. Are there hidden pain points with this approach vs. a lighter invoke-the-API-directly pattern?

---

### 3. Code Quality & Structure (~5,900 lines of JS)

Key structural decisions:
- ESM modules throughout
- tool tree: `tools/action/` (8 tools: send, pin, delete, edit, react, thread, channel ops) and `tools/context/` (15 tools: read channels, members, messages, milestones, introductions, events, threads, server state)
- Each tool is a LangChain StructuredTool with Zod input schemas
- Permission check on every tool call (gate pattern)
- `shared/factory.js` creates tools with consistent error handling
- Single entry point: `buildAllTools()` aggregates everything
- Back-compat re-exports preserved for tests
- Agent trace logging added recently (`nemo-agent.log`, JSON-per-request)

Files to review (I'll paste on request):
- `src/agent/agent.js` — ReAct loop, LLM init, tool binding
- `src/bot/onMessage.js` — message handler, dedup, retry, queue
- `src/discord/tools/` — all 23 tool definitions + factory + permissions + schemas
- `src/discord/context.js` — context extraction
- `src/bot/queue.js` — p-queue setup + cooldown
- `src/config/systemPrompt.js` — AGENTS.md loader with mtime-based cache invalidation
- `src/config/log4js.js` / `logger.js` — logging setup
- `src/config/env.js` — Zod env validation
- `src/logging/conversationLogger.js` / agent trace — logging

Questions:
- Is the tool tree well-structured for 23 tools? How would it scale to 50+?
- The factory pattern for creating tools — is it pulling its weight or adding indirection?
- ESM modules with LangChain v1 — any compatibility edge cases we should plan for?
- Error handling pattern: each tool catches errors and returns `{success: false, error: string}` instead of throwing. Good or bad for an LLM-based agent?
- The back-compat re-exports in `tools/index.js` are growing. Any cleanup strategy?
- For a bot that reads Discord channels, how much test coverage is actually meaningful? We have unit tests for tool schemas, behavior tests, and adversarial tests. Integration tests need real Discord credentials — worth the effort?

---

### 4. System Prompt / Persona Design (AGENTS.md)

The entire persona is in a markdown file at project root: `AGENTS.md`. It's hot-reloaded (mtime check on every `getSystemPrompt()` call so editing the file updates behavior without restart).

Sections:
1. Identity — "You are Nemo, a project manager, not a chatbot"
2. Voice — short, no fluff, plain language, say when you don't know
3. Operating Principles — 6 rules (read before write, confirm destructive actions, filter don't dump, one toolcall path per intent, no secrets, honest gap)
4. PM Behavior — reads the room, keeps plan coherent, surfaces blockers, coordinates not commands, uses threads/mentions correctly

Questions:
- The prompt is ~3,200 words. For an LLM with 128K+ context, this is fine — but does any of it fight the model's own instruction-following tendencies (e.g., "don't say you're an AI" when the model is trained to disclose)?
- Principle #4: "One toolcall path per intent. Do not chain speculative reads." Models naturally want to gather all data before replying. Does this instruction actually reduce iteration count, or does it cause the model to make multiple passes it wouldn't otherwise?
- "No fluff" style is explicit. Do LLMs reliably follow "No 'Sure thing!', no 'I'd be happy to help'" when they're trained to be agreeable?
- The "server IS the project state" philosophy means Nemo never claims memory across sessions. Is this adequately explained in the prompt, or will users expect Nemo to remember things?
- Hot-reload of AGENTS.md is convenient for iteration — any risks with partial reads during hot-reload?

---

### 5. Deployment

- Containerized: multi-stage Dockerfile (node:20-slim, 150MB image)
- Running on justrunmy.app (free tier: 0.15 vCPU, 150MB RAM)
- Health server on port 8080 (returns `{status, uptime, discord, queueSize}`)
- HEALTHCHECK every 24h for platform keepalive
- External TCP port mapped for platform health pings
- Git push to deploy (justrunmy remote configured)
- Agent trace logs to `logs/nemo-agent.log` (rotated at 50MB, 20 backups)

Questions:
- For a Discord bot with no exposed web service, is a 150MB Node.js image reasonable? Any obvious optimizations?
- Free tier limits: 0.15 vCPU, 150MB RAM. For a bot handling a single server with low traffic, how far does this stretch? What breaks first?
- The health server exists mainly to give the platform a TCP endpoint to ping. Any simpler approach?
- Should we add a structured log shipping mechanism (e.g., log to stdout in JSON for the platform to capture)?

---

### 6. What's Missing

Known gaps (not yet built):
- No slash command support (text @mention only)
- No scheduled reminders or cron-based check-ins
- No persistent milestone/task state across restarts
- No risk detection or dashboard
- No multi-server support
- No integration with external tools (GitHub, Jira, Linear)

Questions:
- Of these gaps, which should be next based on the "server as state" philosophy? What order makes sense?
- Any architectural changes needed NOW to support these later, or can they be layered on incrementally?
- Slash commands vs. continued @mention-only — is there a reason to invest in interactions before Nemo's core value is proven?

---

## Deliverable

Please give me:

1. A list of the top 5-7 things I should fix or change right now (in priority order).
2. One thing you think is already well-designed (so I know what not to break).
3. For each of the questions in the sections above, your answer (even if it's "not worth worrying about yet").
4. Any blind spots I clearly have based on what I've shared.

Be blunt. I'd rather hear the hard truth now than build on a weak foundation.
```

---

## How to Use This

1. Copy the prompt above into ChatGPT.
2. When it asks for code, paste the key files:
   - `src/agent/agent.js` — the ReAct loop
   - `src/bot/onMessage.js` — message handling
   - `src/discord/tools/index.js` — tool aggregation
   - `src/discord/context.js` — context extraction
   - `AGENTS.md` — the system prompt
   - `Dockerfile` — deployment
   - Any other file the reviewer asks for

3. Share the GitHub repo: **github.com/kore4lyf/nemo**
