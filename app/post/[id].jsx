import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import PostCard from "../../components/PostCard";
import PostCommentsThread from "../../components/PostCommentsThread";
import SectionCard from "../../components/SectionCard";
import { useEditablePost } from "../../lib/posts";
import { theme } from "../../lib/theme";

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { post, isLoading, error } = useEditablePost(typeof id === "string" ? id : null, true);

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!post) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <SectionCard title="Post not found" eyebrow="Thread">
          <Text style={styles.bodyText}>
            {error ? "This post could not be loaded right now." : "That post no longer exists."}
          </Text>
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </Pressable>
        </SectionCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Post thread</Text>
        <Text style={styles.subtitle}>A shareable thread view with the full conversation attached.</Text>
      </View>

      <PostCard
        post={post}
        onAuthorPress={() => router.push(`/user/${post.userId}`)}
        onPress={() => router.push(`/game/${post.gameId}`)}
      />

      <SectionCard title="Conversation" eyebrow="Replies">
        <PostCommentsThread
          isEmbedded
          onAuthorPress={(userId) => router.push(`/user/${userId}`)}
          post={post}
        />
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
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
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
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
});
