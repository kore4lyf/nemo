import {
  processWithAgent,
} from "../agent/agent.js";
import { extractContext } from "../discord/context.js";
import { buildAllTools } from "../discord/tools/index.js";
import { logger } from "../config/logger.js";
import { resolveDMGuild } from "../bot/onMessage.js";
import { lastDMGuild } from "../bot/onMessage.js";

async function deferOrReply(interaction, { content, ephemeral = true }) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, ephemeral });
    } else {
      await interaction.reply({ content, ephemeral });
    }
  } catch (replyErr) {
    logger.warn("Slash reply failed:", replyErr.message);
  }
}

async function handleSwitch(interaction) {
  const query = interaction.options.getString("server", true);
  const authorId = interaction.user.id;
  const client = interaction.client;

  const cachedGuildId = lastDMGuild.get(authorId);
  const matches = resolveDMGuild(client, interaction.user, query);

  if (!cachedGuildId && matches.length === 1) {
    lastDMGuild.set(authorId, matches[0].id);
    await interaction.reply({
      content: `Switched context to "${matches[0].name}".`,
      ephemeral: true,
    });
    return;
  }

  if (matches.length === 1) {
    lastDMGuild.set(authorId, matches[0].id);
    await interaction.reply({
      content: `Switched context to "${matches[0].name}".`,
      ephemeral: true,
    });
    return;
  }

  if (matches.length > 1) {
    const names = matches.map((g) => `"${g.name}"`).join(", ");
    await interaction.reply({
      content: `Multiple match: ${names}. Use the full server name.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `No shared server matching "${query}" found. Mention me there first.`,
    ephemeral: true,
  });
}

async function handleHelp() {
  return `Nemo slash commands:
• /nemo <question> — ask anything; Nemo uses tools to answer
• /switch <server> — switch DM context to a server
• /milestone [keyword] — read milestone status
• /member [query] — look up a member
• /event [limit] — show upcoming events
• /thread [limit] — show active threads
• /channel [query] — show channel overview
• /help — show this message`;
}

export { handleHelp };

async function handleCommand(interaction) {
  const { commandName, options, client } = interaction;
  const name = commandName.toLowerCase();

  if (name === "help") {
    await interaction.reply({ content: await handleHelp(), ephemeral: true });
    return;
  }

  if (name === "switch") {
    await handleSwitch(interaction);
    return;
  }

  // Route other commands through the agent with a tool-call prompt.
  const args = [];
  options.data.forEach((opt) => {
    args.push(`${opt.name}=${opt.value}`);
  });

  const syntheticMessage = {
    id: interaction.id,
    content: `/nemo ${name} ${args.join(" ")}`.trim(),
    author: interaction.user,
    channel: interaction.channel,
    guild: interaction.guild,
    mentions: { users: new Map() },
    client,
  };

  const context = extractContext({
    client,
    message: syntheticMessage,
    fallbackGuildId: interaction.guildId,
  });

  try {
    const response = await processWithAgent({
      client,
      message: syntheticMessage,
      dmResolvedGuild: null,
    });

    const trimmed = response?.trim();
    if (!trimmed) {
      await interaction.reply({ content: "Done.", ephemeral: true });
      return;
    }

    await interaction.reply({
      content: trimmed.length > 1900 ? `${trimmed.slice(0, 1900)}…` : trimmed,
      ephemeral: true,
    });
  } catch (err) {
    logger.error("Slash command agent error:", err);
    await interaction.reply({
      content: `Slash command failed: ${err.message}`,
      ephemeral: true,
    });
  }
}

export async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleCommand(interaction);
  } catch (err) {
    logger.error("Slash handler error:", err);
    const errorMsg = "Something went wrong — try again in a moment.";
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: errorMsg, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMsg, ephemeral: true });
      }
    } catch {
      // ignore secondary reply failures
    }
  }
}
