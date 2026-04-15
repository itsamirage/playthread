import { useRouter } from "expo-router";
import {
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import GameCard from "../components/GameCard";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../lib/auth";
import { useFollows } from "../lib/follows";
import { useStarterGames } from "../lib/games";
import { useOnboardingStatus } from "../lib/onboarding";
import { theme } from "../lib/theme";

export default function OnboardingScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { followedCount, isFollowingGame, getFollowStatus, setFollowStatus, unfollowGame, isLoading } =
    useFollows();
  const { markOnboardingSeen } = useOnboardingStatus(session?.user?.id);
  const {
    games: starterGames,
    isLoading: gamesLoading,
    error: gamesError,
    source,
  } = useStarterGames();

  const handleContinue = async () => {
    await markOnboardingSeen();
    router.replace("/(tabs)");
  };

  const handleSkip = async () => {
    await markOnboardingSeen();
    router.replace("/(tabs)");
  };

  const handleSelectStatus = async (game, status) => {
    const alreadyFollowing = isFollowingGame(game.id);

    if (!alreadyFollowing && followedCount >= 5) {
      Alert.alert(
        "Starter list full",
        "You can pick up to 5 games here, or skip and follow more later in Browse."
      );
      return;
    }

    const { error } = await setFollowStatus(game, status);

    if (error) {
      Alert.alert("Follow update failed", error.message);
    }
  };

  const handleUnfollow = async (game) => {
    const { error } = await unfollowGame(game);

    if (error) {
      Alert.alert("Follow update failed", error.message);
    }
  };

  if (!session) {
    router.replace("/(auth)/login");
    return null;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Optional onboarding</Text>
        <Text style={styles.subtitle}>
          You can skip this and start using the app right away, or follow up to
          5 popular starter games now.
        </Text>
      </View>

      <SectionCard title="Starter picks" eyebrow="Get started">
        <Text style={styles.helperText}>Selected so far: {followedCount} / 5</Text>
        <Text style={styles.helperText}>
          These picks help shape your feed, but they are optional.
        </Text>
        <Text style={styles.helperText}>
          Source: {source === "igdb" ? "Live IGDB" : "Mock fallback"}
        </Text>
        {gamesError ? (
          <Text style={styles.warningText}>
            Live game data is unavailable right now, so starter picks are using local fallback data.
          </Text>
        ) : null}
      </SectionCard>

      <View style={styles.actionRow}>
        <Pressable onPress={handleSkip} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Skip for now</Text>
        </Pressable>

        <Pressable
          disabled={isLoading}
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed ? styles.buttonPressed : null,
            isLoading ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.primaryButtonText}>Continue to app</Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        {gamesLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.helperText}>Loading starter picks...</Text>
          </View>
        ) : (
          starterGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              isFollowed={isFollowingGame(game.id)}
              followStatus={getFollowStatus(game.id)}
              onPress={() => router.push(`/game/${game.id}`)}
              onSelectStatus={(status) => handleSelectStatus(game, status)}
              onUnfollow={() => handleUnfollow(game)}
              onAddToBacklog={() => handleSelectStatus(game, "have_not_played")}
            />
          ))
        )}
      </View>
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
  hero: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
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
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
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
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  buttonPressed: {
    opacity: 0.92,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  list: {
    gap: theme.spacing.md,
  },
  loadingState: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xl,
  },
  warningText: {
    color: "#f5a623",
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
});
