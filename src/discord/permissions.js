const PermissionsBitField = {
  ViewChannel: 0x400n,
  SendMessages: 0x800n,
  SendMessagesInThreads: 0x4000000n,
  ReadMessageHistory: 0x10000n,
  EmbedLinks: 0x4000n,
  AttachFiles: 0x8000n,
  UseExternalEmojis: 0x40000n,
  CreatePublicThreads: 0x8n,
  CreatePrivateThreads: 0x10n,
  PinMessages: 0x20n,
  ManageMessages: 0x2000n,
  ManageThreads: 0x400000000n,
  MentionEveryone: 0x20000n,
  CreatePolls: 0x20000000n,
  UseExternalStickers: 0x200000n,
  AddReactions: 0x40n,
};

function normalizePermission(name) {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Permission name is required.");
  }

  const key = name.trim();
  if (!(key in PermissionsBitField)) {
    throw new Error(`Unknown permission: ${key}`);
  }

  return PermissionsBitField[key];
}

export async function hasPermission({ client, channelId, permissionName }) {
  if (!client) {
    return false;
  }

  if (!channelId) {
    return false;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    return false;
  }

  const bit = normalizePermission(permissionName);
  const me = client.user;
  if (!me) {
    return false;
  }

  const member = channel.guild?.members?.resolve(me.id);
  if (!member) {
    return false;
  }

  return member.permissions.has(bit);
}

export function getRequiredPermission(toolName) {
  switch (toolName) {
    case "send_message":
      return "SendMessages";
    case "send_thread_message":
      return "SendMessagesInThreads";
    case "pin_message":
      return "PinMessages";
    case "unpin_message":
      return "PinMessages";
    case "add_reaction":
      return "AddReactions";
    case "delete_message":
      return "ManageMessages";
    case "edit_message":
      return "ManageMessages";
    case "create_thread":
      return "CreatePublicThreads";
    case "get_channel_info":
      return "ViewChannel";
    case "list_threads":
      return "ViewChannel";
    default:
      return "ViewChannel";
  }
}
