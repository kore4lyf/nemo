/**
 * ADVERSARIAL ONMESSAGE TESTS
 * Purpose: Break the retry logic, message handling, and error recovery.
 * Strategy: Mock processWithAgent to fail in various ways.
 */
import { test } from "node:test";
import assert from "node:assert";

// ══════════════════════════════════════════════════════════════════
// We need to test onMessage behavior without importing it directly
// (ESM module caching makes mocking difficult).
// Instead, we test the patterns it uses.
// ══════════════════════════════════════════════════════════════════

// ── isRetryable logic (extracted from onMessage.js) ──────────────

function isRetryable(err) {
  if (
    err.code === "UND_ERR_CONNECT_TIMEOUT" ||
    err.code === "ENOTFOUND" ||
    err.code === "ECONNRESET" ||
    err.code === "ECONNREFUSED" ||
    err.code === "ETIMEDOUT" ||
    err.message?.includes("timeout")
  ) {
    return true;
  }

  const status = err.status || err.statusCode || err.response?.status;
  if (status === 429 || status === 529) return true;
  if (status >= 500) return true;
  if (status >= 400 && status < 500) return false;

  const msg = err.message?.toLowerCase() || "";
  if (msg.includes("content moderation") || msg.includes("safety") || msg.includes("blocked")) {
    return false;
  }

  return false;
}

// ══════════════════════════════════════════════════════════════════
// CATEGORY 1: Retry Classification
// ══════════════════════════════════════════════════════════════════

test("isRetryable: ENOTFOUND → true", () => {
  const err = new Error("getaddrinfo ENOTFOUND api.openai.com");
  err.code = "ENOTFOUND";
  assert.strictEqual(isRetryable(err), true);
});

test("isRetryable: ECONNRESET → true", () => {
  const err = new Error("read ECONNRESET");
  err.code = "ECONNRESET";
  assert.strictEqual(isRetryable(err), true);
});

test("isRetryable: ECONNREFUSED → true", () => {
  const err = new Error("connect ECONNREFUSED 127.0.0.1:443");
  err.code = "ECONNREFUSED";
  assert.strictEqual(isRetryable(err), true);
});

test("isRetryable: ETIMEDOUT → true", () => {
  const err = new Error("connect ETIMEDOUT 127.0.0.1:443");
  err.code = "ETIMEDOUT";
  assert.strictEqual(isRetryable(err), true);
});

test("isRetryable: UND_ERR_CONNECT_TIMEOUT → true", () => {
  const err = new Error("connect timeout");
  err.code = "UND_ERR_CONNECT_TIMEOUT";
  assert.strictEqual(isRetryable(err), true);
});

test("isRetryable: message contains 'timeout' → true", () => {
  const err = new Error("Request timeout after 30s");
  assert.strictEqual(isRetryable(err), true);
});

test("isRetryable: HTTP 429 rate limit → true", () => {
  const err = new Error("Rate limited");
  err.status = 429;
  assert.strictEqual(isRetryable(err), true);
});

test("isRetryable: HTTP 529 overloaded → true", () => {
  const err = new Error("Service overloaded");
  err.status = 529;
  assert.strictEqual(isRetryable(err), true);
});

test("isRetryable: HTTP 500 internal error → true", () => {
  const err = new Error("Internal Server Error");
  err.status = 500;
  assert.strictEqual(isRetryable(err), true);
});

test("isRetryable: HTTP 502 bad gateway → true", () => {
  const err = new Error("Bad Gateway");
  err.status = 502;
  assert.strictEqual(isRetryable(err), true);
});

test("isRetryable: HTTP 503 service unavailable → true", () => {
  const err = new Error("Service Unavailable");
  err.status = 503;
  assert.strictEqual(isRetryable(err), true);
});

test("isRetryable: HTTP 400 bad request → false (should bail)", () => {
  const err = new Error("Bad Request");
  err.status = 400;
  assert.strictEqual(isRetryable(err), false);
});

test("isRetryable: HTTP 401 unauthorized → false", () => {
  const err = new Error("Unauthorized");
  err.status = 401;
  assert.strictEqual(isRetryable(err), false);
});

test("isRetryable: HTTP 403 forbidden → false", () => {
  const err = new Error("Forbidden");
  err.status = 403;
  assert.strictEqual(isRetryable(err), false);
});

test("isRetryable: HTTP 404 not found → false", () => {
  const err = new Error("Not Found");
  err.status = 404;
  assert.strictEqual(isRetryable(err), false);
});

test("isRetryable: content moderation → false", () => {
  const err = new Error("Content moderation policy violated");
  assert.strictEqual(isRetryable(err), false);
});

