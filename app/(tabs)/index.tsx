import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";

import PostCard from "../../components/PostCard";
import PostCommentsSheet from "../../components/PostCommentsSheet";
import SectionCard from "../../components/SectionCard";
import CoinGiftSheet from "../../components/CoinGiftSheet";
import { sendCoinGift } from "../../lib/admin";
import { useAuth } from "../../lib/auth";
import { useFollows } from "../../lib/follows";
import { describeIntegrityError } from "../../lib/integrity";
import { deletePost, togglePostReaction, useFeedPosts } from "../../lib/posts";
import { theme } from "../../lib/theme";

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { followedCount, followedGameIds, followedGames, shouldShowSpoilersByDefault } =
    useFollows();
  const { posts, isLoading, error, reload } = useFeedPosts(followedGameIds);
  const [reactingPostId, setReactingPostId] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [giftPost, setGiftPost] = useState(null);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const feedPosts = posts;
  const newPostCount = Math.min(posts.length, 4);
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? null;

  const handleReact = async (postId, reactionType) => {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to sign in before reacting to posts.");
      return;
    }

    try {
      setReactingPostId(postId);
      await togglePostReaction({
        userId: session.user.id,
        postId,
        reactionType,
      });
      await reload();
    } catch (nextError) {
      const errorCopy = describeIntegrityError(nextError);
      Alert.alert(errorCopy.title, errorCopy.detail);
    } finally {
      setReactingPostId(null);
    }
  };

  const handleSendGift = async ({ amount, note, isAnonymous }) => {
    if (!session?.user?.id || !giftPost?.userId) {
      return;
    }

    try {
      setIsSendingGift(true);
      await sendCoinGift({
        fromUserId: session.user.id,
        toUserId: giftPost.userId,
        amount,
        note,
        isAnonymous,
      });
      setGiftPost(null);
      Alert.alert("Gift sent", `Sent ${amount} coins to @${giftPost.author}.`);
    } catch (nextError) {
      const errorCopy = describeIntegrityError(nextError);
      Alert.alert(errorCopy.title, errorCopy.detail);
    } finally {
      setIsSendingGift(false);
    }
  };

  const handleEditPost = (post) => {
    router.push({ pathname: "/create-post", params: { gameId: String(post.gameId), postId: post.id } });
  };

  const handleDeletePost = (post) => {
    Alert.alert("Delete clip", "This will remove the clip post from your feed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingPostId(post.id);
            await deletePost({ postId: post.id });
            await reload();
          } catch (nextError) {
            const errorCopy = describeIntegrityError(nextError);
            Alert.alert(errorCopy.title, errorCopy.detail);
          } finally {
            setDeletingPostId(null);
          }
        },
      },
    ]);
  };

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
            <Text style={styles.statValue}>{posts.length}</Text>
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
          {feedPosts.map((post) => (
            <PostCard
              key={post.id}
              concealSpoilers={Boolean(post.spoiler) && !shouldShowSpoilersByDefault(post.gameId)}
              isDeleting={deletingPostId === post.id}
              isReacting={reactingPostId === post.id}
              onAuthorPress={() => router.push(`/user/${post.userId}`)}
              onDelete={session?.user?.id === post.userId && post.type === "clip" ? () => handleDeletePost(post) : null}
              onEdit={session?.user?.id === post.userId && post.type === "clip" ? () => handleEditPost(post) : null}
              onGift={session?.user?.id && session.user.id !== post.userId ? () => setGiftPost(post) : null}
              onOpenComments={() => setSelectedPostId(post.id)}
              onReact={(reactionType) => handleReact(post.id, reactionType)}
              post={post}
              onPress={() => router.push(`/post/${post.id}`)}
            />
          ))}
        </View>
      ) : (
        <SectionCard title="Start your feed" eyebrow="Discover">
          <Text style={styles.bodyText}>
            {followedGames.length > 0
              ? "You are following games, but nobody has posted there yet. Create the first real thread instead of waiting for placeholder content."
              : "Follow a few games in Browse and PlayThread will start filling this feed with real reviews, screenshots, clips, and discussion posts."}
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

      <PostCommentsSheet
        onClose={() => setSelectedPostId(null)}
        onCommentCountChange={reload}
        post={selectedPost}
        visible={Boolean(selectedPost)}
      />
      <CoinGiftSheet
        visible={Boolean(giftPost)}
        targetLabel={`@${giftPost?.author ?? "player"}`}
        onClose={() => setGiftPost(null)}
        onSubmit={handleSendGift}
        isSubmitting={isSendingGift}
      />
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
