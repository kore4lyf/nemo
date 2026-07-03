const PermissionsBitField = {
  ViewChannel: 0x0000000000000400,
  SendMessages: 0x0000000000000800,
  SendMessagesInThreads: 0x0000000004000000,
  ReadMessageHistory: 0x00000000000010000,
  EmbedLinks: 0x0000000000004000,
  AttachFiles: 0x0000000000008000,
  UseExternalEmojis: 0x0000000000040000,
  CreatePublicThreads: 0x0000000000000008,
  CreatePrivateThreads: 0x0000000000000010,
  PinMessages: 0x0000000000000020,
  ManageMessages: 0x0000000000002000,
  ManageThreads: 0x000000000400000000,
  MentionEveryone: 0x0000000000020000,
  CreatePolls: 0x00000000020000000,
  UseExternalStickers: 0x0000000000200000,
  AddReactions: 0x0000000000000040,
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
