import "dotenv/config";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { env } from "./config/env.js";

async function main() {
  console.log("🤖 Nemo starting...");

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`✅ Logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith("!")) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();

    if (command === "ping") {
      await message.reply("🏓 Pong!");
    }
  });

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("❌ DISCORD_TOKEN not set");
    process.exit(1);
  }

  await client.login(token);
}

main().catch(console.error);
