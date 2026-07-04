// Public entry point for the tool tree.
// Agent imports ONLY from this file. Adding new domains = adding a new domain
// file and a one-line aggregation here.
import { actionTools, allActionDefinitions } from "./action/index.js";
import { contextTools, allContextDefinitions } from "./context/index.js";

/**
 * Build all tools bound to a live Discord client.
 * Returns the array LangChain expects for llm.bindTools().
 */
export function buildAllTools({ client }) {
  return [...actionTools({ client }), ...contextTools({ client })];
}

// Convenience: list of definition objects (used by tests that walk the tree).
export const allDefinitions = [
  ...allActionDefinitions,
  ...allContextDefinitions,
];

// Re-exports so a single import covers the common helpers too.
export { makeTool } from "./shared/factory.js";
export { ok, fail } from "./shared/response.js";
export { hasPermission, getRequiredPermission } from "./shared/permissions.js";

// ── Named re-exports for back-compat ───────────────────────────────
// Pre-refactor tests/agents imported individual factories. Preserve that
// surface so consumers don't need to update import paths.
import {
  messageActions,
} from "./action/messages.js";
import { threadActions } from "./action/threads.js";
import { reactionActions } from "./action/reactions.js";
import { memberContext } from "./context/members.js";
import { channelContext } from "./context/channels.js";
import { messageContext } from "./context/messages.js";
import { threadContext } from "./context/threads.js";
import { serverContext } from "./context/servers.js";
import { makeTool as _makeTool } from "./shared/factory.js";

const bindAll = () => {
  const tools = {};
  for (const def of [
    ...messageActions,
    ...threadActions,
    ...reactionActions,
    ...memberContext,
    ...channelContext,
    ...messageContext,
    ...threadContext,
    ...serverContext,
  ]) {
    tools[def.name] = ({ client }) =>
      _makeTool(def)({ client });
  }
  return tools;
};

const bound = bindAll();

export const sendMessage = bound.send_message;
export const pinMessage = bound.pin_message;
export const unpinMessage = bound.unpin_message;
export const createThread = bound.create_thread;
export const sendThreadMessage = bound.send_thread_message;
export const addReaction = bound.add_reaction;
export const deleteMessage = bound.delete_message;
export const editMessage = bound.edit_message;
export const getMembers = bound.get_members;
export const getMember = bound.get_member;
export const getChannels = bound.get_channels;
export const getChannelInfo = bound.get_channel_info;
export const getPinnedMessages = bound.get_pinned_messages;
export const getRecentMessages = bound.get_recent_messages;
export const getMessage = bound.get_message;
export const getActiveThreads = bound.get_active_threads;
export const listThreads = bound.list_threads;
export const getThreadHistory = bound.get_thread_history;
export const getServerState = bound.get_server_state;
