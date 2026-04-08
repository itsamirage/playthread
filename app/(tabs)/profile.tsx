import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import SectionCard from "../../components/SectionCard";
import { logoutUser } from "../../lib/auth";
import { getFollowStatusLabel, useFollows } from "../../lib/follows";
import { useCurrentProfile } from "../../lib/profile";
import { theme } from "../../lib/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { followedCount, followedGames, isLoading: followsLoading, unfollowGame } = useFollows();
  const { profile } = useCurrentProfile();

  const handleLogout = async () => {
    try {
      setLoading(true);

      const { error } = await logoutUser();

      if (error) {
        Alert.alert("Logout failed", error.message);
        return;
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong while logging out.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnfollow = async (game) => {
    const { error } = await unfollowGame(game);

    if (error) {
      Alert.alert("Follow update failed", error.message);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(profile?.username ?? "P").charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.title}>@{profile?.username ?? "player"}</Text>
        <Text style={styles.subtitle}>Building a gaming identity on PlayThread</Text>
      </View>

      <SectionCard title="Stats" eyebrow="Overview">
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{followedCount}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>6</Text>
            <Text style={styles.statLabel}>Played</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>19</Text>
            <Text style={styles.statLabel}>Backlog</Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Linked platforms" eyebrow="Connections">
        <Text style={styles.bodyText}>Steam | Xbox | PSN will appear here later.</Text>
      </SectionCard>

      <SectionCard title="Following" eyebrow="Your games">
        {followsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.bodyText}>Loading followed games...</Text>
          </View>
        ) : followedGames.length > 0 ? (
          <View style={styles.followList}>
            {followedGames.map((game) => (
              <View key={game.id} style={styles.followCard}>
                <Pressable
                  onPress={() => router.push(`/game/${game.id}`)}
                  style={({ pressed }) => [
                    styles.followMainArea,
                    pressed ? styles.buttonPressed : null,
                  ]}
                >
                  {game.coverUrl ? (
                    <Image source={{ uri: game.coverUrl }} style={styles.followCover} />
                  ) : (
                    <View style={styles.followFallbackCover}>
                      <Text style={styles.followFallbackText}>
                        {game.title.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.followTextBlock}>
                    <Text style={styles.followTitle}>{game.title}</Text>
                    <Text style={styles.followMeta}>
                      {getFollowStatusLabel(game.playStatus)} | Followed{" "}
                      {new Date(game.followedAt).toLocaleDateString()}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => handleUnfollow(game)}
                  style={({ pressed }) => [
                    styles.secondaryActionButton,
                    pressed ? styles.buttonPressed : null,
                  ]}
                >
                  <Text style={styles.secondaryActionText}>Unfollow</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.bodyText}>
            You are not following any games yet. Browse live IGDB results and follow a few to build this list.
          </Text>
        )}
      </SectionCard>

      <SectionCard title="Account actions" eyebrow="Settings">
        <Pressable
          disabled={loading}
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.button,
            pressed && !loading ? styles.buttonPressed : null,
            loading ? styles.buttonDisabled : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.buttonText}>Log out</Text>
          )}
        </Pressable>
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
  hero: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
  },
  avatarText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
  },
  statRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
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
  followList: {
    gap: theme.spacing.md,
  },
  followCard: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: theme.borders.width,
  },
  followMainArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  followCover: {
    width: 48,
    height: 68,
    borderRadius: theme.radius.sm,
  },
  followFallbackCover: {
    width: 48,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: theme.radius.sm,
  },
  followFallbackText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  followTextBlock: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  followTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  followMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  secondaryActionButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.sm,
  },
  secondaryActionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  button: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
});
