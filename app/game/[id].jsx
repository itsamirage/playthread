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

import PostCard from "../../components/PostCard";
import PlatformBadge from "../../components/PlatformBadge";
import SectionCard from "../../components/SectionCard";
import {
  FOLLOW_STATUS_OPTIONS,
  getFollowStatusLabel,
  shouldRevealSpoilersForStatus,
  useFollows,
} from "../../lib/follows";
import { useGameDetail } from "../../lib/games";
import { useGamePosts } from "../../lib/posts";
import { getMetacriticColor, theme } from "../../lib/theme";

export default function GameDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { game, isLoading, error, source } = useGameDetail(params.id);
  const { isFollowingGame, getFollowStatus, setFollowStatus, unfollowGame } = useFollows();
  const { posts, isLoading: postsLoading, error: postsError } = useGamePosts(params.id);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [showSpoilers, setShowSpoilers] = useState(false);

  const followStatus = getFollowStatus(params.id);
  const isFollowed = isFollowingGame(params.id);

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

        <Pressable onPress={() => router.back()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Go back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const handleSelectStatus = async (status) => {
    const { error } = await setFollowStatus(game, status);

    if (error) {
      Alert.alert("Follow update failed", error.message);
    }
  };

  const handleUnfollow = async () => {
    const { error } = await unfollowGame(game);

    if (error) {
      Alert.alert("Follow update failed", error.message);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
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
          <Text style={styles.darkStatLabel}>User</Text>
          <Text style={styles.darkStatValue}>{game.starRating}</Text>
        </View>

        <View style={styles.darkStatCard}>
          <Text style={styles.darkStatLabel}>Members</Text>
          <Text style={styles.darkStatValue}>{game.members}</Text>
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
                post={post}
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
  heroCard: {
    flexDirection: "row",
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.width,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.xl,
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
