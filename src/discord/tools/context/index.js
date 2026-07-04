import { memberContext } from "./members.js";
import { milestoneContext } from "./milestones.js";
import { introductionContext } from "./introductions.js";
import { channelContext } from "./channels.js";
import { messageContext } from "./messages.js";
import { threadContext } from "./threads.js";
import { serverContext } from "./servers.js";
import { eventContext } from "./events.js";
import { makeTool } from "../shared/factory.js";

export const allContextDefinitions = [
  ...memberContext,
  ...milestoneContext,
  ...introductionContext,
  ...channelContext,
  ...messageContext,
  ...threadContext,
  ...serverContext,
  ...eventContext,
];

export function contextTools({ client }) {
  return allContextDefinitions.map((def) => makeTool(def)({ client }));
}
