import { getLogger } from "../config/log4js.js";

const logger = getLogger("conversation");

const state = {
  lastChannelId: null,
  lastGuildId: null,
  lastWasDm: null,
};

export function logDiscordMessage({ message }) {
  if (!message) return;

  const channel = message.channel || {};
  const guild = message.guild || {};
  const isDm = channel.type === "DM" || channel.type === 1 || !guild.id;
  const channelId = channel.id || null;
  const guildId = guild.id || null;

  const changed =
    channelId !== state.lastChannelId ||
    guildId !== state.lastGuildId ||
    state.lastWasDm !== isDm;

  if (changed) {
    state.lastChannelId = channelId;
    state.lastGuildId = guildId;
    state.lastWasDm = isDm;

    if (isDm) {
      const username = message.author?.username || "unknown";
      logger.info(`[DM] ${username}: ${message.content}`);
      return;
    }

    const channelName = channel.name || "unknown";
    const guildName = guild.name || "unknown";
    if (!channelId) {
      logger.info(`[${guildName}] unknown channel: ${message.content}`);
    } else {
      logger.info(`[${guildName}] #${channelName}: ${message.content}`);
    }
    return;
  }

  logger.info(message.content);
}
