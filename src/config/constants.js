// Single source of truth for all tool/permission/model names.

// Tool names (used in agent, tools, tests)
export const TOOLS = {
  // Action tools
  SEND_MESSAGE: "send_message",
  PIN_MESSAGE: "pin_message",
  UNPIN_MESSAGE: "unpin_message",
  CREATE_THREAD: "create_thread",
  SEND_THREAD_MESSAGE: "send_thread_message",
  ADD_REACTION: "add_reaction",
  DELETE_MESSAGE: "delete_message",
  EDIT_MESSAGE: "edit_message",

  // Context tools (read-only)
  GET_MEMBERS: "get_members",
  GET_CHANNELS: "get_channels",
  GET_CHANNEL_INFO: "get_channel_info",
  GET_PINNED_MESSAGES: "get_pinned_messages",
  GET_RECENT_MESSAGES: "get_recent_messages",
  GET_MESSAGE: "get_message",
  GET_ACTIVE_THREADS: "get_active_threads",
  LIST_THREADS: "list_threads",
  GET_THREAD_HISTORY: "get_thread_history",
  GET_SERVER_STATE: "get_server_state",
  GET_MILESTONES: "get_milestones",
  GET_INTRODUCTION: "get_introduction",

  // New task 2 tools
  CHECK_PROJECT_CHANNELS: "check_project_channels",
  CREATE_PROJECT_CHANNELS: "create_project_channels",
  GET_EVENTS: "get_events",
};

// Permission names (used in permissions.js getRequiredPermission)
export const PERMS = {
  VIEW_CHANNEL: "ViewChannel",
  SEND_MESSAGES: "SendMessages",
  SEND_MESSAGES_IN_THREADS: "SendMessagesInThreads",
  ADD_REACTIONS: "AddReactions",
  PIN_MESSAGES: "PinMessages",
  MANAGE_MESSAGES: "ManageMessages",
  MANAGE_CHANNELS: "ManageChannels",
  CREATE_PUBLIC_THREADS: "CreatePublicThreads",
  CREATE_PRIVATE_THREADS: "CreatePrivateThreads",
  READ_MESSAGE_HISTORY: "ReadMessageHistory",
};

// Tool → permission mapping
export const TOOL_PERMISSIONS = {
  // Action tools
  [TOOLS.SEND_MESSAGE]: PERMS.SEND_MESSAGES,
  [TOOLS.SEND_THREAD_MESSAGE]: PERMS.SEND_MESSAGES_IN_THREADS,
  [TOOLS.PIN_MESSAGE]: PERMS.PIN_MESSAGES,
  [TOOLS.UNPIN_MESSAGE]: PERMS.PIN_MESSAGES,
  [TOOLS.ADD_REACTION]: PERMS.ADD_REACTIONS,
  [TOOLS.DELETE_MESSAGE]: PERMS.MANAGE_MESSAGES,
  [TOOLS.EDIT_MESSAGE]: PERMS.MANAGE_MESSAGES,
  [TOOLS.CREATE_THREAD]: PERMS.CREATE_PUBLIC_THREADS,

  // Context tools
  [TOOLS.GET_MEMBERS]: PERMS.VIEW_CHANNEL,
  [TOOLS.GET_CHANNELS]: PERMS.VIEW_CHANNEL,
  [TOOLS.GET_CHANNEL_INFO]: PERMS.VIEW_CHANNEL,
  [TOOLS.GET_PINNED_MESSAGES]: PERMS.READ_MESSAGE_HISTORY,
  [TOOLS.GET_RECENT_MESSAGES]: PERMS.READ_MESSAGE_HISTORY,
  [TOOLS.GET_MESSAGE]: PERMS.READ_MESSAGE_HISTORY,
  [TOOLS.GET_ACTIVE_THREADS]: PERMS.VIEW_CHANNEL,
  [TOOLS.LIST_THREADS]: PERMS.VIEW_CHANNEL,
  [TOOLS.GET_THREAD_HISTORY]: PERMS.READ_MESSAGE_HISTORY,
  [TOOLS.GET_SERVER_STATE]: PERMS.VIEW_CHANNEL,
  [TOOLS.GET_MILESTONES]: PERMS.READ_MESSAGE_HISTORY,
  [TOOLS.GET_INTRODUCTION]: PERMS.READ_MESSAGE_HISTORY,

  // Task 2 tools
  [TOOLS.CHECK_PROJECT_CHANNELS]: PERMS.VIEW_CHANNEL,
  [TOOLS.CREATE_PROJECT_CHANNELS]: PERMS.MANAGE_CHANNELS,
  [TOOLS.GET_EVENTS]: PERMS.VIEW_CHANNEL,
};

// Required project channels — hardcoded, matched case-insensitively
export const PROJECT_CHANNELS = {
  PROJECT: "project",
  MILESTONES: "milestones",
  INTRODUCTION: "introduction",
};

// Default LLM config (used in agent.js and env.js)
export const LLM_DEFAULTS = {
  BASE_URL: "https://api.aimlapi.com/v1",
  MODEL: "x-ai/grok-4-1-fast-reasoning",
};
