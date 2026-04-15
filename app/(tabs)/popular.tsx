import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";

import PostCard from "../../components/PostCard";
import PostCommentsSheet from "../../components/PostCommentsSheet";
import SectionCard from "../../components/SectionCard";
import CoinGiftSheet from "../../components/CoinGiftSheet";
import NotificationInboxButton from "../../components/NotificationInboxButton";
import { MODERATION_PERIOD_OPTIONS } from "../../lib/admin";
import { sendCoinGift } from "../../lib/admin";
import { useAuth } from "../../lib/auth";
import { useFollows } from "../../lib/follows";
import { describeIntegrityError } from "../../lib/integrity";
import { deletePost, togglePostReaction, usePopularPosts } from "../../lib/posts";
import { useTabReselectScroll } from "../../lib/tabReselect";
import { theme } from "../../lib/theme";

function getPopularSummary(post) {
  if (post.reactionMode === "utility") {
    return `${post.reactionCounts.helpful ?? 0} helpful • ${post.comments} comments`;
  }

  if (post.reactionMode === "appreciation") {
    return `${post.reactionCounts.respect ?? 0} respect • ${post.comments} comments`;
  }

  return `${post.reactionCounts.like ?? 0} likes • ${post.comments} comments`;
}

export default function AllScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { shouldShowSpoilersByDefault } = useFollows();
  const [period, setPeriod] = useState("day");
  const { posts, isLoading, error, reload } = usePopularPosts(period);
  const [reactingPostId, setReactingPostId] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [giftPost, setGiftPost] = useState(null);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const scrollRef = useRef(null);
  const topPosts = useMemo(() => posts.slice(0, 8), [posts]);
  const leadPost = topPosts[0] ?? null;
  const nextPosts = topPosts.slice(1, 4);
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? null;
  const scrollHandlers = useTabReselectScroll("all", { scrollRef, onRefresh: reload });

  const handleReact = async (postId, reactionType) => {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to sign in before reacting to posts.");
      return;
    }

    try {
      setReactingPostId(postId);
      await togglePostReaction({
        userId: session.user.id,
        postId,
        reactionType,
      });
      await reload();
    } catch (nextError) {
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
    Alert.alert("Delete clip", "This will remove the clip post from PlayThread.", [
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
    }, [reload]),
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      onScroll={scrollHandlers.onScroll}
      scrollEventThrottle={scrollHandlers.scrollEventThrottle}
    >
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTextBlock}>
            <Text style={styles.eyebrow}>PlayThread</Text>
            <Text style={styles.title}>All</Text>
            <Text style={styles.subtitle}>
              Top posts across every game, with time filters and a small-community boost so smaller fandoms still get exposure.
            </Text>
          </View>
          <NotificationInboxButton />
        </View>
      </View>

      <SectionCard title="Ranking window" eyebrow="All games">
        <View style={styles.filterRow}>
          {MODERATION_PERIOD_OPTIONS.map((option) => {
            const isActive = option.key === period;

            return (
              <Pressable
                key={option.key}
                onPress={() => setPeriod(option.key)}
                style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
              >
                <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.helperText}>
          Ranking blends reaction quality, comment activity, recency, and a follow-count boost for less-followed games.
        </Text>
      </SectionCard>

      {isLoading ? (
        <SectionCard title="Loading all posts" eyebrow="Community">
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.bodyText}>Ranking conversations across all of PlayThread...</Text>
          </View>
        </SectionCard>
      ) : topPosts.length > 0 ? (
        <>
          <SectionCard title="Top now" eyebrow="Cross-game feed">
            <View style={styles.rankList}>
              {topPosts.slice(0, 3).map((post, index) => (
                <Pressable
                  key={post.id}
                  onPress={() => router.push(`/post/${post.id}`)}
                  style={({ pressed }) => [styles.rankRow, pressed ? styles.rowPressed : null]}
                >
                  <Text style={styles.rank}>#{index + 1}</Text>
                  <View style={styles.rankText}>
                    <Text style={styles.rankGame}>{post.gameTitle}</Text>
                    <Text style={styles.rankTitle}>{post.title}</Text>
                    <Text style={styles.metaText}>
                      {getPopularSummary(post)} • {post.followCount ?? 0} following
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </SectionCard>

          {leadPost ? (
            <View style={styles.feedList}>
              <PostCard
                concealSpoilers={Boolean(leadPost.spoiler) && !shouldShowSpoilersByDefault(leadPost.gameId)}
                isDeleting={deletingPostId === leadPost.id}
                isReacting={reactingPostId === leadPost.id}
                onAuthorPress={() => router.push(`/user/${leadPost.userId}`)}
                onDelete={session?.user?.id === leadPost.userId ? () => handleDeletePost(leadPost) : null}
                onEdit={session?.user?.id === leadPost.userId ? () => handleEditPost(leadPost) : null}
                onGift={session?.user?.id && session.user.id !== leadPost.userId ? () => setGiftPost(leadPost) : null}
                onOpenComments={() => setSelectedPostId(leadPost.id)}
                onPress={() => router.push(`/post/${leadPost.id}`)}
                onReact={(reactionType) => handleReact(leadPost.id, reactionType)}
                post={leadPost}
              />
            </View>
          ) : null}

          {nextPosts.length > 0 ? (
            <SectionCard title="More top posts" eyebrow="Rising next">
              <View style={styles.feedList}>
                {nextPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    concealSpoilers={Boolean(post.spoiler) && !shouldShowSpoilersByDefault(post.gameId)}
                    isDeleting={deletingPostId === post.id}
                    isReacting={reactingPostId === post.id}
                    onAuthorPress={() => router.push(`/user/${post.userId}`)}
                    onDelete={session?.user?.id === post.userId ? () => handleDeletePost(post) : null}
                    onEdit={session?.user?.id === post.userId ? () => handleEditPost(post) : null}
                    onGift={session?.user?.id && session.user.id !== post.userId ? () => setGiftPost(post) : null}
                    onOpenComments={() => setSelectedPostId(post.id)}
                    onPress={() => router.push(`/post/${post.id}`)}
                    onReact={(reactionType) => handleReact(post.id, reactionType)}
                    post={post}
                  />
                ))}
              </View>
            </SectionCard>
          ) : null}
        </>
      ) : (
        <SectionCard title="All will fill in later" eyebrow="Community">
          <Text style={styles.bodyText}>
            Create a few posts, guides, tips, or reviews first. This feed starts working once PlayThread has real activity to rank across games.
          </Text>
          {error ? (
            <Text style={styles.warningText}>The all-games feed could not load right now.</Text>
          ) : null}
        </SectionCard>
      )}

      <PostCommentsSheet
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
  hero: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
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
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  loadingState: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  filterChip: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  filterChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  filterChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  filterChipTextActive: {
    color: theme.colors.background,
    fontWeight: theme.fontWeights.bold,
  },
  rankList: {
    gap: theme.spacing.sm,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  rowPressed: {
    opacity: 0.92,
  },
  rank: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    width: 34,
  },
  rankText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  rankGame: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  rankTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  metaText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  feedList: {
    gap: theme.spacing.md,
  },
  warningText: {
    color: "#f5a623",
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
});
