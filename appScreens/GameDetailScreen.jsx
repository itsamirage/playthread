import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
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
import { updatePostMetadata, useMyAdminProfile } from "../lib/admin";
import { useContentPreferences } from "../lib/contentPreferences";
import {
  FOLLOW_STATUS_OPTIONS,
  getFollowStatusLabel,
  shouldRevealSpoilersForStatus,
  useFollows,
} from "../lib/follows";
import { GAME_RATING_OPTIONS, saveGameRating, useGameRating } from "../lib/gameRatings";
import { useGameDetail } from "../lib/games";
import { goBackOrFallback } from "../lib/navigation";
import {
  deletePost,
  filterPostsByTypes,
  POST_SORT_OPTIONS,
  POST_TOP_PERIOD_OPTIONS,
  POST_TYPE_OPTIONS,
  sortPostsForDisplay,
  togglePostReaction,
  useGamePosts,
} from "../lib/posts";
import { Image as ExpoImage } from "expo-image";
import { getMetacriticColor, theme } from "../lib/theme";

const THREAD_PREFERENCE_STORAGE_KEY = "playthread:game-thread-preferences";
const postTypeLabels = {
  discussion: "Discussion",
  review: "Review",
  screenshot: "Images",
  guide: "Guides",
  tip: "Tips",
  clip: "Clips",
};

