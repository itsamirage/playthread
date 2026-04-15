import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import GameCard from "../components/GameCard";
import SectionCard from "../components/SectionCard";
import { useContentPreferences } from "../lib/contentPreferences";
import { useFollows } from "../lib/follows";
import { useCatalogGames } from "../lib/games";
import { goBackOrFallback } from "../lib/navigation";
import { theme } from "../lib/theme";

const sortOptions = [
  { key: "score_desc", label: "Score high-low" },
  { key: "score_asc", label: "Score low-high" },
  { key: "date_desc", label: "Newest first" },
  { key: "date_asc", label: "Oldest first" },
];

const titlesByFacet = {
  studio: "Studio catalog",
  genre: "Genre catalog",
  year: "Release year",
};

export default function CatalogScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const facet = String(params.facet ?? "");
  const value = String(params.value ?? "");
  const [sortBy, setSortBy] = useState("score_desc");
  const { preferences } = useContentPreferences();
  const { games, isLoading, error } = useCatalogGames({
    facet,
    value,
    sortBy,
    hideMatureGames: preferences.hideMatureGames,
  });
  const { isFollowingGame, getFollowStatus, setFollowStatus, unfollowGame } = useFollows();

  const handleSelectStatus = async (game, status) => {
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Pressable
          onPress={() => goBackOrFallback(router, "/(tabs)/browse")}
          style={({ pressed }) => [
            styles.backButton,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>{titlesByFacet[facet] ?? "Catalog"}</Text>
        <Text style={styles.subtitle}>
          {facet === "studio" ? `Games by ${value}` : null}
          {facet === "genre" ? `${value} games` : null}
          {facet === "year" ? `Games released in ${value}` : null}
        </Text>
        {preferences.hideMatureGames ? <Text style={styles.subtitle}>Mature-rated games are hidden.</Text> : null}
      </View>

      <SectionCard title="Sort" eyebrow="Browse order">
        <View style={styles.sortRow}>
          {sortOptions.map((option) => {
            const isActive = option.key === sortBy;

            return (
              <Pressable
                key={option.key}
                onPress={() => setSortBy(option.key)}
                style={[styles.sortChip, isActive ? styles.sortChipActive : null]}
              >
                <Text style={[styles.sortChipText, isActive ? styles.sortChipTextActive : null]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      <View style={styles.results}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.subtitle}>Loading games...</Text>
          </View>
        ) : games.length > 0 ? (
          games.map((game) => (
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
        ) : (
          <SectionCard title="No games found" eyebrow="Try another path">
            <Text style={styles.emptyText}>
              {error
                ? "This catalog could not load right now."
                : "No games matched this filter."}
            </Text>
          </SectionCard>
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
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  backButtonText: {
    color: theme.colors.textPrimary,
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
  sortRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  sortChip: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  sortChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  sortChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  sortChipTextActive: {
    color: theme.colors.background,
    fontWeight: theme.fontWeights.bold,
  },
  results: {
    gap: theme.spacing.md,
  },
  loadingState: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xl,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  buttonPressed: {
    opacity: 0.92,
  },
});
