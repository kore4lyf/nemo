import { z } from "zod";
import { ChannelType } from "discord.js";
import { guildIdField } from "../shared/schemas.js";
import { hasPermission, getRequiredPermission } from "../shared/permissions.js";
import { ok, fail } from "../shared/response.js";
import { PROJECT_CHANNELS } from "../../../config/constants.js";

const PROJECT_CHANNEL_NAMES = Object.values(PROJECT_CHANNELS);

export const channelActions = [
  {
    name: "create_project_channels",
    description:
      "Create any missing essential project channels (project, milestones, introduction). Only runs when the user explicitly asks. Validates requested channel names against the hardcoded allowed list.",
    schema: z.object({
      guildId: guildIdField,
      channels: z.array(z.string().min(1)).optional(),
    }),
    async create(client, input) {
      const perm = getRequiredPermission("create_project_channels");
      try {
        const guild = await client.guilds.fetch(input.guildId);
        const probeChannels = [...guild.channels.cache.values()]
          .filter((c) => c.isTextBased?.())
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        const first = probeChannels[0];

        // Check ViewChannel first (always needed), then ManageChannels
        const viewPerm = "ViewChannel";
        if (first) {
          const okView = await hasPermission({
            client,
            channelId: first.id,
            permissionName: viewPerm,
          });
          if (!okView) return fail(`Missing permission: ${viewPerm}`);
        }

        const okManage = await hasPermission({
          client,
          channelId: first?.id ?? guild.channels.cache.first()?.id,
          permissionName: perm,
        });
        if (!okManage) return fail(`Missing permission: ${perm}`);

        // Determine which channels the user wants to create
        const requested = input.channels ?? PROJECT_CHANNEL_NAMES;

        // Validate all requested channels are in the allowed list
        for (const name of requested) {
          if (!PROJECT_CHANNEL_NAMES.some((allowed) => allowed.toLowerCase() === name.toLowerCase())) {
            return fail(`Invalid channel name: ${name}`);
          }
        }

        // Audit what's missing (case-insensitive)
        const allChannels = [...guild.channels.cache.values()];
        const created = [];
        const skipped = [];

        for (const reqName of requested) {
          const exists = allChannels.find(
            (c) => c.name.toLowerCase() === reqName.toLowerCase()
          );
          if (exists) {
            skipped.push({ name: reqName, reason: "already exists" });
            continue;
          }
          const newChannel = await guild.channels.create({
            name: reqName,
            type: ChannelType.GuildText,
            reason: "Nemo project setup",
          });
          created.push({ name: reqName, id: newChannel.id });
        }

        return ok({ created, skipped });
      } catch (err) {
        return fail(err);
      }
    },
  },
];
