export function shouldStoreNotification(preferencesRow, kind) {
  const kindPreferenceMap = {
    post_comment: preferencesRow?.post_comment_enabled ?? true,
    coin_gift_received: preferencesRow?.coin_gift_received_enabled ?? true,
    moderation_warning: preferencesRow?.moderation_warning_enabled ?? true,
    followed_game_post: preferencesRow?.followed_game_post_enabled ?? true,
    new_follower: preferencesRow?.new_follower_enabled ?? true,
  };

  return kindPreferenceMap[kind] !== false;
}

export function shouldSendPushNotification(preferencesRow, kind) {
  return (preferencesRow?.push_enabled ?? true) && shouldStoreNotification(preferencesRow, kind);
}

export function getNotificationPushCooldownMinutes(preferencesRow, kind) {
  const noiseControlEnabled = preferencesRow?.activity_noise_control_enabled ?? true;
  const cooldownMinutes = Math.max(
    0,
    Math.min(240, Number(preferencesRow?.activity_push_cooldown_minutes ?? 30) || 0),
  );

  if (!noiseControlEnabled) {
    return 0;
  }

  return kind === "followed_game_post" || kind === "new_follower" ? cooldownMinutes : 0;
}

export function buildAggregatedNotificationUpdate(existingRow, notification) {
  if (!existingRow || !notification) {
    return null;
  }

  const existingMetadata = existingRow.metadata_json ?? {};

  if (notification.kind === "followed_game_post") {
    const aggregatedCount = Math.max(1, Number(existingMetadata.aggregatedCount ?? 1)) + 1;
    const gameTitle = notification.metadata?.gameTitle ?? existingMetadata.gameTitle ?? "A followed game";
    const actorName = notification.metadata?.actorName ?? "A player";

    return {
      title: `${gameTitle} has ${aggregatedCount} new posts`,
      body:
        aggregatedCount > 2
          ? `${actorName} and ${aggregatedCount - 1} others posted in a game you follow.`
          : `${actorName} posted in a game you follow.`,
      entityType: "game",
      entityId: String(notification.metadata?.gameId ?? existingMetadata.gameId ?? notification.entityId ?? ""),
      metadata: {
        ...existingMetadata,
        ...notification.metadata,
        aggregatedCount,
        latestPostId: notification.entityId ?? existingMetadata.latestPostId ?? null,
      },
    };
  }

  if (notification.kind === "new_follower") {
    const priorNames = Array.isArray(existingMetadata.recentFollowerNames)
      ? existingMetadata.recentFollowerNames.filter(Boolean)
      : [];
    const nextName = notification.metadata?.followerName ?? "A player";
    const recentFollowerNames = [...new Set([nextName, ...priorNames])].slice(0, 3);
    const aggregatedCount = Math.max(1, Number(existingMetadata.aggregatedCount ?? 1)) + 1;
    const trailingCount = Math.max(0, aggregatedCount - recentFollowerNames.length);
    const namePreview = recentFollowerNames.join(", ");
    const body =
      trailingCount > 0
        ? `${namePreview} and ${trailingCount} others followed your profile.`
        : `${namePreview} followed your profile.`;

    return {
      title: aggregatedCount > 1 ? "You have new followers" : notification.title,
      body,
      entityType: "profile",
      entityId: notification.entityId ?? existingRow.entity_id ?? null,
      metadata: {
        ...existingMetadata,
        ...notification.metadata,
        aggregatedCount,
        recentFollowerNames,
      },
    };
  }

  return null;
}
