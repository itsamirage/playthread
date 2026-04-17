import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";

import PostCard from "../../components/PostCard";
import PostCommentsSheet from "../../components/PostCommentsSheet";
import SectionCard from "../../components/SectionCard";
import CoinGiftSheet from "../../components/CoinGiftSheet";
import NotificationInboxButton from "../../components/NotificationInboxButton";
import { sendCoinGift } from "../../lib/admin";
import { useAuth } from "../../lib/auth";
import { GENERAL_DISCUSSION } from "../../lib/communityHubs";
import { useFollows } from "../../lib/follows";
import { describeIntegrityError } from "../../lib/integrity";
import { deletePost, togglePostReaction, useFeedPosts } from "../../lib/posts";
import { useTabReselectScroll } from "../../lib/tabReselect";
import { theme } from "../../lib/theme";

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { followedGameIds, followedGames, shouldShowSpoilersByDefault } =
    useFollows();
  const { posts, isLoading, isLoadingMore, hasMore, error, reload, loadMore } = useFeedPosts(followedGameIds);
  const [reactingPostId, setReactingPostId] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [giftPost, setGiftPost] = useState(null);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [optimisticReactions, setOptimisticReactions] = useState<Record<string, { viewerReaction: string | null; reactionCounts: Record<string, number> }>>({});
  const scrollRef = useRef(null);
  const feedPosts = posts.map((post) => {
    const opt = optimisticReactions[post.id];
    return opt ? { ...post, ...opt } : post;
  });
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? null;
  const scrollHandlers = useTabReselectScroll("home", { scrollRef, onRefresh: reload });

  const handleReact = async (postId, reactionType) => {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to sign in before reacting to posts.");
      return;
    }

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const prevReaction = optimisticReactions[postId]?.viewerReaction ?? post.viewerReaction ?? null;
    const prevCounts = { ...(optimisticReactions[postId]?.reactionCounts ?? post.reactionCounts ?? {}) };
    const toggling = prevReaction === reactionType;
    const newReaction = toggling ? null : reactionType;
    const newCounts = { ...prevCounts };
    if (toggling) {
      newCounts[reactionType] = Math.max(0, (newCounts[reactionType] ?? 0) - 1);
    } else {
      if (prevReaction) newCounts[prevReaction] = Math.max(0, (newCounts[prevReaction] ?? 0) - 1);
      newCounts[reactionType] = (newCounts[reactionType] ?? 0) + 1;
    }

    setOptimisticReactions((prev) => ({ ...prev, [postId]: { viewerReaction: newReaction, reactionCounts: newCounts } }));

    try {
      setReactingPostId(postId);
      await togglePostReaction({ userId: session.user.id, postId, reactionType });
    } catch (nextError) {
      setOptimisticReactions((prev) => { const next = { ...prev }; delete next[postId]; return next; });
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
      Alert.alert("Gift sent", `Sent ${amount} coins to @${giftPost.author}.`);
    } catch (nextError) {
      const errorCopy = describeIntegrityError(nextError);
      Alert.alert(errorCopy.title, errorCopy.detail);
    } finally {
      setIsSendingGift(false);
    }
  };

  const handleEditPost = (post) => {
    router.push({ pathname: "/create-post", params: { gameId: String(post.gameId), postId: post.id } });
  };

  const handleDeletePost = (post) => {
    Alert.alert("Delete clip", "This will remove the clip post from your feed.", [
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

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const renderPost = ({ item: post }) => (
    <PostCard
      concealSpoilers={Boolean(post.spoiler) && !shouldShowSpoilersByDefault(post.gameId)}
      isDeleting={deletingPostId === post.id}
      isReacting={reactingPostId === post.id}
      onAuthorPress={() => router.push(`/user/${post.userId}`)}
      onDelete={session?.user?.id === post.userId ? () => handleDeletePost(post) : null}
      onEdit={session?.user?.id === post.userId ? () => handleEditPost(post) : null}
      onGift={session?.user?.id && session.user.id !== post.userId ? () => setGiftPost(post) : null}
      onOpenComments={() => setSelectedPostId(post.id)}
      onGamePress={() => router.push(`/game/${post.gameId}`)}
      onReact={(reactionType) => handleReact(post.id, reactionType)}
      post={post}
      onPress={() => router.push(`/post/${post.id}`)}
    />
  );

  const listHeader = (
    <View style={styles.header}>
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTextBlock}>
            <Text style={styles.eyebrow}>PlayThread</Text>
            <Text style={styles.title}>Home</Text>
            <Text style={styles.subtitle}>
              Posts from the games you follow will land here first, with reviews,
              screenshots, clips, and discussion threads.
            </Text>
          </View>
          <NotificationInboxButton />
        </View>
        <Pressable
          onPress={() => router.push("/create-post")}
          style={({ pressed }) => [
            styles.heroButton,
            pressed ? styles.primaryButtonPressed : null,
          ]}
        >
          <Text style={styles.heroButtonText}>Create post</Text>
        </Pressable>
      </View>

      <View style={styles.portalRow}>
        <Pressable onPress={() => router.push(`/community/${GENERAL_DISCUSSION.slug}`)} style={styles.portalCard}>
          <Text style={styles.portalEyebrow}>Community</Text>
          <Text style={styles.portalTitle}>Gaming Discussion</Text>
          <Text style={styles.portalBody}>
            Talk about favorite sports games, genres, studios, and bigger gaming topics.
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push("/platforms")} style={styles.portalCard}>
          <Text style={styles.portalEyebrow}>Browse</Text>
          <Text style={styles.portalTitle}>Platforms</Text>
          <Text style={styles.portalBody}>
            Jump into Xbox, PlayStation, Nintendo, and PC communities with user-only threads.
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <SectionCard title="Loading feed" eyebrow="Your posts">
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.bodyText}>Loading posts from the games you follow...</Text>
          </View>
        </SectionCard>
      ) : feedPosts.length === 0 ? (
        <SectionCard title="Start your feed" eyebrow="Discover">
          <Text style={styles.bodyText}>
            {followedGames.length > 0
              ? "You are following games, but nobody has posted there yet. Create the first real thread instead of waiting for placeholder content."
              : "Follow a few games in Browse and PlayThread will start filling this feed with real reviews, screenshots, clips, and discussion posts."}
          </Text>
          {error ? (
            <Text style={styles.warningText}>
              The real feed could not load right now. You can still follow games and create new posts.
            </Text>
          ) : null}
          <Pressable
            onPress={() => router.push("/(tabs)/browse")}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.primaryButtonPressed : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>Browse games</Text>
          </Pressable>
        </SectionCard>
      ) : null}
    </View>
  );

  const listFooter = (
    <View style={styles.footer}>
      {hasMore ? (
        <Pressable
          onPress={loadMore}
          disabled={isLoadingMore}
          style={({ pressed }) => [styles.loadMoreButton, pressed ? styles.primaryButtonPressed : null]}
        >
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
        data={isLoading ? [] : feedPosts}
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
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  footer: {
    paddingTop: theme.spacing.md,
  },
  separator: {
    height: theme.spacing.md,
  },
  hero: {
    gap: theme.spacing.sm,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  heroTextBlock: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  heroButton: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  heroButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
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
  portalRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    flexWrap: "wrap",
  },
  portalCard: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  portalEyebrow: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  portalTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  portalBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  loadingState: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
  },
  primaryButtonPressed: {
    opacity: 0.92,
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.md,
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
  warningText: {
    color: "#f5a623",
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
});