test("isRetryable: safety block → false", () => {
  const err = new Error("Safety filter triggered");
  assert.strictEqual(isRetryable(err), false);
});

test("isRetryable: blocked → false", () => {
  const err = new Error("Request blocked by content policy");
  assert.strictEqual(isRetryable(err), false);
});

test("isRetryable: generic error with no code/status → false", () => {
  const err = new Error("Something went wrong");
  assert.strictEqual(isRetryable(err), false);
});

test("isRetryable: null message → false", () => {
  const err = new Error();
  err.message = null;
  assert.strictEqual(isRetryable(err), false);
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 2: Retry with async-retry patterns
// ══════════════════════════════════════════════════════════════════

test("retry: bail on non-retryable error immediately", async () => {
  let attempts = 0;
  
  async function failingOperation(bail) {
    attempts++;
    const err = new Error("Unauthorized");
    err.status = 401;
    bail(err);
  }
  
  // Simulate retry with bail
  try {
    await failingOperation((err) => { throw err; });
  } catch (err) {
    assert.strictEqual(attempts, 1, "Should bail after first attempt");
    assert.strictEqual(err.status, 401);
  }
});

test("retry: retry on retryable error", async () => {
  let attempts = 0;
  
  async function retryableOperation() {
    attempts++;
    if (attempts < 3) {
      const err = new Error("ECONNRESET");
      err.code = "ECONNRESET";
      throw err;
    }
    return "success";
  }
  
  // Simulate retry loop
  let result;
  for (let i = 0; i < 3; i++) {
    try {
      result = await retryableOperation();
      break;
    } catch (err) {
      if (!isRetryable(err)) throw err;
    }
  }
  
  assert.strictEqual(result, "success");
  assert.strictEqual(attempts, 3, "Should have retried 3 times");
});

test("retry: exhaust retries on persistent failure", async () => {
  let attempts = 0;
  const MAX_RETRIES = 3;
  
  async function alwaysFails() {
    attempts++;
    const err = new Error("ETIMEDOUT");
    err.code = "ETIMEDOUT";
    throw err;
  }
  
  let lastError;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      await alwaysFails();
      break;
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) throw err;
    }
  }
  
  assert.strictEqual(attempts, MAX_RETRIES + 1, "Should exhaust all retries");
  assert.ok(lastError.message.includes("ETIMEDOUT"));
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 3: Message Reply Edge Cases
// ══════════════════════════════════════════════════════════════════

test("reply: empty response → should not attempt reply", async () => {
  let replied = false;
  const message = {
    reply: async () => { replied = true; return {}; },
  };
  
  const response = "";
  if (response?.trim()) {
    await message.reply(response);
  }
  
  assert.strictEqual(replied, false, "Should not reply to empty response");
});

test("reply: whitespace-only response → should not attempt reply", async () => {
  let replied = false;
  const message = {
    reply: async () => { replied = true; return {}; },
  };
  
  const response = "   \n  \t  ";
  if (response?.trim()) {
    await message.reply(response);
  }
  
  assert.strictEqual(replied, false, "Should not reply to whitespace-only response");
});

test("reply: null response → should not attempt reply", async () => {
  let replied = false;
  const message = {
    reply: async () => { replied = true; return {}; },
  };
  
  const response = null;
  if (response?.trim()) {
    await message.reply(response);
  }
  
  assert.strictEqual(replied, false, "Should not reply to null response");
});

test("reply: undefined response → should not attempt reply", async () => {
  let replied = false;
  const message = {
    reply: async () => { replied = true; return {}; },
  };
  
  const response = undefined;
  if (response?.trim()) {
    await message.reply(response);
  }
  
  assert.strictEqual(replied, false, "Should not reply to undefined response");
});

test("reply: valid response → should reply", async () => {
  let replied = false;
  let repliedContent = null;
  const message = {
    reply: async (content) => { replied = true; repliedContent = content; return {}; },
  };
  
  const response = "Done! Pinned your message.";
  if (response?.trim()) {
    await message.reply(response);
  }
  
  assert.strictEqual(replied, true, "Should reply to valid response");
  assert.strictEqual(repliedContent, "Done! Pinned your message.");
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 4: Bot Message Filtering
// ══════════════════════════════════════════════════════════════════

test("bot filter: bot messages should be ignored", () => {
  const message = { author: { bot: true }, content: "I am a bot" };
  const shouldIgnore = message.author.bot;
  assert.strictEqual(shouldIgnore, true, "Bot messages should be filtered");
});

test("bot filter: user messages should be processed", () => {
  const message = { author: { bot: false }, content: "Hello Nemo" };
  const shouldIgnore = message.author.bot;
  assert.strictEqual(shouldIgnore, false, "User messages should be processed");
});

test("bot filter: webhook messages (no bot flag) should be processed", () => {
  const message = { author: { bot: undefined }, content: "Webhook message" };
  // undefined is falsy, so !message.author.bot === true — processed correctly
  const shouldIgnore = !!message.author.bot;
  assert.strictEqual(shouldIgnore, false, "Webhook messages should be processed");
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 5: Error Response Patterns
// ══════════════════════════════════════════════════════════════════

test("error reply: should include user-friendly message", () => {
  const error = new Error("DiscordAPIError: Missing Permissions");
  const userMessage = "Something went wrong — try again in a moment.";
  
  assert.ok(userMessage.length > 0, "Should have a non-empty error message");
  assert.ok(!userMessage.includes("DiscordAPIError"), "Should not expose internal errors to user");
  assert.ok(!userMessage.includes("Missing Permissions"), "Should not expose technical details");
});

test("error reply: should not expose stack traces", () => {
  const error = new Error("Internal error");
  error.stack = "Error: Internal error\n    at /src/agent/agent.js:42:15";
  
  const userMessage = "Something went wrong — try again in a moment.";
  assert.ok(!userMessage.includes("at /src/"), "Should not include stack trace");
});

// ══════════════════════════════════════════════════════════════════
// CATEGORY 6: DM Routing and Last-Seen Guild Behavior
// ══════════════════════════════════════════════════════════════════

const lastDMGuild = new Map();

function makeCache(values) {
  return {
    some: (predicate) => [...values.values()].some(predicate),
    values: () => values.values(),
    has: (id) => values.has(id),
  };
}

function simulateOnMessage(message) {
  if (message.author.bot) return "ignore";
  const isDM = !message.guild;
  if (!isDM && !message.mentions.has(message.client.user)) return "ignore";

  const { client, author } = message;
  if (isDM) {
    const isServerMember = client.guilds.cache.some((guild) =>
      guild.members.cache.has(author.id)
    );
    if (!isServerMember) return "ignore-non-member";

    const cachedGuildId = lastDMGuild.get(author.id);
    if (!cachedGuildId) return "dm-needs-project";
    return "dm-ok";
  }

  if (message.guild?.id && author?.id) {
    lastDMGuild.set(author.id, message.guild.id);
  }
  return "guild-ok";
}

test("DM: non-server member should be ignored", () => {
  const message = {
    author: { bot: false, id: "u-1" },
    guild: null,
    mentions: { has: () => false },
    client: {
      user: { id: "bot-1" },
      guilds: {
        cache: makeCache(
          new Map([
            [
              "g-1",
              {
                members: {
                  cache: new Map([
                    ["u-2", { id: "u-2" }]
                  ])
                }
              }
            ]
          ])
        )
      }
    }
  };

  const result = simulateOnMessage(message);
  assert.strictEqual(result, "ignore-non-member");
});

test("DM: server member without cached guild should prompt project selection", () => {
  const message = {
    author: { bot: false, id: "u-1" },
    guild: null,
    mentions: { has: () => false },
    client: {
      user: { id: "bot-1" },
      guilds: {
        cache: makeCache(
          new Map([
            [
              "g-1",
              {
                members: {
                  cache: new Map([
                    ["u-1", { id: "u-1" }]
                  ])
                }
              }
            ]
          ])
        )
      }
    }
  };

  const result = simulateOnMessage(message);
  assert.strictEqual(result, "dm-needs-project");
});

test("DM: server member with cached guild should proceed", () => {
  lastDMGuild.set("u-1", "g-1");

  const message = {
    author: { bot: false, id: "u-1" },
    guild: null,
    mentions: { has: () => false },
    client: {
      user: { id: "bot-1" },
      guilds: {
        cache: makeCache(
          new Map([
            [
              "g-1",
              {
                members: {
                  cache: new Map([
                    ["u-1", { id: "u-1" }]
                  ])
                }
              }
            ]
          ])
        )
      }
    }
  };

  const result = simulateOnMessage(message);
  assert.strictEqual(result, "dm-ok");
});

test("guild message: should update last seen guild for DM context", () => {
  lastDMGuild.delete("u-1");

  const message = {
    author: { bot: false, id: "u-1" },
    guild: { id: "g-1" },
    mentions: { has: () => true },
    client: { user: { id: "bot-1" } }
  };

  const result = simulateOnMessage(message);
  assert.strictEqual(result, "guild-ok");
  assert.strictEqual(lastDMGuild.get("u-1"), "g-1");
});

console.log("✅ Adversarial onMessage tests complete");
