function toSafeString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function buildRouteFromNotification(notification) {
  const entityType = toSafeString(notification?.entityType);
  const entityId = toSafeString(notification?.entityId);
  const metadata = notification?.metadata && typeof notification.metadata === "object"
    ? notification.metadata
    : {};

  if (entityType === "post" && entityId) {
    return `/post/${entityId}`;
  }

  if (entityType === "comment") {
    const postId = toSafeString(metadata.postId);

    if (postId) {
      return `/post/${postId}`;
    }
  }

  if (entityType === "profile" && entityId) {
    return `/user/${entityId}`;
  }

  if (entityType === "game" && entityId) {
    return `/game/${entityId}`;
  }

  const latestPostId = toSafeString(metadata.latestPostId);

  if (latestPostId) {
    return `/post/${latestPostId}`;
  }

  const metadataPostId = toSafeString(metadata.postId);

  if (metadataPostId) {
    return `/post/${metadataPostId}`;
  }

  const gameId = toSafeString(metadata.gameId);

  if (gameId) {
    return `/game/${gameId}`;
  }

  const followerUserId = toSafeString(metadata.followerUserId);

  if (followerUserId) {
    return `/user/${followerUserId}`;
  }

  const requesterUserId = toSafeString(metadata.requesterUserId);

  if (requesterUserId) {
    return `/user/${requesterUserId}`;
  }

  const friendUserId = toSafeString(metadata.friendUserId);

  if (friendUserId) {
    return `/user/${friendUserId}`;
  }

  return "/notifications";
}

export function getNotificationKindLabel(kind) {
  if (kind === "post_comment") return "Reply";
  if (kind === "coin_gift_received") return "Gift";
  if (kind === "moderation_warning") return "Moderation";
  if (kind === "followed_game_post") return "Followed game";
  if (kind === "friend_request") return "Friend";
  if (kind === "friend_accept") return "Friend";
  if (kind === "new_follower") return "Friend";
  return "Activity";
}

function getDayBucketLabel(date, now = new Date()) {
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffInDays = Math.round((current.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffInDays <= 0) return "Today";
  if (diffInDays === 1) return "Yesterday";
  return target.toLocaleDateString();
}

export function groupNotificationsByDay(notifications, now = new Date()) {
  const groups = [];
  const map = new Map();

  for (const notification of notifications) {
    const groupKey = getDayBucketLabel(new Date(notification.createdAt), now);

    if (!map.has(groupKey)) {
      const group = { dayLabel: groupKey, items: [] };
      map.set(groupKey, group);
      groups.push(group);
    }

    map.get(groupKey).items.push(notification);
  }

  return groups;
}
