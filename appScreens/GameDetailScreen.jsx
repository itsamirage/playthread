import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import PostCard from "../components/PostCard";
import PostCommentsSheet from "../components/PostCommentsSheet";
import PlatformBadge from "../components/PlatformBadge";
import SectionCard from "../components/SectionCard";
import CoinGiftSheet from "../components/CoinGiftSheet";
import NotificationInboxButton from "../components/NotificationInboxButton";
import { sendCoinGift } from "../lib/admin";
import { useAuth } from "../lib/auth";
import {
  FOLLOW_STATUS_OPTIONS,
  getFollowStatusLabel,
  shouldRevealSpoilersForStatus,
  useFollows,
} from "../lib/follows";
import { GAME_RATING_OPTIONS, saveGameRating, useGameRating } from "../lib/gameRatings";
import { useGameDetail } from "../lib/games";
import { deletePost, togglePostReaction, useGamePosts } from "../lib/posts";
import { getMetacriticColor, theme } from "../lib/theme";

export default function GameDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { session } = useAuth();
  const { game, isLoading, error, source } = useGameDetail(params.id);
  const { isFollowingGame, getFollowStatus, setFollowStatus, unfollowGame } = useFollows();
  const { posts, isLoading: postsLoading, error: postsError, reload: reloadPosts } = useGamePosts(params.id);
  const {
    myRating,
    averageRating,
    ratingsCount,
    isLoading: ratingsLoading,
    reload: reloadRatings,
  } = useGameRating(params.id);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [showSpoilers, setShowSpoilers] = useState(false);
  const [reactingPostId, setReactingPostId] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [giftPost, setGiftPost] = useState(null);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const [isSavingRating, setIsSavingRating] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState(null);

  const followStatus = getFollowStatus(params.id);
  const isFollowed = isFollowingGame(params.id);
  const isInBacklog = followStatus === "have_not_played";
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? null;
  const displayedCommunityRating = averageRating ?? game?.starRating ?? null;

  useEffect(() => {
    setShowSpoilers(shouldRevealSpoilersForStatus(followStatus));
  }, [followStatus]);

  if (isLoading) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.subtitle}>Loading game details...</Text>
        </View>
      </ScrollView>
    );
  }

  if (!game) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Game not found</Text>
        <Text style={styles.subtitle}>
          This detail page could not find a game for ID {String(params.id)}.
        </Text>

        <Pressable onPress={() => router.push("/(tabs)")} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Go home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const handleSelectStatus = async (status) => {
    const { error: followError } = await setFollowStatus(game, status);

    if (followError) {
      Alert.alert("Follow update failed", followError.message);
    }
  };

  const handleUnfollow = async () => {
    const { error: followError } = await unfollowGame(game);

    if (followError) {
      Alert.alert("Follow update failed", followError.message);
    }
  };

  const handleAddToBacklog = async () => {
    const { error: followError } = await setFollowStatus(game, "have_not_played");

    if (followError) {
      Alert.alert("Backlog update failed", followError.message);
      return;
    }

    Alert.alert("Added to backlog", `${game.title} is now in your backlog.`);
  };

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
      await reloadPosts();
    } catch (nextError) {
      Alert.alert("Reaction failed", nextError?.message ?? "Could not update that reaction.");
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
      Alert.alert("Gift failed", nextError?.message ?? "Could not send that gift.");
    } finally {
      setIsSendingGift(false);
    }
  };

  const handleSaveRating = async (rating) => {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to sign in before rating a game.");
      return;
    }

    try {
      setIsSavingRating(true);
      await saveGameRating({
        gameId: game.id,
        userId: session.user.id,
        rating,
      });
      await reloadRatings();
    } catch (nextError) {
      Alert.alert("Rating failed", nextError?.message ?? "Could not save your rating.");
    } finally {
      setIsSavingRating(false);
    }
  };

  const handleEditPost = (post) => {
    router.push({ pathname: "/create-post", params: { gameId: String(post.gameId), postId: post.id } });
  };

  const handleDeletePost = (post) => {
    Alert.alert(
      "Delete clip",
      "This will remove the clip post from the game thread.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingPostId(post.id);
              await deletePost({ postId: post.id });
              await reloadPosts();
            } catch (nextError) {
              Alert.alert("Delete failed", nextError?.message ?? "Could not delete that clip.");
            } finally {
              setDeletingPostId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View style={styles.topBarSpacer} />
        <NotificationInboxButton />
      </View>
      <View style={styles.heroCard}>
        {game.coverUrl ? (
          <Image source={{ uri: game.coverUrl }} style={styles.coverImage} />
        ) : (
          <View style={styles.cover}>
            <Text style={styles.coverText}>{game.title.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.heroText}>
          <Text style={styles.eyebrow}>Game detail</Text>
          <Text style={styles.title}>{game.title}</Text>
          <View style={styles.metaRow}>
            <Pressable
              onPress={() =>
                router.push({ pathname: "/catalog", params: { facet: "studio", value: game.studio } })
              }
            >
              <Text style={styles.linkText}>{game.studio}</Text>
            </Pressable>
            <Text style={styles.subtitleDivider}>|</Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/catalog",
                  params: { facet: "year", value: String(game.releaseYear) },
                })
              }
            >
              <Text style={styles.linkText}>{game.releaseYear}</Text>
            </Pressable>
            <Text style={styles.subtitleDivider}>|</Text>
            <Pressable
              onPress={() =>
                router.push({ pathname: "/catalog", params: { facet: "genre", value: game.genre } })
              }
            >
              <Text style={styles.linkText}>{game.genre}</Text>
            </Pressable>
          </View>

          <View style={styles.platformRow}>
            {game.platforms.map((platform) => (
              <PlatformBadge key={platform} platform={platform} />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View
          style={[
            styles.scoreCard,
            { backgroundColor: getMetacriticColor(game.metacritic) },
          ]}
        >
          <Text style={styles.scoreLabel}>Meta</Text>
          <Text style={styles.scoreValue}>{game.metacritic}</Text>
        </View>

        <View style={styles.darkStatCard}>
          <Text style={styles.darkStatLabel}>Users</Text>
          <Text style={styles.darkStatValue}>
            {displayedCommunityRating ? displayedCommunityRating.toFixed(1) : "--"}
          </Text>
        </View>

        <View style={styles.darkStatCard}>
          <Text style={styles.darkStatLabel}>Ratings</Text>
          <Text style={styles.darkStatValue}>{ratingsCount || game.members}</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          onPress={() => setIsOverviewOpen(true)}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Read overview</Text>
        </Pressable>

        <Pressable
          onPress={() =>
            router.push({ pathname: "/create-post", params: { gameId: String(game.id) } })
          }
          style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null]}
        >
          <Text style={styles.primaryButtonText}>Create post</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={handleAddToBacklog}
        style={({ pressed }) => [
          styles.backlogButton,
          isInBacklog ? styles.backlogButtonActive : null,
          pressed ? styles.buttonPressed : null,
        ]}
      >
        <Text style={[styles.backlogButtonText, isInBacklog ? styles.backlogButtonTextActive : null]}>
          {isInBacklog ? "In your backlog" : "Add to backlog"}
        </Text>
      </Pressable>

      <SectionCard title="Your rating" eyebrow="Rate this game">
        <Text style={styles.bodyText}>
          {myRating
            ? `Your rating: ${myRating.toFixed(1)}/10.`
            : "Rate this game without writing a review post."}{" "}
          Community rating is {displayedCommunityRating ? `${displayedCommunityRating.toFixed(1)}/10` : "not available yet"}.
        </Text>
        {ratingsLoading ? (
          <View style={styles.loadingStateInline}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : (
          <View style={styles.ratingWrap}>
            {GAME_RATING_OPTIONS.map((option) => {
              const isActive = Number(option) === myRating;

              return (
                <Pressable
                  key={option}
                  disabled={isSavingRating}
                  onPress={() => handleSaveRating(option)}
                  style={[styles.ratingChip, isActive ? styles.ratingChipActive : null]}
                >
                  <Text style={[styles.ratingChipText, isActive ? styles.ratingChipTextActive : null]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </SectionCard>

      <SectionCard title="Your status" eyebrow="Following">
        <Text style={styles.bodyText}>
          {isFollowed
            ? `${getFollowStatusLabel(followStatus)}. Spoilers are ${
                showSpoilers ? "shown" : "blurred"
              } by default for this status.`
            : "Pick a status to follow this game and set its spoiler behavior."}
        </Text>
        <View style={styles.statusWrap}>
          {FOLLOW_STATUS_OPTIONS.map((option) => {
            const isActive = option.key === followStatus;

            return (
              <Pressable
                key={option.key}
                onPress={() => handleSelectStatus(option.key)}
                style={[styles.statusChip, isActive ? styles.statusChipActive : null]}
              >
                <Text
                  style={[styles.statusChipText, isActive ? styles.statusChipTextActive : null]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {isFollowed ? (
          <Pressable onPress={handleUnfollow} style={styles.unfollowButton}>
            <Text style={styles.unfollowButtonText}>Unfollow game</Text>
          </Pressable>
        ) : null}
      </SectionCard>

      <SectionCard title="Threads" eyebrow="Community">
        <View style={styles.communityToolbar}>
          <Pressable
            onPress={() => setShowSpoilers((currentValue) => !currentValue)}
            style={[styles.communityChip, showSpoilers ? styles.communityChipActive : null]}
          >
            <Text
              style={[
                styles.communityChipText,
                showSpoilers ? styles.communityChipTextActive : null,
              ]}
            >
              {showSpoilers ? "Spoilers visible" : "Spoilers blurred"}
            </Text>
          </Pressable>
        </View>
        {!showSpoilers && posts.some((post) => post.spoiler) ? (
          <Text style={styles.helperText}>
            Spoiler posts stay in the thread list, but they are blurred until you reveal them.
          </Text>
        ) : null}
        {postsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.subtitle}>Loading posts...</Text>
          </View>
        ) : posts.length > 0 ? (
          <View style={styles.threadList}>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                concealSpoilers={Boolean(post.spoiler) && !showSpoilers}
                isDeleting={deletingPostId === post.id}
                isReacting={reactingPostId === post.id}
                onAuthorPress={() => router.push(`/user/${post.userId}`)}
                onDelete={session?.user?.id === post.userId && post.type === "clip" ? () => handleDeletePost(post) : null}
                onEdit={session?.user?.id === post.userId && post.type === "clip" ? () => handleEditPost(post) : null}
                onGift={session?.user?.id && session.user.id !== post.userId ? () => setGiftPost(post) : null}
                onOpenComments={() => setSelectedPostId(post.id)}
                onReact={(reactionType) => handleReact(post.id, reactionType)}
                post={post}
                onPress={() => router.push(`/post/${post.id}`)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.bodyText}>
              No one has posted about {game.title} yet. Start the first thread.
            </Text>
            <Pressable
              onPress={() =>
                router.push({ pathname: "/create-post", params: { gameId: String(game.id) } })
              }
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Write the first post</Text>
            </Pressable>
            {postsError ? (
              <Text style={styles.warningText}>The game feed could not load right now.</Text>
            ) : null}
          </View>
        )}
      </SectionCard>

      <Modal
        animationType="slide"
        transparent
        visible={isOverviewOpen}
        onRequestClose={() => setIsOverviewOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.eyebrow}>{source === "igdb" ? "Overview" : "Game info"}</Text>
            <Text style={styles.modalTitle}>{game.title}</Text>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.bodyText}>{game.summary}</Text>
              {error ? (
                <Text style={styles.warningText}>
                  Live IGDB details are unavailable right now, so this page is using local fallback data.
                </Text>
              ) : null}
            </ScrollView>
            <Pressable
              onPress={() => setIsOverviewOpen(false)}
              style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null]}
            >
              <Text style={styles.primaryButtonText}>Close overview</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <PostCommentsSheet
        onClose={() => setSelectedPostId(null)}
        onCommentCountChange={reloadPosts}
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
    paddingBottom: theme.spacing.xxl,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing.xl,
  },
  topBarSpacer: {
    flex: 1,
  },
  heroCard: {
    flexDirection: "row",
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.width,
    padding: theme.spacing.lg,
  },
  cover: {
    width: 84,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: theme.radius.md,
  },
  coverImage: {
    width: 84,
    height: 120,
    borderRadius: theme.radius.md,
  },
  coverText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
  },
  heroText: {
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
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  linkText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.medium,
  },
  subtitleDivider: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.md,
  },
  platformRow: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  scoreCard: {
    flex: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  scoreLabel: {
    color: "#081017",
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  scoreValue: {
    color: "#081017",
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
  },
  darkStatCard: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  darkStatLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  darkStatValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.lg,
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  backlogButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  backlogButtonActive: {
    backgroundColor: "rgba(0,229,255,0.12)",
    borderColor: theme.colors.accent,
  },
  backlogButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  backlogButtonTextActive: {
    color: theme.colors.accent,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  warningText: {
    color: "#f5a623",
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
    paddingTop: theme.spacing.sm,
  },
  loadingState: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xxl,
  },
  loadingStateInline: {
    paddingVertical: theme.spacing.md,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.92,
  },
  threadList: {
    gap: theme.spacing.md,
  },
  emptyState: {
    gap: theme.spacing.md,
  },
  communityToolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  communityChip: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  communityChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  communityChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  communityChipTextActive: {
    color: theme.colors.background,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  statusWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  statusChip: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  statusChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  statusChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  statusChipTextActive: {
    color: theme.colors.background,
    fontWeight: theme.fontWeights.bold,
  },
  unfollowButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.sm,
  },
  unfollowButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  ratingWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  ratingChip: {
    minWidth: 54,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  ratingChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  ratingChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  ratingChipTextActive: {
    color: theme.colors.background,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: theme.spacing.md,
  },
  modalCard: {
    maxHeight: "80%",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.width,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
  },
  modalContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
});
