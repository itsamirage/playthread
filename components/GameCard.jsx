import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import {
  FOLLOW_STATUS_OPTIONS,
  getFollowStatusLabel,
} from "../lib/follows";
import { getGameScoreBadge } from "../lib/gamePresentation";
import { getMetacriticColor, theme } from "../lib/theme";
import PlatformBadge from "./PlatformBadge";

export default function GameCard({
  game,
  isFollowed,
  followStatus,
  onPress,
  onSelectStatus,
  onUnfollow,
}) {
  const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);
  const coverLetter = game.title.charAt(0).toUpperCase();
  const scoreBadge = getGameScoreBadge(game);
  const buttonLabel = isFollowed
    ? getFollowStatusLabel(followStatus)
    : "Follow game";

  const handleSelectStatus = async (status) => {
    await onSelectStatus?.(status);
    setIsStatusPickerOpen(false);
  };

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.mainArea,
          pressed ? styles.mainAreaPressed : null,
        ]}
      >
        {game.coverUrl ? (
          <Image source={{ uri: game.coverUrl }} style={styles.coverImage} />
        ) : (
          <View style={styles.cover}>
            <Text style={styles.coverText}>{coverLetter}</Text>
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.title}>{game.title}</Text>
          <Text style={styles.meta}>
            {game.studio} | {game.releaseYear} | {game.genre}
          </Text>
          <View style={styles.platformRow}>
            {game.platforms.map((platform) => (
              <PlatformBadge key={platform} platform={platform} />
            ))}
          </View>
          <Text style={styles.subMeta}>
            {game.members} members | {game.starRating} stars
          </Text>
        </View>

        {scoreBadge ? (
          <View
            style={[
              styles.scoreBadge,
              scoreBadge.kind === "score"
                ? { backgroundColor: getMetacriticColor(game.metacritic) }
                : styles.scoreBadgeUpcoming,
            ]}
          >
            <Text
              style={[
                styles.scoreText,
                scoreBadge.kind === "score" ? null : styles.scoreTextUpcoming,
              ]}
            >
              {scoreBadge.label}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Pressable
        onPress={() => setIsStatusPickerOpen((currentValue) => !currentValue)}
        style={[
          styles.followButton,
          isFollowed ? styles.followButtonActive : null,
        ]}
      >
        <Text
          style={[
            styles.followButtonText,
            isFollowed ? styles.followButtonTextActive : null,
          ]}
        >
          {buttonLabel}
        </Text>
      </Pressable>

      {isStatusPickerOpen ? (
        <View style={styles.statusPicker}>
          <Text style={styles.statusPickerTitle}>
            {isFollowed ? "Update your status" : "Choose your status"}
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
            <Pressable
              onPress={async () => {
                await onUnfollow?.();
                setIsStatusPickerOpen(false);
              }}
              style={styles.unfollowButton}
            >
              <Text style={styles.unfollowButtonText}>Unfollow</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  mainArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  mainAreaPressed: {
    opacity: 0.92,
  },
  cover: {
    width: 52,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: theme.radius.sm,
  },
  coverImage: {
    width: 52,
    height: 72,
    borderRadius: theme.radius.sm,
  },
  coverText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  info: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  meta: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
  platformRow: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    paddingTop: 2,
  },
  subMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
  },
  scoreBadge: {
    minWidth: 48,
    alignItems: "center",
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  scoreText: {
    color: "#081017",
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  scoreBadgeUpcoming: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: theme.colors.border,
    borderWidth: theme.borders.width,
  },
  scoreTextUpcoming: {
    color: theme.colors.textSecondary,
  },
  followButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.sm,
  },
  followButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  followButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  followButtonTextActive: {
    color: theme.colors.background,
  },
  statusPicker: {
    gap: theme.spacing.sm,
    borderTopColor: theme.colors.border,
    borderTopWidth: theme.borders.width,
    paddingTop: theme.spacing.sm,
  },
  statusPickerTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
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
    backgroundColor: "rgba(0,229,255,0.12)",
    borderColor: theme.colors.accent,
  },
  statusChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  statusChipTextActive: {
    color: theme.colors.accent,
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
});
