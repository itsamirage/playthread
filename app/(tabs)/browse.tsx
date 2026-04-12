import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import GameCard from "../../components/GameCard";
import NotificationInboxButton from "../../components/NotificationInboxButton";
import PostCard from "../../components/PostCard";
import SectionCard from "../../components/SectionCard";
import { useFollows } from "../../lib/follows";
import { useBrowseGames } from "../../lib/games";
import { usePostSearch } from "../../lib/posts";
import { theme } from "../../lib/theme";
import { useCreatorSearch } from "../../lib/userSocial";

export default function BrowseScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const { followedCount, isFollowingGame, getFollowStatus, setFollowStatus, unfollowGame } =
    useFollows();
  const { filteredGames, genres, isLoading, error, isDebouncing, source } = useBrowseGames({
    query,
    selectedGenre,
  });
  const { results: creators, isLoading: creatorsLoading } = useCreatorSearch(query);
  const { posts: postResults, isLoading: postsLoading } = usePostSearch(query);
  const cleanQuery = query.trim().toLowerCase();
  const hasActiveFilters = cleanQuery.length > 0 || selectedGenre !== "All";

  const handleClearFilters = () => {
    setQuery("");
    setSelectedGenre("All");
  };

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
        <View style={styles.heroTopRow}>
          <View style={styles.heroTextBlock}>
            <Text style={styles.eyebrow}>PlayThread</Text>
            <Text style={styles.title}>Browse games</Text>
            <Text style={styles.subtitle}>
              Search now hits live IGDB results, and follow buttons save to your
              Supabase follows table.
            </Text>
          </View>
          <NotificationInboxButton />
        </View>
      </View>

      <SectionCard title="Search" eyebrow="Discover">
        <TextInput
          autoCapitalize="words"
          onChangeText={setQuery}
          placeholder="Search title, studio, or genre"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          value={query}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.genreRow}
        >
          {genres.map((genre) => {
            const isActive = genre === selectedGenre;

            return (
              <Pressable
                key={genre}
                onPress={() => setSelectedGenre(genre)}
                style={[
                  styles.genreChip,
                  isActive ? styles.genreChipActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.genreChipText,
                    isActive ? styles.genreChipTextActive : null,
                  ]}
                >
                  {genre}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.toolbarRow}>
          <Text style={styles.followedSummary}>
            Following {followedCount} games
          </Text>
        </View>
        <Text style={styles.sourceText}>
          Source: {source === "igdb" ? "Live IGDB" : "Mock fallback"}
        </Text>
        {cleanQuery.length === 1 ? (
          <Text style={styles.sourceText}>Type at least 2 letters to search IGDB.</Text>
        ) : null}
        {isDebouncing && cleanQuery.length >= 2 ? (
          <Text style={styles.sourceText}>Searching...</Text>
        ) : null}
        {error ? (
          <Text style={styles.warningText}>
            Live game data is unavailable right now, so Browse is using local fallback data.
          </Text>
        ) : null}
        {hasActiveFilters ? (
          <Pressable onPress={handleClearFilters}>
            <Text style={styles.clearButtonText}>Clear search and filters</Text>
          </Pressable>
        ) : null}
      </SectionCard>

      <View style={styles.resultsHeader}>
        <View style={styles.resultsText}>
          <Text style={styles.resultsTitle}>Results</Text>
          <Text style={styles.resultsMeta}>
            Genre: {selectedGenre}
            {cleanQuery ? ` | Search: ${query.trim()}` : ""}
          </Text>
        </View>
        <Text style={styles.resultsCount}>{filteredGames.length} games</Text>
      </View>

      <View style={styles.resultsList}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.emptyText}>Loading games...</Text>
          </View>
        ) : filteredGames.length > 0 ? (
          filteredGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              isFollowed={isFollowingGame(game.id)}
              followStatus={getFollowStatus(game.id)}
              onPress={() => router.push(`/game/${game.id}`)}
              onSelectStatus={(status) => handleSelectStatus(game, status)}
              onUnfollow={() => handleUnfollow(game)}
            />
          ))
        ) : (
          <SectionCard title="No games found" eyebrow="Try again">
            <Text style={styles.emptyText}>
              Try a different title, studio name, or genre filter.
            </Text>
          </SectionCard>
        )}
      </View>

      {cleanQuery.length >= 2 ? (
        <>
          <SectionCard title="Posts" eyebrow="Threads">
            {postsLoading ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : postResults.length > 0 ? (
              <View style={styles.resultsList}>
                {postResults.map((post) => (
                  <PostCard
                    key={post.id}
                    onAuthorPress={() => router.push(`/user/${post.userId}`)}
                    onOpenComments={() => router.push(`/post/${post.id}`)}
                    onPress={() => router.push(`/post/${post.id}`)}
                    post={post}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No posts match that search yet.</Text>
            )}
          </SectionCard>

          <SectionCard title="Creators" eyebrow="People">
            {creatorsLoading ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : creators.length > 0 ? (
              <View style={styles.creatorList}>
                {creators.map((creator) => (
                  <Pressable
                    key={creator.id}
                    onPress={() => router.push(`/user/${creator.id}`)}
                    style={styles.creatorCard}
                  >
                    <Text style={styles.creatorName}>{creator.displayName}</Text>
                    <Text style={styles.creatorMeta}>@{creator.username}</Text>
                    {creator.bio ? <Text style={styles.creatorBio}>{creator.bio}</Text> : null}
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No creators match that search yet.</Text>
            )}
          </SectionCard>
        </>
      ) : null}
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
  searchInput: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  genreRow: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  genreChip: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  genreChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  genreChipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  genreChipTextActive: {
    color: theme.colors.background,
    fontWeight: theme.fontWeights.bold,
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  followedSummary: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
  clearButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  sourceText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  warningText: {
    color: "#f5a623",
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  resultsText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  resultsTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  resultsMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  resultsCount: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
  },
  resultsList: {
    gap: theme.spacing.md,
  },
  creatorList: {
    gap: theme.spacing.md,
  },
  creatorCard: {
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  creatorName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  creatorMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  creatorBio: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
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
});
