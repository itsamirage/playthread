import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCallback, useMemo } from "react";
import { useFocusEffect, useRouter } from "expo-router";

import PostCard from "../../components/PostCard";
import SectionCard from "../../components/SectionCard";
import { useFollows } from "../../lib/follows";
import { buildMockFeed } from "../../lib/mockFeed";
import { useFeedPosts } from "../../lib/posts";
import { theme } from "../../lib/theme";

export default function HomeScreen() {
  const router = useRouter();
  const { followedCount, followedGameIds, followedGames, shouldShowSpoilersByDefault } =
    useFollows();
  const { posts, isLoading, error, reload } = useFeedPosts(followedGameIds);
  const fallbackPosts = useMemo(() => buildMockFeed(followedGames), [followedGames]);
  const feedPosts = posts.length > 0 ? posts : fallbackPosts;
  const newPostCount = Math.min(feedPosts.length, 4);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.subtitle}>
          Posts from the games you follow will land here first, with reviews,
          screenshots, clips, and discussion threads.
        </Text>
        <Pressable
          onPress={() => router.push("/create-post")}
          style={({ pressed }) => [
            styles.heroButton,
            pressed ? styles.primaryButtonPressed : null,
          ]}
        >
          <Text style={styles.heroButtonText}>Create post</Text>
        </Pressable>
      </View>

      <SectionCard title="Following summary" eyebrow="Your feed">
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{followedCount}</Text>
            <Text style={styles.statLabel}>Games</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{feedPosts.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{newPostCount}</Text>
            <Text style={styles.statLabel}>New</Text>
          </View>
        </View>
      </SectionCard>

      {isLoading ? (
        <SectionCard title="Loading feed" eyebrow="Your posts">
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.bodyText}>Loading posts from the games you follow...</Text>
          </View>
        </SectionCard>
      ) : feedPosts.length > 0 ? (
        <View style={styles.feedList}>
          {posts.length === 0 && followedCount > 0 ? (
            <SectionCard title="Seed content" eyebrow="Preview feed">
              <Text style={styles.bodyText}>
                No real posts exist for your followed games yet, so this feed is showing preview cards.
                Create the first real thread to replace them.
              </Text>
            </SectionCard>
          ) : null}
          {feedPosts.map((post) => (
            <PostCard
              key={post.id}
              concealSpoilers={Boolean(post.spoiler) && !shouldShowSpoilersByDefault(post.gameId)}
              post={post}
              onPress={() => router.push(`/game/${post.gameId}`)}
            />
          ))}
        </View>
      ) : (
        <SectionCard title="Start your feed" eyebrow="Discover">
          <Text style={styles.bodyText}>
            Follow a few games in Browse and PlayThread will start filling this
            feed with reviews, screenshots, clips, and discussion posts.
          </Text>
          {error ? (
            <Text style={styles.warningText}>
              The real feed could not load right now. You can still follow games and create new posts.
            </Text>
          ) : null}
          <Pressable
            onPress={() => router.push("/(tabs)/browse")}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.primaryButtonPressed : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>Browse games</Text>
          </Pressable>
        </SectionCard>
      )}
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
  heroButton: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  heroButtonText: {
    color: theme.colors.background,
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
  feedList: {
    gap: theme.spacing.md,
  },
  loadingState: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
  },
  primaryButtonPressed: {
    opacity: 0.92,
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  warningText: {
    color: "#f5a623",
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
});
