import { SlashCommandBuilder } from "discord.js";

/**
 * Slash command definitions for Nemo.
 *
 * These are registered globally or per-guild at startup.
 * Adding a command = one entry here + optional handler branch.
 */

export const commands = [
  new SlashCommandBuilder()
    .setName("nemo")
    .setDescription("Ask Nemo something directly.")
    .addStringOption((option) =>
      option.setName("question").setDescription("Your question or request.").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("switch")
    .setDescription("Switch this DM/context to a server/project.")
    .addStringOption((option) =>
      option.setName("server").setDescription("Server name to switch to.").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("milestone")
    .setDescription("Show milestone status.")
    .addStringOption((option) =>
      option
        .setName("milestone")
        .setDescription("Milestone id or keyword, e.g. auth.")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("member")
    .setDescription("Look up a member in this server.")
    .addStringOption((option) =>
      option.setName("user").setDescription("Username or partial name.").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("event")
    .setDescription("Show upcoming events for this server.")
    .addIntegerOption((option) =>
      option.setName("limit").setDescription("Max events to show.").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("thread")
    .setDescription("Show active threads in this channel/server.")
    .addIntegerOption((option) =>
      option.setName("limit").setDescription("Max threads to show.").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("channel")
    .setDescription("Show channel overview.")
    .addStringOption((option) =>
      option.setName("channel").setDescription("Channel name or id.").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show available Nemo slash commands."),
];

export const commandNames = commands.map((cmd) => cmd.name);
