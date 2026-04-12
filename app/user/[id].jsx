import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import PostCard from "../../components/PostCard";
import SectionCard from "../../components/SectionCard";
import { useAuth } from "../../lib/auth";
import { getProfileNameColor } from "../../lib/profileAppearance";
import { getProfileTitleOption } from "../../lib/titles";
import { theme } from "../../lib/theme";
import {
  followUser,
  unfollowUser,
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
  const { posts, isLoading: activityLoading, reload: reloadActivity } = useUserActivity(userId);
  const {
    followerCount,
    followingCount,
    isFollowingUser,
    reload: reloadFollows,
  } = useUserFollows(userId);
  const [isSavingFollow, setIsSavingFollow] = useState(false);

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
  const currentlyFollowing = isFollowingUser(profile.id);

  const handleFollowToggle = async () => {
    if (!canFollow) {
      return;
    }

    try {
      setIsSavingFollow(true);
      if (currentlyFollowing) {
        await unfollowUser({ followerUserId: session.user.id, targetUserId: profile.id });
      } else {
        await followUser({ followerUserId: session.user.id, targetUserId: profile.id });
      }

      await reloadFollows();
      await reload();
    } finally {
      setIsSavingFollow(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
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
            <Text style={styles.statValue}>{followerCount}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{followingCount}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{posts.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
        </View>
        {canFollow ? (
          <Pressable onPress={handleFollowToggle} style={styles.followButton}>
            <Text style={styles.followButtonText}>
              {isSavingFollow ? "Saving..." : currentlyFollowing ? "Following" : "Follow"}
            </Text>
          </Pressable>
        ) : null}
      </View>

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
  followButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
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
