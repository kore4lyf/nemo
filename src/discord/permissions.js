import { TOOL_PERMISSIONS, PERMS } from "../config/constants.js";

const PermissionsBitField = {
  [PERMS.VIEW_CHANNEL]: 0x400n,
  [PERMS.SEND_MESSAGES]: 0x800n,
  [PERMS.SEND_MESSAGES_IN_THREADS]: 0x4000000n,
  [PERMS.ADD_REACTIONS]: 0x40n,
  [PERMS.PIN_MESSAGES]: 0x20n,
  [PERMS.MANAGE_MESSAGES]: 0x2000n,
  [PERMS.CREATE_PUBLIC_THREADS]: 0x8n,
  [PERMS.CREATE_PRIVATE_THREADS]: 0x10n,
  ReadMessageHistory: 0x10000n,
  EmbedLinks: 0x4000n,
  AttachFiles: 0x8000n,
  UseExternalEmojis: 0x40000n,
  ManageThreads: 0x400000000n,
  MentionEveryone: 0x20000n,
  CreatePolls: 0x20000000n,
  UseExternalStickers: 0x200000n,
};

export async function hasPermission({ client, channelId, permissionName }) {
  if (!client || !channelId) return false;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;

  const bit = PermissionsBitField[permissionName];
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
