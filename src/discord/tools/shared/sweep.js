import { hasPermission, getRequiredPermission } from "../shared/permissions.js";

/**
 * Sweep a channel's message history to exhaustion, 100 messages per page,
 * paging backward via the `before` cursor. No cap. Includes bot-authored
 * messages. Never throws — wraps fetch errors and returns whatever was
 * collected before the error.
 *
 * @param {object} client - bound Discord client
 * @param {string} channelName - hardcoded channel name (e.g. "milestones")
 * @param {string} guildId - guild to resolve the channel in
 * @returns {Promise<{ ok: boolean, error?: string, messages?: array }>}
 */
export async function sweepChannelByName({ client, channelName, guildId }) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = guild.channels?.cache?.values
      ? [...guild.channels.cache.values()].find(
          (c) => c.name?.toLowerCase() === channelName.toLowerCase()
        )
      : null;

    if (!channel) {
      const pretty =
        channelName.charAt(0).toUpperCase() + channelName.slice(1);
      return {
        ok: false,
        error: `${pretty} channel not found. Use check_project_channels / create_project_channels first.`,
      };
    }

    const permName = getRequiredPermission("get_milestones");
    const allowed = await hasPermission({
      client,
      channelId: channel.id,
      permissionName: permName,
    });

    if (!allowed) {
      return { ok: false, error: `Missing permission: ${permName}` };
    }

    const collected = [];
    let before = null;

    while (true) {
      let page;
      try {
        page = await channel.messages.fetch({
          limit: 100,
          before,
        });
      } catch (err) {
        return { ok: true, messages: collected };
      }

      if (!page || page.size === 0) {
        break;
      }

      for (const msg of page.values()) {
        collected.push({
          id: msg.id,
          author: msg.author?.username ?? null,
          authorId: msg.author?.id ?? null,
          content: msg.content ?? "",
          createdAt: msg.createdTimestamp ?? null,
        });
      }

      before = page.last()?.id ?? null;
      if (!before) {
        break;
      }
    }

    return { ok: true, messages: collected };
  } catch (err) {
    return { ok: true, messages: [] };
  }
}
