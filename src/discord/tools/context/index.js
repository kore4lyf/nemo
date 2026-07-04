import { memberContext } from "./members.js";
import { channelContext } from "./channels.js";
import { messageContext } from "./messages.js";
import { threadContext } from "./threads.js";
import { serverContext } from "./servers.js";
import { makeTool } from "../shared/factory.js";

export const allContextDefinitions = [
  ...memberContext,
  ...channelContext,
  ...messageContext,
  ...threadContext,
  ...serverContext,
];

export function contextTools({ client }) {
  return allContextDefinitions.map((def) => makeTool(def)({ client }));
}
