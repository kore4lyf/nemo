

export function extractContext({ client, message }) {
  if (!client || !message) {
    return {
      currentChannel: null,
      currentMessage: null,
      mentionedUsers: [],
    };
  }

  return {
    currentChannel: {
      id: message.channel?.id ?? null,
      name: message.channel?.name ?? null,
      guildId: message.guild?.id ?? null,
    },
    currentMessage: {
      id: message.id ?? null,
      author: message.author?.username ?? null,
      authorId: message.author?.id ?? null,
      content: message.content ?? "",
    },
    mentionedUsers: message.mentions?.users?.map((u) => ({
      id: u.id,
      name: u.username,
    })) ?? [],
  };
}
