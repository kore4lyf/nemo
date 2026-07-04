import retry from "async-retry";
import { processWithAgent } from "../agent/agent.js";
import { logger } from "../config/logger.js";

// Error classification — only retry transient failures
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

const ALLOWED_SWITCH_PREFIXES =
  /switch\s+to|use\s+(?:the\s+|my\s+)?(?:project|server)\b(?!\s+(?:channel|thread|threads|plan|board|category|messages|pins?|project))/i;

function looksLikeSwitchRequest(text) {
  return ALLOWED_SWITCH_PREFIXES.test(text || "");
}

function extractSwitchTarget(text) {
  const match = text.match(
    /(?:switch\s+to|use\s+(?:the\s+|my\s+)?(?:project|server)|project\s*[:=]|server\s*[:=])\s*(.+)/i
  );
  const raw = match?.[1]?.trim() || "";
  const target = raw.split(/[—\-?!.,]+|\s+(?:and|then|what'?s|is|are|do|does|tell)\b/)[0].trim();
  return target.replace(/^(?:the|my|a|an)\s+/i, "").trim() || null;
}

function resolveDMGuild(client, author, query) {
  const normalized = query.toLowerCase();
  const matches = [];
  for (const guild of client.guilds.cache.values()) {
    if (!guild.members.cache.has(author.id)) continue;
    const name = (guild.name || "").toLowerCase();
    if (!name) continue;
    if (name === normalized || name.includes(normalized)) {
      matches.push(guild);
    }
  }
  return matches;
}

class TimedMap {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.map = new Map();
    this.timers = new Map();
  }

  set(key, value) {
    this.map.set(key, value);
    if (this.timers.has(key)) clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.map.delete(key);
        this.timers.delete(key);
      }, this.ttlMs)
    );
  }

  get(key) {
    return this.map.get(key);
  }

  has(key) {
    return this.map.has(key);
  }
}

async function callAgent({ client, message, dmResolvedGuild }) {
  return retry(
    async (bail) => {
      try {
        return await processWithAgent({ client, message, dmResolvedGuild });
      } catch (err) {
        if (!isRetryable(err)) bail(err);
        throw err;
      }
    },
    {
      retries: 3,
      minTimeout: 2000,
      maxTimeout: 30_000,
      onRetry: (err, attempt) =>
        logger.warn(`Retry ${attempt}/3 — ${err.code || err.status || err.message}`),
    }
  );
}

const DM_GUILD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const lastDMGuild = new TimedMap(DM_GUILD_TTL_MS);

export { lastDMGuild, resolveDMGuild };

export async function onMessage(message) {
  if (message.author.bot) return;
  const isDM = !message.guild;
  if (!isDM && !message.mentions.has(message.client.user)) return;

  const { client, author, content = "" } = message;
  let dmResolvedGuild = null;

  if (isDM) {
    const memberGuilds = client.guilds.cache.filter((guild) =>
      guild.members.cache.has(author.id)
    );
    if (!memberGuilds.size) {
      logger.debug("Ignored DM from non-server member:", author.id);
      return;
    }

    const cachedGuildId = lastDMGuild.get(author.id);
    const requestedSwitch = looksLikeSwitchRequest(content)
      ? extractSwitchTarget(content)
      : null;

    if (!cachedGuildId && requestedSwitch) {
      const matches = resolveDMGuild(client, author, requestedSwitch);
      if (matches.length === 1) {
        lastDMGuild.set(author.id, matches[0].id);
        dmResolvedGuild = matches[0];
        await message.reply(
          `Switched DM context to server "${matches[0].name}". Go ahead.`
        ).catch(() => {});
      } else if (matches.length > 1) {
        const names = matches.map((g) => `"${g.name}"`).join(", ");
        await message.reply(
          `That matches multiple servers: ${names}. Please name the exact server.`
        ).catch(() => {});
        return;
      } else {
        await message.reply(
          `I couldn't find a server matching "${requestedSwitch}" that you're in. Mention me there first, then continue here.`
        ).catch(() => {});
        return;
      }
    } else if (cachedGuildId && requestedSwitch) {
      const matches = resolveDMGuild(client, author, requestedSwitch);
      const exactMatch = matches.find((g) => g.id === cachedGuildId);
      const ambiguous = matches.filter((g) => g.id !== cachedGuildId);

      if (matches.length === 1) {
        lastDMGuild.set(author.id, matches[0].id);
        dmResolvedGuild = matches[0];
        await message.reply(
          `Switched DM context to server "${matches[0].name}".`
        ).catch(() => {});
      } else if (ambiguous.length > 0 && exactMatch) {
        const names = ambiguous.map((g) => `"${g.name}"`).join(", ");
        await message.reply(
          `I'm already in "${exactMatch.name}". That also matches potential servers: ${names}. Use the full server name to switch.`
        ).catch(() => {});
        lastDMGuild.set(author.id, exactMatch.id);
        dmResolvedGuild = exactMatch;
      } else if (matches.length === 0) {
        await message.reply(
          `I couldn't find that server in your shared servers.`
        ).catch(() => {});
        return;
      } else {
        const names = matches.map((g) => `"${g.name}"`).join(", ");
        await message.reply(
          `Multiple servers match that name: ${names}. Please be specific.`
        ).catch(() => {});
        return;
      }
    } else if (!cachedGuildId && !requestedSwitch) {
      const names = memberGuilds.map((g) => `"${g.name}"`).join(", ");
      await message.reply(
        `DM received, but I don't know which project/server yet. Mention me in that server first, or reply with its server name so I can pick the right project. Your servers: ${names}`
      ).catch(() => {});
      return;
    } else if (cachedGuildId) {
      dmResolvedGuild = memberGuilds.find((g) => g.id === cachedGuildId) || null;
    }
  } else if (message.guild?.id && author?.id) {
    lastDMGuild.set(author.id, message.guild.id);
  }

  try {
    const response = await callAgent({ client, message, dmResolvedGuild });
    if (response?.trim()) {
      try {
        await message.reply(response);
      } catch (replyErr) {
        logger.warn("Failed to send reply:", replyErr.message);
      }
    }
  } catch (error) {
    logger.error("Agent failed:", error.message || error);
    await message.reply("Something went wrong — try again in a moment.").catch(() => {});
  }
}
