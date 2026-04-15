import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import PostCard from "../../components/PostCard";
import SectionCard from "../../components/SectionCard";
import { useAuth } from "../../lib/auth";
import { goBackOrFallback } from "../../lib/navigation";
import { getProfileNameColor } from "../../lib/profileAppearance";
import { getProfileTitleOption } from "../../lib/titles";
import { theme } from "../../lib/theme";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriend,
  requestFriend,
  usePublicProfile,
  useUserActivity,
  useUserFollows,
} from "../../lib/userSocial";

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const userId = typeof id === "string" ? id : null;
  const { profile, isLoading, error, reload } = usePublicProfile(userId);
  const {
    posts,
    isLoading: activityLoading,
    isLoadingMore: activityLoadingMore,
    hasMore: activityHasMore,
    reload: reloadActivity,
    loadMore: loadMoreActivity,
  } = useUserActivity(userId);
  const { friendCount, friends, getFriendshipStatus, reload: reloadFollows } = useUserFollows(userId);
  const [isSavingFollow, setIsSavingFollow] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(null);

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!profile) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <SectionCard title="Profile not found" eyebrow="Creator">
          <Text style={styles.bodyText}>
            {error ? "This profile could not be loaded right now." : "That user profile does not exist."}
          </Text>
        </SectionCard>
      </ScrollView>
    );
  }

  const canFollow = session?.user?.id && session.user.id !== profile.id;
  const title = getProfileTitleOption(profile.selectedTitleKey);
  const nameColor = getProfileNameColor(profile.selectedNameColor);
  const friendshipStatus = getFriendshipStatus(profile.id);
  const displayStatus = optimisticStatus ?? friendshipStatus;

  const handleFollowToggle = async () => {
    if (!canFollow) {
      return;
    }

    const previousStatus = friendshipStatus;
    try {
      setIsSavingFollow(true);
      if (displayStatus === "incoming") {
        setOptimisticStatus("friends");
        await acceptFriendRequest({ targetUserId: profile.id });
      } else if (displayStatus === "none") {
        setOptimisticStatus("outgoing");
        await requestFriend({ targetUserId: profile.id });
      } else {
        return;
      }

      await reloadFollows();
      await reload();
      await reloadActivity();
    } catch {
      setOptimisticStatus(previousStatus === friendshipStatus ? null : previousStatus);
    } finally {
      setIsSavingFollow(false);
      setOptimisticStatus(null);
    }
  };

  const handleSecondaryFriendAction = async () => {
    if (!canFollow) {
      return;
    }

    const previousStatus = friendshipStatus;
    try {
      setIsSavingFollow(true);

      if (displayStatus === "outgoing") {
        setOptimisticStatus("none");
        await cancelFriendRequest({ targetUserId: profile.id });
      } else if (displayStatus === "incoming") {
        setOptimisticStatus("none");
        await declineFriendRequest({ targetUserId: profile.id });
      } else if (displayStatus === "friends") {
        setOptimisticStatus("none");
        await removeFriend({ targetUserId: profile.id });
      } else {
        return;
      }

      await reloadFollows();
      await reload();
      await reloadActivity();
    } catch {
      setOptimisticStatus(previousStatus === friendshipStatus ? null : previousStatus);
    } finally {
      setIsSavingFollow(false);
      setOptimisticStatus(null);
    }
  };

  const primaryFriendActionLabel =
    displayStatus === "incoming"
      ? "Accept request"
      : displayStatus === "friends"
        ? "Friends"
        : displayStatus === "outgoing"
          ? "Request sent"
          : "Add friend";

  const secondaryFriendActionLabel =
    displayStatus === "outgoing"
      ? "Cancel request"
      : displayStatus === "incoming"
        ? "Decline"
        : displayStatus === "friends"
          ? "Remove friend"
          : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroActions}>
          <Pressable onPress={() => goBackOrFallback(router, "/(tabs)/browse")} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/browse")} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Browse</Text>
          </Pressable>
        </View>
        <View style={styles.avatarWrap}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{profile.displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.nameText, { color: nameColor }]}>{profile.displayName}</Text>
        <Text style={styles.usernameText}>@{profile.username}</Text>
        {title.key !== "none" ? <Text style={styles.titleBadge}>{title.label}</Text> : null}
        {profile.bio ? <Text style={styles.bioText}>{profile.bio}</Text> : null}
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{friendCount}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{posts.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
        </View>
        {canFollow ? (
          <View style={styles.friendActionRow}>
            <Pressable
              onPress={handleFollowToggle}
              style={[
                styles.followButton,
                displayStatus === "friends" || displayStatus === "outgoing"
                  ? styles.followButtonMuted
                  : null,
              ]}
            >
              <Text
                style={[
                  styles.followButtonText,
                  displayStatus === "friends" || displayStatus === "outgoing"
                    ? styles.followButtonTextMuted
                    : null,
                ]}
              >
                {isSavingFollow ? "Saving..." : primaryFriendActionLabel}
              </Text>
            </Pressable>
            {secondaryFriendActionLabel ? (
              <Pressable onPress={handleSecondaryFriendAction} style={styles.secondaryFriendButton}>
                <Text style={styles.secondaryFriendButtonText}>
                  {isSavingFollow ? "Saving..." : secondaryFriendActionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <SectionCard title="Friends" eyebrow={`${friendCount} connected`}>
        {friends.length > 0 ? (
          <View style={styles.friendList}>
            {friends.map((friend) => (
              <Pressable
                key={friend.id}
                onPress={() => router.push(`/user/${friend.id}`)}
                style={styles.friendRow}
              >
                {friend.avatarUrl ? (
                  <Image source={{ uri: friend.avatarUrl }} style={styles.friendAvatar} />
                ) : (
                  <View style={styles.friendAvatarFallback}>
                    <Text style={styles.friendAvatarFallbackText}>
                      {friend.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.friendCopy}>
                  <Text style={styles.friendName}>{friend.displayName}</Text>
                  <Text style={styles.friendUsername}>@{friend.username}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.bodyText}>No friends listed on this profile yet.</Text>
        )}
      </SectionCard>

      <SectionCard title="Recent activity" eyebrow="Profile feed">
        {activityLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : posts.length > 0 ? (
          <View style={styles.feedList}>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                onAuthorPress={() => router.push(`/user/${post.userId}`)}
                onOpenComments={() => router.push(`/post/${post.id}`)}
                onPress={() => router.push(`/post/${post.id}`)}
                post={post}
              />
            ))}
            {activityHasMore ? (
              <Pressable
                disabled={activityLoadingMore}
                onPress={loadMoreActivity}
                style={[styles.secondaryButton, activityLoadingMore ? { opacity: 0.5 } : null]}
              >
                {activityLoadingMore ? (
                  <ActivityIndicator color={theme.colors.accent} size="small" />
                ) : (
                  <Text style={styles.secondaryButtonText}>Load more</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={styles.bodyText}>No public posts from this player yet.</Text>
        )}
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.layout.screenPadding,
    gap: theme.spacing.lg,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  hero: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
    alignItems: "center",
  },
  heroActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  avatarWrap: {
    marginBottom: theme.spacing.sm,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  avatarFallbackText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
  },
  nameText: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
  },
  usernameText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.md,
  },
  titleBadge: {
    color: "#ffcc33",
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  bioText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
    textAlign: "center",
  },
  statRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  statBox: {
    minWidth: 92,
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  statValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    textTransform: "uppercase",
  },
  followButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  followButtonMuted: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderWidth: theme.borders.width,
  },
  followButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  followButtonTextMuted: {
    color: theme.colors.textPrimary,
  },
  friendActionRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  secondaryFriendButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  secondaryFriendButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  friendList: {
    gap: theme.spacing.sm,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  friendAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  friendAvatarFallbackText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  friendCopy: {
    flex: 1,
    gap: 2,
  },
  friendName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  friendUsername: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
  },
  feedList: {
    gap: theme.spacing.md,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  loadingState: {
    alignItems: "center",
    paddingVertical: theme.spacing.lg,
  },
});
