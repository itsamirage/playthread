import { evaluateModerationText } from "./moderation.mjs";
import { evaluateAvatarSubmission, validateProfileIdentityInput } from "./profileModerationLogic.mjs";
import { isGeneratedPlaceholderUsername } from "./profileHelpers.mjs";
import { isValidUsername } from "./usernameValidation.mjs";
import { getContentVisibilityUpdate, normalizeRetentionArgs } from "./adminModerationLogic.mjs";

const PROFILE_TITLE_KEYS = new Set([
  "none",
  "admin",
  "achievement_hunter",
  "boss_slayer",
  "retro_legend",
  "co_op_carry",
  "controller_poet",
  "gg_wp",
  "one_more_run",
  "press_start",
  "git_gud",
  "victory_fanfare",
]);

export function buildProfileIdentityWritePlan(input, requestIpHash = null) {
  const nextIdentity = validateProfileIdentityInput(input);
  const textModeration = evaluateModerationText(
    `${nextIdentity.displayName}\n${nextIdentity.bio}`.trim(),
  );
  const avatarModeration = evaluateAvatarSubmission(nextIdentity.avatarUrl);

  return {
    profileUpdate: {
      display_name: nextIdentity.displayName,
      bio: nextIdentity.bio || null,
      avatar_url: nextIdentity.avatarUrl || null,
      profile_moderation_state: textModeration.moderationState,
      profile_moderation_labels: textModeration.labels,
      avatar_moderation_state: avatarModeration.moderationState,
      avatar_moderation_labels: avatarModeration.labels,
    },
    moderation: {
      profile: textModeration,
      avatar: avatarModeration,
    },
    flags: [
      ...(textModeration.moderationState === "warning" && textModeration.category && textModeration.reason
        ? [
            {
              contentType: "profile",
              contentId: null,
              category: textModeration.category,
              labels: textModeration.labels,
              reason: textModeration.reason,
              contentExcerpt: `${nextIdentity.displayName} ${nextIdentity.bio}`.trim(),
              evidence: {
                request_ip_hash: requestIpHash,
                field_names: ["display_name", "bio"],
              },
            },
          ]
        : []),
      ...(avatarModeration.shouldFlag && avatarModeration.reason
        ? [
            {
              contentType: "profile",
              contentId: null,
              category: "spam",
              labels: avatarModeration.labels,
              reason: avatarModeration.reason,
              contentExcerpt: nextIdentity.avatarUrl,
              evidence: {
                request_ip_hash: requestIpHash,
                field_names: ["avatar_url"],
                avatar_url: nextIdentity.avatarUrl,
              },
            },
          ]
        : []),
    ],
  };
}

export function buildProfileTitleSelectionWritePlan(titleKey) {
  const normalizedTitleKey = String(titleKey ?? "none").trim() || "none";

  if (!PROFILE_TITLE_KEYS.has(normalizedTitleKey)) {
    throw new Error("That title is not available.");
  }

  return {
    profileUpdate: {
      selected_title_key: normalizedTitleKey,
    },
    result: {
      selectedTitleKey: normalizedTitleKey,
    },
  };
}

export function buildProfileUsernameRepairWritePlan({
  currentUsername,
  preferredUsername,
  currentEmail,
}) {
  const normalizedPreferredUsername = String(preferredUsername ?? "").trim().toLowerCase();
  const normalizedCurrentUsername = String(currentUsername ?? "").trim().toLowerCase();
  const normalizedEmailPrefix = String(currentEmail ?? "").trim().toLowerCase().split("@")[0] ?? "";

  if (!normalizedPreferredUsername) {
    throw new Error("A preferred username is required.");
  }

  if (!isValidUsername(normalizedPreferredUsername)) {
    throw new Error("That username is invalid.");
  }

  if (
    !normalizedCurrentUsername ||
    normalizedCurrentUsername === normalizedPreferredUsername ||
    (
      !isGeneratedPlaceholderUsername(normalizedCurrentUsername) &&
      normalizedCurrentUsername !== normalizedEmailPrefix
    )
  ) {
    return {
      shouldUpdate: false,
      profileUpdate: null,
      result: {
        repaired: false,
        username: normalizedCurrentUsername || null,
      },
    };
  }

  return {
    shouldUpdate: true,
    profileUpdate: {
      username: normalizedPreferredUsername,
      display_name: normalizedPreferredUsername,
    },
    result: {
      repaired: true,
      username: normalizedPreferredUsername,
    },
  };
}

export function buildContentVisibilityWritePlan(flagRow, visibility) {
  if (!flagRow?.content_id) {
    throw new Error("That flagged item no longer has a target record.");
  }

  const nextVisibility = getContentVisibilityUpdate(visibility, flagRow.content_type);
  const targetTable = flagRow.content_type === "post" ? "posts" : "post_comments";

  return {
    targetTable,
    contentUpdate: {
      moderation_state: nextVisibility.visibility,
    },
    flagUpdate: {
      status: nextVisibility.nextFlagStatus,
    },
    actionInsert: {
      action_type: nextVisibility.actionType,
      reason: nextVisibility.reason,
      metadata_json: {
        flagId: flagRow.id,
        contentType: flagRow.content_type,
        contentId: flagRow.content_id,
        gameId: flagRow.igdb_game_id ?? null,
        category: flagRow.category,
        origin: flagRow.origin,
        nextVisibility: nextVisibility.visibility,
        nextFlagStatus: nextVisibility.nextFlagStatus,
      },
    },
    result: {
      visibility: nextVisibility.visibility,
      flagStatus: nextVisibility.nextFlagStatus,
    },
  };
}

export function buildRetentionPruneWritePlan(input, rpcResult, actorUserId) {
  const { integrityRetentionDays, moderationActionRetentionDays } = normalizeRetentionArgs(input);

  return {
    rpcArgs: {
      integrity_retention_days: integrityRetentionDays,
      moderation_action_retention_days: moderationActionRetentionDays,
    },
    actionInsert: {
      target_user_id: actorUserId,
      actor_user_id: actorUserId,
      action_type: "run_retention_prune",
      reason: "Pruned retained integrity and review audit data.",
      metadata_json: {
        integrity_retention_days: integrityRetentionDays,
        moderation_action_retention_days: moderationActionRetentionDays,
        result: rpcResult ?? null,
      },
    },
    result: {
      integrityRetentionDays,
      moderationActionRetentionDays,
    },
  };
}
