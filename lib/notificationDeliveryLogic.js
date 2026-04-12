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
