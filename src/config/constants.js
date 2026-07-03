// Single source of truth for all tool/permission/model names.

// Tool names (used in agent, tools, tests)
export const TOOLS = {
  SEND_MESSAGE: "send_message",
  PIN_MESSAGE: "pin_message",
  UNPIN_MESSAGE: "unpin_message",
  CREATE_THREAD: "create_thread",
  SEND_THREAD_MESSAGE: "send_thread_message",
  ADD_REACTION: "add_reaction",
  DELETE_MESSAGE: "delete_message",
  EDIT_MESSAGE: "edit_message",
  GET_CHANNEL_INFO: "get_channel_info",
  LIST_THREADS: "list_threads",
};

// Permission names (used in permissions.js getRequiredPermission)
export const PERMS = {
  VIEW_CHANNEL: "ViewChannel",
  SEND_MESSAGES: "SendMessages",
  SEND_MESSAGES_IN_THREADS: "SendMessagesInThreads",
  ADD_REACTIONS: "AddReactions",
  PIN_MESSAGES: "PinMessages",
  MANAGE_MESSAGES: "ManageMessages",
  CREATE_PUBLIC_THREADS: "CreatePublicThreads",
  CREATE_PRIVATE_THREADS: "CreatePrivateThreads",
};

// Tool → permission mapping
export const TOOL_PERMISSIONS = {
  [TOOLS.SEND_MESSAGE]: PERMS.SEND_MESSAGES,
  [TOOLS.SEND_THREAD_MESSAGE]: PERMS.SEND_MESSAGES_IN_THREADS,
  [TOOLS.PIN_MESSAGE]: PERMS.PIN_MESSAGES,
  [TOOLS.UNPIN_MESSAGE]: PERMS.PIN_MESSAGES,
  [TOOLS.ADD_REACTION]: PERMS.ADD_REACTIONS,
  [TOOLS.DELETE_MESSAGE]: PERMS.MANAGE_MESSAGES,
  [TOOLS.EDIT_MESSAGE]: PERMS.MANAGE_MESSAGES,
  [TOOLS.CREATE_THREAD]: PERMS.CREATE_PUBLIC_THREADS,
  [TOOLS.GET_CHANNEL_INFO]: PERMS.VIEW_CHANNEL,
  [TOOLS.LIST_THREADS]: PERMS.VIEW_CHANNEL,
};

// Default LLM config (used in agent.js and env.js)
export const LLM_DEFAULTS = {
  BASE_URL: "https://api.aimlapi.com/v1",
  MODEL: "alibaba/qwen3-vl-flash",
};
