import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import GameCard from "../../components/GameCard";
import PostCard from "../../components/PostCard";
import NotificationInboxButton from "../../components/NotificationInboxButton";
import SectionCard from "../../components/SectionCard";
import { searchPlatformCommunities } from "../../lib/communityHubs";
import { useContentPreferences } from "../../lib/contentPreferences";
import { useFollows } from "../../lib/follows";
import { useBrowseGames } from "../../lib/games";
import { usePostSearch } from "../../lib/posts";
import { useTabReselectScroll } from "../../lib/tabReselect";
import { theme } from "../../lib/theme";
import { useCreatorSearch } from "../../lib/userSocial";
import { getProfileNameColor } from "../../lib/profileAppearance";

const SEARCH_MODES = {
  game: "Game",
  studio: "Studio",
  genre: "Genre",
  platform: "Platform",
  player: "Players",
  post: "Posts",
};

const PLATFORM_FILTERS = [
  { key: "ps5", label: "PS5", aliases: ["ps5", "psn"] },
  { key: "ps4", label: "PS4", aliases: ["ps4", "psn"] },
  { key: "xbox_series", label: "XSX", aliases: ["xbox_series", "xbox_one", "xbox"] },
  { key: "switch", label: "NSW", aliases: ["switch"] },
  { key: "pc", label: "PC", aliases: ["pc", "steam"] },
  { key: "ios", label: "iOS", aliases: ["ios"] },
  { key: "android", label: "AND", aliases: ["android"] },
];

const RATING_FILTERS = [
  { key: "ESRB E", label: "E" },
  { key: "ESRB E10+", label: "E10+" },
  { key: "ESRB T", label: "T" },
  { key: "ESRB M", label: "M" },
  { key: "ESRB AO", label: "AO" },
];

const GAME_SORT_OPTIONS = [
  { key: "popular", label: "Popular" },
  { key: "relevance", label: "Relevance" },
  { key: "highest_rated", label: "Highest Rated" },
];

function matchesPlatformFilter(game, filterKey) {
  if (!filterKey) {
    return true;
  }

  const filter = PLATFORM_FILTERS.find((entry) => entry.key === filterKey);
  const aliases = new Set(filter?.aliases ?? [filterKey]);
  return (game.platforms ?? []).some((platform) => aliases.has(platform));
}

