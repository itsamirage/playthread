import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import BottomNavBar from "../../components/BottomNavBar";
import PostCard from "../../components/PostCard";
import PostCommentsThread from "../../components/PostCommentsThread";
import SectionCard from "../../components/SectionCard";
import { useAuth } from "../../lib/auth";
import { describeIntegrityError } from "../../lib/integrity";
import { goBackOrFallback } from "../../lib/navigation";
import { deletePost, togglePostReaction, useEditablePost } from "../../lib/posts";
import { theme } from "../../lib/theme";

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const { post, isLoading, error, reload } = useEditablePost(typeof id === "string" ? id : null, true);
  const [reactingPostId, setReactingPostId] = useState(null);
  const [optimisticReaction, setOptimisticReaction] = useState(null);

  const displayPost = optimisticReaction && post ? { ...post, ...optimisticReaction } : post;

  const handleReact = async (reactionType) => {
    if (!session?.user?.id || !post) return;

    const prevReaction = optimisticReaction?.viewerReaction ?? post.viewerReaction ?? null;
    const prevCounts = { ...(optimisticReaction?.reactionCounts ?? post.reactionCounts ?? {}) };
    const toggling = prevReaction === reactionType;
    const newReaction = toggling ? null : reactionType;
    const newCounts = { ...prevCounts };
    if (toggling) {
      newCounts[reactionType] = Math.max(0, (newCounts[reactionType] ?? 0) - 1);
    } else {
      if (prevReaction) newCounts[prevReaction] = Math.max(0, (newCounts[prevReaction] ?? 0) - 1);
      newCounts[reactionType] = (newCounts[reactionType] ?? 0) + 1;
    }
    setOptimisticReaction({ viewerReaction: newReaction, reactionCounts: newCounts });

    try {
      setReactingPostId(post.id);
      await togglePostReaction({ userId: session.user.id, postId: post.id, reactionType });
      await reload();
      setOptimisticReaction(null);
    } catch (nextError) {
      setOptimisticReaction(null);
      const errorCopy = describeIntegrityError(nextError);
      Alert.alert(errorCopy.title, errorCopy.detail);
    } finally {
      setReactingPostId(null);
    }
  };

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
          <Pressable onPress={() => goBackOrFallback(router, "/(tabs)")} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </Pressable>
        </SectionCard>
      </ScrollView>
    );
  }

  return (
    <View style={styles.screenWrapper}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Post thread</Text>
        <Text style={styles.subtitle}>A shareable thread view with the full conversation attached.</Text>
        <View style={styles.heroActions}>
          <Pressable onPress={() => goBackOrFallback(router, `/game/${post.gameId}`)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/game/${post.gameId}`)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Game</Text>
          </Pressable>
        </View>
      </View>

      <PostCard
        post={displayPost}
        isReacting={reactingPostId === post.id}
        onAuthorPress={() => router.push(`/user/${post.userId}`)}
        onGamePress={() => router.push(`/game/${post.gameId}`)}
        onReact={handleReact}
        onDelete={
          session?.user?.id === post.userId
            ? async () => {
                Alert.alert("Delete post", "This will permanently remove the post.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      await deletePost({ postId: post.id });
                      router.replace(`/game/${post.gameId}`);
                    },
                  },
                ]);
              }
            : null
        }
        onEdit={
          session?.user?.id === post.userId
            ? () => router.push({ pathname: "/create-post", params: { gameId: String(post.gameId), postId: post.id } })
            : null
        }
      />

      <SectionCard title="Conversation" eyebrow="Replies">
        <PostCommentsThread
          isEmbedded
          onAuthorPress={(userId) => router.push(`/user/${userId}`)}
          post={post}
        />
      </SectionCard>
    </ScrollView>
    <BottomNavBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.layout.screenPadding,
    gap: theme.spacing.lg,
    paddingBottom: 80,
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
  heroActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
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
