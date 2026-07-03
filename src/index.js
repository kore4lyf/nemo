import "dotenv/config";
import "./config/env.js";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { logger } from "./config/logger.js";
import { onMessage } from "./bot/onMessage.js";

async function main() {
  logger.info("Nemo starting...");

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    rest: { timeout: 30_000 },
  });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`Logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.ShardDisconnect, (event, shardId) => {
    logger.warn(`Shard ${shardId} disconnected (code: ${event.code}). Auto-reconnecting...`);
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    logger.info(`Shard ${shardId} reconnecting...`);
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    logger.info(`Shard ${shardId} resumed (${replayedEvents} events replayed)`);
  });

  client.on(Events.Error, (error) => {
    logger.error("Client error (non-fatal):", error.message);
  });

  client.on(Events.MessageCreate, onMessage);

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    logger.error("DISCORD_TOKEN not set");
    process.exit(1);
  }

  await client.login(token);
}

main().catch((err) => {
  logger.error("Fatal:", err.message || err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  logger.error("Unhandled rejection (non-fatal):", err?.message || err);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception (non-fatal):", err.message);
});
