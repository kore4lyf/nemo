import { z } from "zod";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  channelIdField,
  messageIdField,
  contentField,
} from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";

/**
 * Show a confirmation message with Confirm / Cancel buttons.
 * Returns true if confirmed, false if cancelled or timed out.
 */
async function confirmAction(message, description) {
  if (!message?.reply) return true; // no triggering message = skip confirmation (tests, DMs)

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("confirm_delete")
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("cancel_delete")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );

  const confirmation = await message.reply({
    content: `⚠️ **Are you sure?** ${description}`,
    components: [row],
    ephemeral: false,
  });

  try {
    const interaction = await confirmation.awaitMessageComponent({
      filter: (i) => i.user.id === message.author.id,
      time: 30_000,
    });

    const confirmed = interaction.customId === "confirm_delete";
    await interaction.update({
      content: confirmed
        ? `✅ ${description} — confirmed.`
        : `❌ ${description} — cancelled.`,
      components: [],
    });
    return confirmed;
  } catch {
    // Timeout — no response within 30s
    await confirmation.edit({
      content: `⏰ ${description} — timed out (cancelled).`,
      components: [],
    }).catch(() => {});
    return false;
  }
}

export const messageActions = [
  {
    name: "send_message",
    description: "Send a text message to a Discord channel by channelId.",
    schema: z.object({
      channelId: channelIdField,
      content: contentField(),
      embed: z.any().optional(),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("send_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const msg = await channel.send({
          content: String(input.content),
          embeds: input.embed ? [input.embed] : undefined,
        });
        return ok({ messageId: msg.id });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "pin_message",
    description: "Pin a message in a channel by channelId and messageId.",
    schema: z.object({
      channelId: channelIdField,
      messageId: messageIdField,
    }),
    async create(client, input) {
      const perm = getRequiredPermission("pin_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const message = await channel.messages.fetch(input.messageId);
        await message.pin();
        return ok();
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "unpin_message",
    description: "Remove a pin from a message by channelId and messageId.",
    schema: z.object({
      channelId: channelIdField,
      messageId: messageIdField,
    }),
    async create(client, input) {
      const perm = getRequiredPermission("unpin_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const message = await channel.messages.fetch(input.messageId);
        await message.unpin();
        return ok();
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "delete_message",
    description: "Delete a message by channelId and messageId. Requires user confirmation.",
    schema: z.object({
      channelId: channelIdField,
      messageId: messageIdField,
    }),
    async create(client, input, { message } = {}) {
      const perm = getRequiredPermission("delete_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const msg = await channel.messages.fetch(input.messageId);
        // Authorization: only allow deleting Nemo's own messages
        if (msg.author?.id !== client.user?.id) {
          return fail("I can only delete messages I authored. Ask the author to delete it directly.");
        }

        // Confirm before destructive action
        const confirmed = await confirmAction(
          message,
          `Delete message \"${msg.content?.slice(0, 80) || "(empty)"}\" by ${msg.author?.username || "unknown"}?`
        );
        if (!confirmed) return fail("Deletion cancelled by user.");

        await msg.delete();
        return ok();
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "edit_message",
    description: "Edit a previously sent message. Requires user confirmation.",
    schema: z.object({
      channelId: channelIdField,
      messageId: messageIdField,
      newContent: contentField(),
    }),
    async create(client, input, { message } = {}) {
      const perm = getRequiredPermission("edit_message");
      if (
        !(await hasPermission({ client, channelId: input.channelId, permissionName: perm }))
      )
        return fail(`Missing permission: ${perm}`);
      try {
        const channel = await client.channels.fetch(input.channelId);
        const msg = await channel.messages.fetch(input.messageId);
        // Authorization: only allow editing Nemo's own messages
        if (msg.author?.id !== client.user?.id) {
          return fail("I can only edit messages I authored. Ask the author to edit it directly.");
        }

        // Confirm before editing someone else's message
        const confirmed = await confirmAction(
          message,
          `Edit message \"${msg.content?.slice(0, 80) || "(empty)"}\" to \"${String(input.newContent).slice(0, 80)}\"?`
        );
        if (!confirmed) return fail("Edit cancelled by user.");

        await msg.edit(String(input.newContent));
        return ok();
      } catch (err) {
        return fail(err);
      }
    },
  },
];