function normalizeSearchValue(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesFacetQuery(value, query) {
  const normalizedValue = normalizeSearchValue(value);
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  return normalizedValue.includes(normalizedQuery);
}

function buildFacetResults(games, mode, query) {
  const facetMap = new Map();

  for (const game of games) {
    if (mode === "studio") {
      const studio = String(game.studio ?? "").trim();

      if (!studio || !matchesFacetQuery(studio, query)) {
        continue;
      }

      const currentValue = facetMap.get(studio) ?? {
        key: studio,
        label: studio,
        count: 0,
        sampleGameId: game.id,
      };

      currentValue.count += 1;
      facetMap.set(studio, currentValue);
      continue;
    }

    if (mode === "genre") {
      const genres = [...new Set([game.genre, ...(game.genres ?? [])].filter(Boolean))];

      for (const genre of genres) {
        if (!matchesFacetQuery(genre, query)) {
          continue;
        }

        const currentValue = facetMap.get(genre) ?? {
          key: genre,
          label: genre,
          count: 0,
          sampleGameId: game.id,
        };

        currentValue.count += 1;
        facetMap.set(genre, currentValue);
      }

      continue;
    }

    if (mode === "platform") {
      const platforms = [...new Set((game.platforms ?? []).filter(Boolean))];

      for (const platform of platforms) {
        if (!matchesFacetQuery(platform, query)) {
          continue;
        }

        const currentValue = facetMap.get(platform) ?? {
          key: platform,
          label: platform,
          count: 0,
          sampleGameId: game.id,
        };

        currentValue.count += 1;
        facetMap.set(platform, currentValue);
      }
    }
  }

  return [...facetMap.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

function getFacetRoute(mode, value) {
  if (mode === "studio") {
    return {
      pathname: "/catalog",
      params: { facet: "studio", value },
    };
  }

  if (mode === "genre") {
    return {
      pathname: "/catalog",
      params: { facet: "genre", value },
    };
  }

  if (mode === "platform") {
    return {
      pathname: "/platforms",
      params: { q: value },
    };
  }

  return {
    pathname: "/catalog",
    params: { facet: "genre", value },
  };
}

export default function BrowseScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState("game");
  const [activePlatformFilter, setActivePlatformFilter] = useState<string | null>(null);
  const [activeRatingFilter, setActiveRatingFilter] = useState<string | null>(null);
  const [gameSort, setGameSort] = useState("popular");
  const scrollRef = useRef(null);
  const { followedCount, isFollowingGame, getFollowStatus, setFollowStatus, unfollowGame } =
    useFollows();
  const { preferences } = useContentPreferences();
  const { games, filteredGames, isLoading, isLoadingMore, hasMore, loadMore, error, isDebouncing, source } = useBrowseGames({
    query,
    selectedGenre: "All",
    hideMatureGames: preferences.hideMatureGames,
  });
  const cleanQuery = query.trim().toLowerCase();
  const { results: playerResults, isLoading: playersLoading } = useCreatorSearch(
    searchMode === "player" ? query : ""
  );
  const { posts: postResults, isLoading: postsSearchLoading } = usePostSearch(
    searchMode === "post" ? query : ""
  );
  const handleClearFilters = () => {
    setQuery("");
    setSearchMode("game");
    setActivePlatformFilter(null);
    setActiveRatingFilter(null);
    setGameSort("popular");
  };
  const hasActiveFilters = cleanQuery.length > 0 || searchMode !== "game" || activePlatformFilter !== null || activeRatingFilter !== null || gameSort !== "popular";

  const displayedGames = filteredGames
    .filter((game) => {
      if (!matchesPlatformFilter(game, activePlatformFilter)) return false;
      if (activeRatingFilter && game.ageRatingLabel !== activeRatingFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (gameSort === "highest_rated") {
        return (b.metacritic ?? 0) - (a.metacritic ?? 0);
      }
      if (gameSort === "relevance") {
        return 0;
      }
      return 0; // "popular" keeps original order from IGDB
    });
  const scrollHandlers = useTabReselectScroll("browse", {
    scrollRef,
    onRefresh: hasActiveFilters ? handleClearFilters : undefined,
  });
  const facetResults = searchMode === "platform"
    ? searchPlatformCommunities(cleanQuery).map((platform) => ({
        key: platform.slug,
        label: platform.title,
        count: null,
        hint: platform.subtitle,
        route: {
          pathname: "/platforms",
          params: { q: platform.title },
        },
      }))
    : buildFacetResults(games, searchMode, cleanQuery);
  const titleForMode =
    searchMode === "game"
      ? "Games"
      : searchMode === "studio"
        ? "Studios"
        : searchMode === "genre"
          ? "Genres"
          : searchMode === "player"
            ? "Players"
            : searchMode === "post"
              ? "Posts"
              : "Platforms";
  const resultCount = searchMode === "game"
    ? displayedGames.length
    : searchMode === "player"
      ? playerResults.length
      : searchMode === "post"
        ? postResults.length
        : facetResults.length;

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

  const handleScroll = (event: any) => {
    scrollHandlers.onScroll?.(event);

    if (searchMode !== "game" || !hasMore || isLoading || isLoadingMore) {
      return;
    }

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);

    if (distanceFromBottom < 320) {
      loadMore();
    }
  };

  return (
    <View style={styles.screenWrapper}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardFrame}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={scrollHandlers.scrollEventThrottle}
        >
          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
          <View style={styles.heroTextBlock}>
            <Text style={styles.eyebrow}>PlayThread</Text>
            <Text style={styles.title}>Browse</Text>
            <Text style={styles.subtitle}>
              Search games, studios, genres, platforms, players, or posts.
            </Text>
          </View>
          <NotificationInboxButton />
        </View>
          </View>

          <SectionCard title="Search" eyebrow="Discover">
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          onChangeText={setQuery}
          placeholder={
            searchMode === "game"
              ? "Search games"
              : searchMode === "studio"
                ? "Search studios"
                : searchMode === "genre"
                  ? "Search genres"
                  : searchMode === "player"
                    ? "Search players by username"
                    : searchMode === "post"
                      ? "Search post titles and content"
                      : "Search platforms"
          }
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          value={query}
        />

        <View style={styles.modeRow}>
          {Object.entries(SEARCH_MODES).map(([modeKey, label]) => {
            const isActive = modeKey === searchMode;

            return (
              <Pressable
                key={modeKey}
                onPress={() => setSearchMode(modeKey)}
                style={[styles.modeChip, isActive ? styles.modeChipActive : null]}
              >
                <Text style={[styles.modeChipText, isActive ? styles.modeChipTextActive : null]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {searchMode === "game" ? (
          <View style={styles.filterSection}>
            <View style={styles.filterRow}>
              {GAME_SORT_OPTIONS.map((s) => {
                const isActive = gameSort === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => setGameSort(s.key)}
                    style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                  >
                    <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.filterRow}>
              {PLATFORM_FILTERS.map((f) => {
                const isActive = activePlatformFilter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => {
                      setSearchMode("game");
                      setGameSort("popular");
                      setActivePlatformFilter(isActive ? null : f.key);
                    }}
                    style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                  >
                    <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.filterRow}>
              {RATING_FILTERS.map((f) => {
                const isActive = activeRatingFilter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => {
                      setSearchMode("game");
                      setGameSort("popular");
                      setActiveRatingFilter(isActive ? null : f.key);
                    }}
                    style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                  >
                    <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        {searchMode === "platform" ? (
          <Pressable
            onPress={() => router.push({ pathname: "/platforms", params: cleanQuery ? { q: query.trim() } : {} })}
            style={styles.platformJumpButton}
          >
            <Text style={styles.platformJumpButtonText}>Open platform pages</Text>
          </Pressable>
        ) : null}

        <View style={styles.toolbarRow}>
          <Text style={styles.followedSummary}>Following {followedCount} games</Text>
          {hasActiveFilters ? (
            <Pressable onPress={handleClearFilters}>
              <Text style={styles.clearButtonText}>Reset</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.sourceText}>
          Source: {source === "igdb" ? "Live IGDB" : "Mock fallback"}
        </Text>
        {preferences.hideMatureGames ? (
          <Text style={styles.sourceText}>NSFW games are hidden in your current settings.</Text>
        ) : null}
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
      </SectionCard>

          <View style={styles.resultsHeader}>
            <View style={styles.resultsText}>
          <Text style={styles.resultsTitle}>{titleForMode}</Text>
          <Text style={styles.resultsMeta}>
            Mode: {SEARCH_MODES[searchMode]}
            {cleanQuery ? ` | Search: ${query.trim()}` : ""}
          </Text>
        </View>
        <Text style={styles.resultsCount}>{resultCount} results</Text>
          </View>

          <View style={styles.resultsList}>
        {isLoading || (searchMode === "player" && playersLoading) || (searchMode === "post" && postsSearchLoading) ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.emptyText}>Loading results...</Text>
          </View>
        ) : searchMode === "post" && postResults.length > 0 ? (
          <View style={styles.postResultsList}>
            {postResults.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onPress={() => router.push(`/post/${post.id}`)}
                onAuthorPress={() => router.push(`/user/${post.userId}`)}
                onGamePress={() => router.push(`/game/${post.gameId}`)}
                onOpenComments={() =>
                  router.push({ pathname: "/post/[id]", params: { id: post.id, scrollTo: "comments" } })
                }
              />
            ))}
          </View>
        ) : searchMode === "post" ? (
          <SectionCard title="No posts found" eyebrow="Try again">
            <Text style={styles.emptyText}>
              {cleanQuery.length < 2 ? "Type at least 2 letters to search posts." : "No posts matched that search."}
            </Text>
          </SectionCard>
        ) : searchMode === "player" && playerResults.length > 0 ? (
          playerResults.map((player) => (
            <Pressable
              key={player.id}
              onPress={() => router.push(`/user/${player.id}`)}
              style={({ pressed }) => [styles.facetCard, pressed ? styles.pressedCard : null]}
            >
              <Text style={[styles.facetTitle, { color: getProfileNameColor(player.selectedNameColor) }]}>
                @{player.username}
              </Text>
              {player.displayName !== player.username ? (
                <Text style={styles.facetMeta}>{player.displayName}</Text>
              ) : null}
              {player.bio ? (
                <Text style={styles.facetHint} numberOfLines={2}>{player.bio}</Text>
              ) : null}
            </Pressable>
          ))
        ) : searchMode === "player" ? (
          <SectionCard title="No players found" eyebrow="Try again">
            <Text style={styles.emptyText}>
              {cleanQuery.length < 2 ? "Type at least 2 letters to search players." : "No players matched that username."}
            </Text>
          </SectionCard>
        ) : searchMode === "game" && displayedGames.length > 0 ? (
          <>
            {displayedGames.map((game) => (
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
            ))}
            {isLoadingMore ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={theme.colors.accent} />
                <Text style={styles.emptyText}>Loading more games...</Text>
              </View>
            ) : null}
            {hasMore && !isLoadingMore ? (
              <Pressable onPress={loadMore} style={styles.loadMoreButton}>
                <Text style={styles.loadMoreButtonText}>Load more games</Text>
              </Pressable>
            ) : null}
          </>
        ) : searchMode !== "game" && facetResults.length > 0 ? (
          facetResults.map((result) => (
            <Pressable
              key={`${searchMode}:${result.key}`}
              onPress={() => {
                if (searchMode === "platform") {
                  router.push(result.route ?? getFacetRoute(searchMode, result.label));
                  return;
                }

                router.push(getFacetRoute(searchMode, result.label));
              }}
              style={({ pressed }) => [
                styles.facetCard,
                pressed ? styles.pressedCard : null,
              ]}
            >
              <Text style={styles.facetTitle}>{result.label}</Text>
              <Text style={styles.facetMeta}>
                {searchMode === "platform"
                  ? "Platform community"
                  : `${result.count} ${result.count === 1 ? "game" : "games"}`}
              </Text>
              <Text style={styles.facetHint}>
                {searchMode === "platform"
                  ? `Open platform page. ${result.hint}`
                  : searchMode === "studio"
                  ? "Open studio catalog"
                  : searchMode === "genre"
                    ? "Open genre catalog"
                    : "Switch to game search for this platform"}
              </Text>
            </Pressable>
          ))
        ) : (
          <SectionCard title="No results" eyebrow="Try again">
            <Text style={styles.emptyText}>
              {searchMode === "game"
                ? "Try a different game title."
                : searchMode === "studio"
                  ? "Try a different studio name."
                  : searchMode === "genre"
                    ? "Try a different genre."
                    : searchMode === "player"
                      ? "Try a different username."
                      : "Try a different platform."}
            </Text>
          </SectionCard>
        )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardFrame: {
    flex: 1,
  },
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
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  filterSection: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  filterChip: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  filterChipActive: {
    backgroundColor: "rgba(0,229,255,0.12)",
    borderColor: theme.colors.accent,
  },
  filterChipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  filterChipTextActive: {
    color: theme.colors.accent,
    fontWeight: theme.fontWeights.bold,
  },
  modeChip: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  modeChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  modeChipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  modeChipTextActive: {
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
  platformJumpButton: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,229,255,0.12)",
    borderColor: "rgba(0,229,255,0.32)",
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  platformJumpButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
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
  postResultsList: {
    gap: theme.spacing.md,
  },
  facetCard: {
    gap: theme.spacing.md,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  pressedCard: {
    opacity: 0.92,
  },
  facetTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  facetMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  facetHint: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  loadingState: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xl,
  },
  loadMoreButton: {
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.md,
  },
  loadMoreButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
});



