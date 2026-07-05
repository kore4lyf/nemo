import { messageActions } from "./messages.js";
import { threadActions } from "./threads.js";
import { reactionActions } from "./reactions.js";
import { channelActions } from "./channels.js";
import { makeTool } from "../shared/factory.js";

// All action definitions, in declaration order. Order is preserved
// only when the caller wants to iterate by definition index; the agent
// loop looks tools up by name, not position.
export const allActionDefinitions = [
  ...messageActions,
  ...threadActions,
  ...reactionActions,
  ...channelActions,
];

// Bound action tools for a live client. The agent imports actionTools().
export function actionTools({ client, message }) {
  return allActionDefinitions.map((def) => makeTool(def)({ client, message }));
}
