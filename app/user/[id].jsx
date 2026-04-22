import { useDeferredValue, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import BottomNavBar from "../../components/BottomNavBar";
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
  usePublicReviewCount,
  useUserActivity,
  useUserCommentHistory,
  useUserFollows,
  useUserReviews,
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
  } = useUserActivity(userId, { limit: 10 });
  const {
    comments,
    isLoading: commentsLoading,
    isLoadingMore: commentsLoadingMore,
    hasMore: commentsHasMore,
    loadMore: loadMoreComments,
  } = useUserCommentHistory(userId, { limit: 10 });
  const { friendCount, friends, getFriendshipStatus, reload: reloadFollows } = useUserFollows(userId);
  const { reviewCount, avgRating: reviewAvgRating } = usePublicReviewCount(userId);
  const { reviews, isLoading: reviewsLoading } = useUserReviews(userId);
  const [isSavingFollow, setIsSavingFollow] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(null);
  const [activitySearch, setActivitySearch] = useState("");
  const [commentSearch, setCommentSearch] = useState("");
  const [reviewSearch, setReviewSearch] = useState("");
  const deferredActivitySearch = useDeferredValue(activitySearch);
  const deferredCommentSearch = useDeferredValue(commentSearch);
  const deferredReviewSearch = useDeferredValue(reviewSearch);

  const filteredPosts = useMemo(() => {
    const query = deferredActivitySearch.trim().toLowerCase();

    if (!query) {
      return posts;
    }

    return posts.filter((post) =>
      [post.title, post.body, post.gameTitle, post.author].join(" ").toLowerCase().includes(query),
    );
  }, [deferredActivitySearch, posts]);

  const mediaPosts = useMemo(
    () => posts.filter((post) => (post.imageUrls?.length ?? 0) > 0 || post.type === "clip").slice(0, 12),
    [posts],
  );
  const reputationBadges = useMemo(() => {
    const badges = [];
    if (posts.filter((post) => post.type === "guide" || post.type === "tip").length >= 3) badges.push("Helpful guide maker");
    if (posts.filter((post) => post.type === "review").length >= 3) badges.push("Reviewer");
    if (mediaPosts.length >= 3) badges.push("Media creator");
    if (comments.length >= 10) badges.push("Conversation starter");
    return badges;
  }, [comments.length, mediaPosts.length, posts]);

  const filteredComments = useMemo(() => {
    const query = deferredCommentSearch.trim().toLowerCase();

    if (!query) {
      return comments;
    }

    return comments.filter((comment) =>
      [comment.body, comment.postTitle, comment.gameTitle, comment.author].join(" ").toLowerCase().includes(query),
    );
  }, [comments, deferredCommentSearch]);

  const filteredReviews = useMemo(() => {
    const query = deferredReviewSearch.trim().toLowerCase();

    if (!query) {
      return reviews;
    }

    return reviews.filter((review) => review.title.toLowerCase().includes(query));
  }, [deferredReviewSearch, reviews]);

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
    <View style={styles.screenWrapper}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroActions}>
            <Pressable onPress={() => goBackOrFallback(router, "/(tabs)/browse")} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Back</Text>
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
          {profile.developerGameIds?.length > 0 ? <Text style={styles.developerBadge}>Verified developer</Text> : null}
          {profile.bio ? <Text style={styles.bioText}>{profile.bio}</Text> : null}
          {reputationBadges.length > 0 ? (
            <View style={styles.badgeRow}>
              {reputationBadges.map((badge) => (
                <View key={badge} style={styles.reputationBadge}>
                  <Text style={styles.reputationBadgeText}>{badge}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{friendCount}</Text>
              <Text style={styles.statLabel}>Friends</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{posts.length}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{reviewCount}</Text>
              {reviewAvgRating ? (
                <Text style={styles.statSubValue}>{reviewAvgRating} avg</Text>
              ) : null}
              <Text style={styles.statLabel}>Reviewed</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{comments.length}</Text>
              <Text style={styles.statLabel}>Comments</Text>
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

        <SectionCard title="Media" eyebrow="Screenshots and clips">
          {mediaPosts.length > 0 ? (
            <View style={styles.mediaGrid}>
              {mediaPosts.map((post) => {
                const imageUrl = post.imageUrls?.[0] ?? post.imageUrl ?? post.videoThumbnailUrl ?? null;
                return (
                  <Pressable
                    key={`media:${post.id}`}
                    onPress={() => router.push(`/post/${post.id}`)}
                    style={styles.mediaTile}
                  >
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.mediaTileImage} />
                    ) : (
                      <View style={styles.mediaTileFallback}>
                        <Text style={styles.mediaTileFallbackText}>Clip</Text>
                      </View>
                    )}
                    <Text numberOfLines={1} style={styles.mediaTileLabel}>{post.gameTitle}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.bodyText}>Screenshots and clips from this player will appear here.</Text>
          )}
        </SectionCard>

        <SectionCard title="Recent activity" eyebrow="Profile feed">
          <TextInput
            onChangeText={setActivitySearch}
            placeholder="Search posts"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            value={activitySearch}
          />
          {activityLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : filteredPosts.length > 0 ? (
            <View style={styles.feedList}>
              {filteredPosts.map((post) => (
                <PostCard
                  key={post.id}
                  onAuthorPress={() => router.push(`/user/${post.userId}`)}
                  onOpenComments={() =>
                    router.push({ pathname: "/post/[id]", params: { id: post.id, scrollTo: "comments" } })
                  }
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

        <SectionCard title="Reviews" eyebrow="Searchable">
          <TextInput
            onChangeText={setReviewSearch}
            placeholder="Search reviews"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            value={reviewSearch}
          />
          {reviewsLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : filteredReviews.length > 0 ? (
            <View style={styles.reviewList}>
              {filteredReviews.map((review) => (
                <Pressable
                  key={`${review.gameId}:${review.createdAt}`}
                  onPress={() => router.push(`/game/${review.gameId}`)}
                  style={styles.reviewRow}
                >
                  <Text style={styles.reviewTitle}>{review.title}</Text>
                  <Text style={styles.reviewMeta}>{review.rating}/10</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.bodyText}>No public reviews from this player yet.</Text>
          )}
        </SectionCard>

        <SectionCard title="Comment history" eyebrow="Searchable">
          <TextInput
            onChangeText={setCommentSearch}
            placeholder="Search comments"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            value={commentSearch}
          />
          {commentsLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : filteredComments.length > 0 ? (
            <View style={styles.commentList}>
              {filteredComments.map((comment) => (
                <Pressable
                  key={comment.id}
                  onPress={() => router.push(`/post/${comment.postId}`)}
                  style={styles.commentRow}
                >
                  <Text style={styles.commentPostTitle}>{comment.postTitle}</Text>
                  <Text style={styles.commentBody} numberOfLines={3}>{comment.body}</Text>
                  <Text style={styles.commentMeta}>{comment.gameTitle}</Text>
                </Pressable>
              ))}
              {commentsHasMore ? (
                <Pressable
                  disabled={commentsLoadingMore}
                  onPress={loadMoreComments}
                  style={[styles.secondaryButton, commentsLoadingMore ? { opacity: 0.5 } : null]}
                >
                  {commentsLoadingMore ? (
                    <ActivityIndicator color={theme.colors.accent} size="small" />
                  ) : (
                    <Text style={styles.secondaryButtonText}>Load more</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Text style={styles.bodyText}>No public comments from this player yet.</Text>
          )}
        </SectionCard>
      </ScrollView>
      <BottomNavBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.layout.screenPadding,
    gap: theme.spacing.lg,
    paddingBottom: 80,
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
  developerBadge: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  bioText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
    textAlign: "center",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    justifyContent: "center",
  },
  reputationBadge: {
    backgroundColor: "rgba(255,204,51,0.12)",
    borderColor: "rgba(255,204,51,0.38)",
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  reputationBadgeText: {
    color: "#ffcc33",
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
  },
  statRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    flexWrap: "wrap",
    justifyContent: "center",
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
  statSubValue: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: "500",
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
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  mediaTile: {
    width: "31%",
    gap: theme.spacing.xs,
  },
  mediaTileImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  mediaTileFallback: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  mediaTileFallbackText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  mediaTileLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
  },
  feedList: {
    gap: theme.spacing.md,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  reviewList: {
    gap: theme.spacing.sm,
  },
  reviewRow: {
    borderWidth: theme.borders.width,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.card,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  reviewTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  reviewMeta: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  commentList: {
    gap: theme.spacing.sm,
  },
  commentRow: {
    borderWidth: theme.borders.width,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.card,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  commentPostTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  commentBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  commentMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
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
