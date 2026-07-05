import { PermissionsBitField as DiscordPerms } from "discord.js";
import { TOOL_PERMISSIONS, PERMS } from "../../../config/constants.js";

// Use discord.js's canonical permission flags — no manual BigInt map.
// This prevents bit-drift when discord.js updates upstream.
const PERMISSION_MAP = {
  [PERMS.VIEW_CHANNEL]: DiscordPerms.Flags.ViewChannel,
  [PERMS.SEND_MESSAGES]: DiscordPerms.Flags.SendMessages,
  [PERMS.SEND_MESSAGES_IN_THREADS]: DiscordPerms.Flags.SendMessagesInThreads,
  [PERMS.ADD_REACTIONS]: DiscordPerms.Flags.AddReactions,
  [PERMS.PIN_MESSAGES]: DiscordPerms.Flags.PinMessages,
  [PERMS.MANAGE_MESSAGES]: DiscordPerms.Flags.ManageMessages,
  [PERMS.MANAGE_CHANNELS]: DiscordPerms.Flags.ManageChannels,
  [PERMS.CREATE_PUBLIC_THREADS]: DiscordPerms.Flags.CreatePublicThreads,
  [PERMS.CREATE_PRIVATE_THREADS]: DiscordPerms.Flags.CreatePrivateThreads,
  [PERMS.READ_MESSAGE_HISTORY]: DiscordPerms.Flags.ReadMessageHistory,
};

export async function hasPermission({ client, channelId, permissionName }) {
  if (!client || !channelId) return false;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;

  const bit = PERMISSION_MAP[permissionName];
  if (bit === undefined) throw new Error(`Unknown permission: ${permissionName}`);

  const me = client.user;
  if (!me) return false;

  const member = channel.guild?.members?.resolve(me.id);
  if (!member) return false;

  return member.permissions.has(bit);
}

export function getRequiredPermission(toolName) {
  return TOOL_PERMISSIONS[toolName] ?? PERMS.VIEW_CHANNEL;
}

export { PERMISSION_MAP as PermissionsBitField };