export default function GameDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { session } = useAuth();
  const { preferences } = useContentPreferences();
  const { profile: staffProfile } = useMyAdminProfile();
  const { game, isLoading, error, source } = useGameDetail(params.id, {
    hideMatureGames: preferences.hideMatureGames,
  });
  const { isFollowingGame, getFollowStatus, setFollowStatus, unfollowGame } = useFollows();
  const { posts, isLoading: postsLoading, isLoadingMore, hasMore, error: postsError, reload: reloadPosts, loadMore, updatePostReaction } = useGamePosts(params.id);
  const {
    myRating,
    averageRating,
    ratingsCount,
    isLoading: ratingsLoading,
    reload: reloadRatings,
  } = useGameRating(params.id);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [showSpoilers, setShowSpoilers] = useState(false);
  const [ratingPanelExpanded, setRatingPanelExpanded] = useState(false);
  const [followPanelExpanded, setFollowPanelExpanded] = useState(false);
  const [selectedThreadTypes, setSelectedThreadTypes] = useState(POST_TYPE_OPTIONS);
  const [threadSort, setThreadSort] = useState("new");
  const [threadTopPeriod, setThreadTopPeriod] = useState("week");
  const [reactingPostId, setReactingPostId] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [giftPost, setGiftPost] = useState(null);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const [isSavingRating, setIsSavingRating] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [developerOnly, setDeveloperOnly] = useState(false);
  const [moderatingPostId, setModeratingPostId] = useState(null);

  const followStatus = getFollowStatus(params.id);
  const isFollowed = isFollowingGame(params.id);
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? null;
  const displayedCommunityRating = averageRating ?? game?.starRating ?? null;
  const visiblePosts = sortPostsForDisplay(
    filterPostsByTypes(
      developerOnly ? posts.filter((post) => post.isDeveloperPost) : posts,
      selectedThreadTypes,
    ),
    { sort: threadSort, topPeriod: threadTopPeriod },
  );
  const hasDeveloperPosts = posts.some((post) => post.isDeveloperPost);
  const canModeratePosts = ["moderator", "admin", "owner"].includes(staffProfile?.accountRole ?? "");
  useEffect(() => {
    setShowSpoilers(shouldRevealSpoilersForStatus(followStatus));
  }, [followStatus]);

  useEffect(() => {
    let isMounted = true;

    const loadPreferences = async () => {
      const gameId = String(params.id ?? "").trim();

      if (!gameId) {
        return;
      }

      try {
        const rawValue = await AsyncStorage.getItem(THREAD_PREFERENCE_STORAGE_KEY);
        const storedPreferences = rawValue ? JSON.parse(rawValue) : {};
        const gamePreferences = storedPreferences?.[gameId];

        if (!isMounted || !gamePreferences) {
          return;
        }

        if (Array.isArray(gamePreferences.selectedThreadTypes) && gamePreferences.selectedThreadTypes.length > 0) {
          setSelectedThreadTypes(
            gamePreferences.selectedThreadTypes.filter((type) => POST_TYPE_OPTIONS.includes(type)),
          );
        }

        if (typeof gamePreferences.threadSort === "string" && gamePreferences.threadSort in POST_SORT_OPTIONS) {
          setThreadSort(gamePreferences.threadSort);
        }

        if (typeof gamePreferences.threadTopPeriod === "string" && gamePreferences.threadTopPeriod in POST_TOP_PERIOD_OPTIONS) {
          setThreadTopPeriod(gamePreferences.threadTopPeriod);
        }

        if (typeof gamePreferences.developerOnly === "boolean") {
          setDeveloperOnly(gamePreferences.developerOnly);
        }
      } catch {
        // Ignore corrupt local preference data.
      }
    };

    loadPreferences();

    return () => {
      isMounted = false;
    };
  }, [params.id]);

  useEffect(() => {
    const gameId = String(params.id ?? "").trim();

    if (!gameId) {
      return;
    }

    const persistPreferences = async () => {
      try {
        const rawValue = await AsyncStorage.getItem(THREAD_PREFERENCE_STORAGE_KEY);
        const storedPreferences = rawValue ? JSON.parse(rawValue) : {};
        storedPreferences[gameId] = {
          selectedThreadTypes,
          threadSort,
          threadTopPeriod,
          developerOnly,
        };
        await AsyncStorage.setItem(THREAD_PREFERENCE_STORAGE_KEY, JSON.stringify(storedPreferences));
      } catch {
        // Ignore local persistence failures.
      }
    };

    void persistPreferences();
  }, [developerOnly, params.id, selectedThreadTypes, threadSort, threadTopPeriod]);

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
        <Text style={styles.title}>{preferences.hideMatureGames ? "Game hidden" : "Game not found"}</Text>
        <Text style={styles.subtitle}>
          {preferences.hideMatureGames
            ? "This game is hidden by your mature-content preference. Turn that off in Profile settings to view it."
            : `This detail page could not find a game for ID ${String(params.id)}.`}
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
      return;
    }

    setFollowPanelExpanded(false);
  };

  const handleUnfollow = async () => {
    const { error: followError } = await unfollowGame(game);

    if (followError) {
      Alert.alert("Follow update failed", followError.message);
      return;
    }

    setFollowPanelExpanded(false);
  };

  const handleReact = async (postId, reactionType) => {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to sign in before reacting to posts.");
      return;
    }

    const post = posts.find((p) => p.id === postId);
    const previousReaction = post?.viewerReaction ?? null;

    // Optimistic update — feels instant
    updatePostReaction(postId, reactionType, previousReaction);

    try {
      setReactingPostId(postId);
      await togglePostReaction({ userId: session.user.id, postId, reactionType });
    } catch (nextError) {
      // Roll back on failure
      updatePostReaction(postId, previousReaction, reactionType);
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
      setRatingPanelExpanded(false);
    } catch (nextError) {
      Alert.alert("Rating failed", nextError?.message ?? "Could not save your rating.");
    } finally {
      setIsSavingRating(false);
    }
  };

  const handleModeratePost = async (post, nextType, pinnedHours = null) => {
    try {
      setModeratingPostId(post.id);
      await updatePostMetadata({
        postId: post.id,
        type: nextType,
        pinnedHours,
      });
      await reloadPosts();
    } catch (nextError) {
      Alert.alert("Moderator action failed", nextError?.message ?? "Could not update that post.");
    } finally {
      setModeratingPostId(null);
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
        <Pressable onPress={() => goBackOrFallback(router, "/(tabs)/browse")} style={styles.topBarBackButton}>
          <Text style={styles.topBarBackButtonText}>Back</Text>
        </Pressable>
        <NotificationInboxButton />
      </View>
      <View style={styles.heroCard}>
        <View style={styles.heroInnerRow}>
          {game.coverUrl ? (
            <ExpoImage source={{ uri: game.coverUrl }} style={styles.coverImage} contentFit="cover" />
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
        <Pressable
          onPress={() => setIsOverviewOpen((currentValue) => !currentValue)}
          style={styles.overviewToggle}
        >
          <Text style={styles.overviewToggleLabel}>Overview</Text>
          <Text style={styles.overviewToggleArrow}>{isOverviewOpen ? "▲" : "▼"}</Text>
        </Pressable>
        {isOverviewOpen ? (
          <View style={styles.overviewContent}>
            <Text style={styles.bodyText}>{game.summary}</Text>
            {error ? (
              <Text style={styles.warningText}>
                Live IGDB details are unavailable right now, so this page is using local fallback data.
              </Text>
            ) : null}
          </View>
        ) : null}
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

        <Pressable
          onPress={() => setRatingPanelExpanded((currentValue) => !currentValue)}
          style={[styles.darkStatCard, ratingPanelExpanded ? styles.statCardActive : null]}
        >
          <Text style={styles.darkStatLabel}>My</Text>
          <Text style={[styles.darkStatValue, myRating ? { color: theme.colors.accent } : null]}>
            {myRating ? myRating.toFixed(1) : "--"}
          </Text>
        </Pressable>

        <View style={styles.darkStatCard}>
          <Text style={styles.darkStatLabel}>Ratings</Text>
          <Text style={styles.darkStatValue}>{ratingsCount || game.members}</Text>
        </View>
      </View>

      {ratingPanelExpanded ? (
        <View style={styles.expandedPanel}>
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
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          onPress={() => setFollowPanelExpanded((currentValue) => !currentValue)}
          style={[styles.statusInlineButton, followPanelExpanded ? styles.statusInlineButtonActive : null]}
        >
          <Text style={styles.statusInlineButtonText} numberOfLines={1}>
            {isFollowed ? getFollowStatusLabel(followStatus) : "Your status"}
          </Text>
          <Text style={styles.statusInlineArrow}>{followPanelExpanded ? "▲" : "▼"}</Text>
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

      {followPanelExpanded ? (
        <View style={styles.expandedPanel}>
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
            <>
              <Text style={styles.helperText}>
                Spoilers are {showSpoilers ? "shown" : "hidden"} by default for this status.
              </Text>
              <Pressable onPress={handleUnfollow} style={styles.unfollowButton}>
                <Text style={styles.unfollowButtonText}>Unfollow game</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

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
          {Object.entries(POST_SORT_OPTIONS).map(([sortKey, sortLabel]) => {
            const isActive = threadSort === sortKey;

            return (
              <Pressable
                key={sortKey}
                onPress={() => setThreadSort(sortKey)}
                style={[styles.communityChip, isActive ? styles.communityChipActive : null]}
              >
                <Text
                  style={[
                    styles.communityChipText,
                    isActive ? styles.communityChipTextActive : null,
                  ]}
                >
                  {sortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.communityToolbar}>
          {POST_TYPE_OPTIONS.map((type) => {
            const isActive = selectedThreadTypes.includes(type);

            return (
              <Pressable
                key={type}
                onPress={() =>
                  setSelectedThreadTypes((currentValue) => {
                    if (currentValue.includes(type)) {
                      return currentValue.length === 1
                        ? currentValue
                        : currentValue.filter((value) => value !== type);
                    }

                    return [...currentValue, type];
                  })
                }
                style={[styles.communityChip, isActive ? styles.communityChipActive : null]}
              >
                <Text
                  style={[
                    styles.communityChipText,
                    isActive ? styles.communityChipTextActive : null,
                  ]}
                >
                  {postTypeLabels[type] ?? type}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {hasDeveloperPosts ? (
          <View style={styles.communityToolbar}>
            <Pressable
              onPress={() => setDeveloperOnly((currentValue) => !currentValue)}
              style={[styles.communityChip, developerOnly ? styles.communityChipActive : null]}
            >
              <Text
                style={[
                  styles.communityChipText,
                  developerOnly ? styles.communityChipTextActive : null,
                ]}
              >
                Developer
              </Text>
            </Pressable>
          </View>
        ) : null}
        {threadSort === "top" ? (
          <View style={styles.communityToolbar}>
            {Object.entries(POST_TOP_PERIOD_OPTIONS).map(([periodKey, periodLabel]) => {
              const isActive = threadTopPeriod === periodKey;

              return (
                <Pressable
                  key={periodKey}
                  onPress={() => setThreadTopPeriod(periodKey)}
                  style={[styles.communityChip, isActive ? styles.communityChipActive : null]}
                >
                  <Text
                    style={[
                      styles.communityChipText,
                      isActive ? styles.communityChipTextActive : null,
                    ]}
                  >
                    {periodLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {!showSpoilers && posts.some((post) => post.spoiler) ? (
          <Text style={styles.helperText}>
            Spoiler posts stay in the thread list. Tap one if you want to open that specific spoiler thread without changing your game status.
          </Text>
        ) : null}
        {postsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.subtitle}>Loading posts...</Text>
          </View>
        ) : visiblePosts.length > 0 ? (
          <View style={styles.threadList}>
            {visiblePosts.map((post) => (
              <View key={post.id} style={styles.threadItem}>
                <PostCard
                  concealSpoilers={
                    Boolean(post.spoiler) &&
                    !showSpoilers
                  }
                  isDeleting={deletingPostId === post.id}
                  isReacting={reactingPostId === post.id}
                  onAuthorPress={() => router.push(`/user/${post.userId}`)}
                  onDelete={session?.user?.id === post.userId ? () => handleDeletePost(post) : null}
                  onEdit={session?.user?.id === post.userId ? () => handleEditPost(post) : null}
                  onGift={session?.user?.id && session.user.id !== post.userId ? () => setGiftPost(post) : null}
                  onOpenComments={() => setSelectedPostId(post.id)}
                  onReact={(reactionType) => handleReact(post.id, reactionType)}
                  post={post}
                  onPress={() => router.push(`/post/${post.id}`)}
                  spoilerRevealHint="Tap to open this spoiler post. Your saved game-completion spoiler setting will stay unchanged."
                />
                {canModeratePosts ? (
                  <View style={styles.moderatorRow}>
                    {POST_TYPE_OPTIONS.map((type) => {
                      const isActive = post.type === type;

                      return (
                        <Pressable
                          key={`${post.id}:${type}`}
                          onPress={() => handleModeratePost(post, type, post.isPinned ? Math.max(1, Math.round((new Date(post.pinnedUntil).getTime() - Date.now()) / 3600000)) : null)}
                          style={[styles.moderatorChip, isActive ? styles.moderatorChipActive : null]}
                        >
                          <Text style={[styles.moderatorChipText, isActive ? styles.moderatorChipTextActive : null]}>
                            {postTypeLabels[type] ?? type}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {[24, 72, 168, 0].map((hours) => {
                      const isActive = hours > 0
                        ? post.isPinned && Math.abs(new Date(post.pinnedUntil).getTime() - (Date.now() + hours * 3600000)) < 3600000
                        : !post.isPinned;

                      return (
                        <Pressable
                          key={`${post.id}:pin:${hours}`}
                          onPress={() => handleModeratePost(post, post.type, hours || null)}
                          style={[styles.moderatorChip, isActive ? styles.moderatorChipActive : null]}
                        >
                          <Text style={[styles.moderatorChipText, isActive ? styles.moderatorChipTextActive : null]}>
                            {moderatingPostId === post.id ? "Saving..." : hours === 0 ? "Unpin" : `Pin ${hours >= 168 ? "7d" : `${hours}h`}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        {hasMore ? (
          <Pressable
            onPress={loadMore}
            disabled={isLoadingMore}
            style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null, { marginTop: theme.spacing.sm }]}
          >
            {isLoadingMore ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : (
              <Text style={styles.secondaryButtonText}>Load more</Text>
            )}
          </Pressable>
        ) : null}
        {!postsLoading && visiblePosts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.bodyText}>
              No posts match your current thread filters for {game.title}.
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
        ) : null}
      </SectionCard>

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
  topBarBackButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  topBarBackButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  heroCard: {
    gap: theme.spacing.md,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.width,
    padding: theme.spacing.lg,
  },
  heroInnerRow: {
    flexDirection: "row",
    gap: theme.spacing.lg,
  },
  overviewToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopColor: theme.colors.border,
    borderTopWidth: theme.borders.width,
    paddingTop: theme.spacing.md,
  },
  overviewToggleLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  overviewToggleArrow: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
  },
  overviewContent: {
    gap: theme.spacing.sm,
  },
  statCardActive: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(0,229,255,0.08)",
  },
  expandedPanel: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  statusInlineButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  statusInlineButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(0,229,255,0.08)",
  },
  statusInlineButtonText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  statusInlineArrow: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
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
  collapseHeader: {
    gap: theme.spacing.sm,
  },
  collapseActionText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  buttonPressed: {
    opacity: 0.92,
  },
  threadList: {
    gap: theme.spacing.md,
  },
  threadItem: {
    gap: theme.spacing.sm,
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
  moderatorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  moderatorChip: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  moderatorChipActive: {
    backgroundColor: "rgba(255,204,51,0.14)",
    borderColor: "#ffcc33",
  },
  moderatorChipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
  },
  moderatorChipTextActive: {
    color: "#ffcc33",
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
});
