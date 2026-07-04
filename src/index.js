import "dotenv/config";
import "./config/env.js";
import { Client, GatewayIntentBits, Events, REST, Routes } from "discord.js";
import { logger } from "./config/logger.js";
import { onMessage } from "./bot/onMessage.js";
import { handleInteraction } from "./bot/interactions.js";
import { commands } from "./discord/commands/index.js";

async function registerCommands(client) {
  try {
    const applicationId = client.user?.id;
    if (!applicationId) {
      logger.warn("Skipping slash command registration; no application id yet.");
      return;
    }

    const body = commands.map((command) => command.toJSON());

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    logger.info(`Registering ${body.length} slash commands...`);
    await rest.put(Routes.applicationCommands(applicationId), {
      body,
    });
    logger.info("Slash commands registered.");
  } catch (err) {
    logger.error("Slash command registration failed:", err.message || err);
  }
}

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

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`Logged in as ${readyClient.user.tag}`);
    await registerCommands(readyClient);
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
  client.on(Events.InteractionCreate, handleInteraction);

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
