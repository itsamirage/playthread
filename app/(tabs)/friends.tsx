import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CoinGiftSheet from "../../components/CoinGiftSheet";
import NotificationInboxButton from "../../components/NotificationInboxButton";
import PostCard from "../../components/PostCard";
import PostCommentsSheet from "../../components/PostCommentsSheet";
import SectionCard from "../../components/SectionCard";
import { sendCoinGift } from "../../lib/admin";
import { useAuth } from "../../lib/auth";
import { useFollows } from "../../lib/follows";
import { describeIntegrityError } from "../../lib/integrity";
import { deletePost, togglePostReaction, useFriendsFeedPosts } from "../../lib/posts";
import { useTabReselectScroll } from "../../lib/tabReselect";
import { theme } from "../../lib/theme";
import { useUserFollows } from "../../lib/userSocial";

export default function FriendsFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { shouldShowSpoilersByDefault } = useFollows();
  const { friendUserIds, friendCount, isLoading: friendsLoading, reload: reloadFriends } =
    useUserFollows(session?.user?.id ?? null);
  const { posts, isLoading, isLoadingMore, hasMore, error, reload, loadMore } =
    useFriendsFeedPosts(friendUserIds);
  const [reactingPostId, setReactingPostId] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [giftPost, setGiftPost] = useState(null);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [optimisticReactions, setOptimisticReactions] = useState<Record<string, { viewerReaction: string | null; reactionCounts: Record<string, number> }>>({});
  const scrollRef = useRef(null);
  const scrollHandlers = useTabReselectScroll("friends", {
    scrollRef,
    onRefresh: () => {
      reloadFriends();
      reload();
    },
  });
  const feedPosts = posts.map((post) => {
    const optimisticPost = optimisticReactions[post.id];
    return optimisticPost ? { ...post, ...optimisticPost } : post;
  });
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? null;
  const isInitialLoading = friendsLoading || isLoading;
  const reviewCount = feedPosts.filter((post) => post.type === "review").length;

  const handleReact = async (postId, reactionType) => {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to sign in before reacting to posts.");
      return;
    }

    const post = posts.find((candidate) => candidate.id === postId);
    if (!post) return;

    const previousReaction = optimisticReactions[postId]?.viewerReaction ?? post.viewerReaction ?? null;
    const previousCounts = { ...(optimisticReactions[postId]?.reactionCounts ?? post.reactionCounts ?? {}) };
    const isToggling = previousReaction === reactionType;
    const nextReaction = isToggling ? null : reactionType;
    const nextCounts = { ...previousCounts };

    if (isToggling) {
      nextCounts[reactionType] = Math.max(0, (nextCounts[reactionType] ?? 0) - 1);
    } else {
      if (previousReaction) {
        nextCounts[previousReaction] = Math.max(0, (nextCounts[previousReaction] ?? 0) - 1);
      }
      nextCounts[reactionType] = (nextCounts[reactionType] ?? 0) + 1;
    }

    setOptimisticReactions((current) => ({
      ...current,
      [postId]: { viewerReaction: nextReaction, reactionCounts: nextCounts },
    }));

    try {
      setReactingPostId(postId);
      await togglePostReaction({ userId: session.user.id, postId, reactionType });
    } catch (nextError) {
      setOptimisticReactions((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
      const errorCopy = describeIntegrityError(nextError);
      Alert.alert(errorCopy.title, errorCopy.detail);
    } finally {
      setReactingPostId(null);
    }
  };

  const handleSendGift = async ({ amount, note, isAnonymous }) => {
    if (!session?.user?.id || !giftPost?.userId) {
      return;
    }

    try {
      setIsSendingGift(true);
      await sendCoinGift({
        fromUserId: session.user.id,
        toUserId: giftPost.userId,
        amount,
        note,
        isAnonymous,
      });
      setGiftPost(null);
    } catch (nextError) {
      const errorCopy = describeIntegrityError(nextError);
      Alert.alert(errorCopy.title, errorCopy.detail);
    } finally {
      setIsSendingGift(false);
    }
  };

  const handleDeletePost = (post) => {
    Alert.alert("Delete post", "This will remove the post from your feed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingPostId(post.id);
            await deletePost({ postId: post.id });
            await reload();
          } catch (nextError) {
            const errorCopy = describeIntegrityError(nextError);
            Alert.alert(errorCopy.title, errorCopy.detail);
          } finally {
            setDeletingPostId(null);
          }
        },
      },
    ]);
  };

  const renderPost = ({ item: post }) => (
    <PostCard
      concealSpoilers={Boolean(post.spoiler) && !shouldShowSpoilersByDefault(post.gameId)}
      isDeleting={deletingPostId === post.id}
      isReacting={reactingPostId === post.id}
      onAuthorPress={() => router.push(`/user/${post.userId}`)}
      onDelete={session?.user?.id === post.userId ? () => handleDeletePost(post) : null}
      onEdit={session?.user?.id === post.userId ? () => router.push({ pathname: "/create-post", params: { gameId: String(post.gameId), postId: post.id } }) : null}
      onGift={session?.user?.id && session.user.id !== post.userId ? () => setGiftPost(post) : null}
      onOpenComments={() => setSelectedPostId(post.id)}
      onGamePress={() => router.push(`/game/${post.gameId}`)}
      onReact={(reactionType) => handleReact(post.id, reactionType)}
      onPress={() => router.push(`/post/${post.id}`)}
      post={post}
    />
  );

  const listHeader = (
    <View style={[styles.header, { paddingTop: insets.top + theme.spacing.md }]}>
      <View style={styles.heroTopRow}>
        <View style={styles.heroTextBlock}>
          <Text style={styles.eyebrow}>PlayThread</Text>
          <Text style={styles.title}>Friends</Text>
          <Text style={styles.subtitle}>
            Recent posts, reviews, clips, and discussions from your friends.
          </Text>
        </View>
        <NotificationInboxButton />
      </View>

      <SectionCard title="Friends activity" eyebrow="Recent">
        <View style={styles.digestRow}>
          <View style={styles.digestPill}>
            <Text style={styles.digestValue}>{friendCount}</Text>
            <Text style={styles.digestLabel}>Friends</Text>
          </View>
          <View style={styles.digestPill}>
            <Text style={styles.digestValue}>{feedPosts.length}</Text>
            <Text style={styles.digestLabel}>Posts</Text>
          </View>
          <View style={styles.digestPill}>
            <Text style={styles.digestValue}>{reviewCount}</Text>
            <Text style={styles.digestLabel}>Reviews</Text>
          </View>
        </View>
      </SectionCard>

      {isInitialLoading ? (
        <SectionCard title="Loading" eyebrow="Friends">
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.bodyText}>Loading your friends feed...</Text>
          </View>
        </SectionCard>
      ) : feedPosts.length === 0 ? (
        <SectionCard title="No friend activity yet" eyebrow="Add friends">
          <Text style={styles.bodyText}>
            {friendCount > 0
              ? "Your friends have not posted recently. Their reviews and posts will show up here when they do."
              : "Add friends from player profiles to build a Letterboxd-style activity feed."}
          </Text>
          {error ? (
            <Text style={styles.warningText}>The friends feed could not load right now.</Text>
          ) : null}
          <Pressable onPress={() => router.push("/(tabs)/browse")} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Find players</Text>
          </Pressable>
        </SectionCard>
      ) : null}
    </View>
  );

  const listFooter = (
    <View style={styles.footer}>
      {hasMore ? (
        <Pressable onPress={loadMore} disabled={isLoadingMore} style={styles.loadMoreButton}>
          {isLoadingMore ? (
            <ActivityIndicator color={theme.colors.background} size="small" />
          ) : (
            <Text style={styles.loadMoreText}>Load more</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        ref={scrollRef}
        data={isInitialLoading ? [] : feedPosts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.content}
        onScroll={scrollHandlers.onScroll}
        scrollEventThrottle={scrollHandlers.scrollEventThrottle}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
      />
      <PostCommentsSheet
        onAuthorPress={(userId) => router.push(`/user/${userId}`)}
        onClose={() => setSelectedPostId(null)}
        onCommentCountChange={reload}
        post={selectedPost}
        visible={Boolean(selectedPost)}
      />
      <CoinGiftSheet
        visible={Boolean(giftPost)}
        targetLabel={`@${giftPost?.author ?? "player"}`}
        onClose={() => setGiftPost(null)}
        onSubmit={handleSendGift}
        isSubmitting={isSendingGift}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: 100,
  },
  header: {
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  footer: {
    paddingTop: theme.spacing.md,
  },
  separator: {
    height: theme.spacing.md,
  },
  heroTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.spacing.md,
    justifyContent: "space-between",
  },
  heroTextBlock: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  bodyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  warningText: {
    color: theme.colors.scoreMixed,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  loadingState: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
  },
  digestRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  digestPill: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    minWidth: 86,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  digestValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  digestLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.medium,
    textTransform: "uppercase",
  },
  primaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  loadMoreButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
  },
  loadMoreText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
});
