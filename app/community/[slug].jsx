import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BottomNavBar from "../../components/BottomNavBar";
import CoinGiftSheet from "../../components/CoinGiftSheet";
import NotificationInboxButton from "../../components/NotificationInboxButton";
import PostCard from "../../components/PostCard";
import PostCommentsSheet from "../../components/PostCommentsSheet";
import SectionCard from "../../components/SectionCard";
import { sendCoinGift } from "../../lib/admin";
import { isStaffRole, useMyAdminProfile } from "../../lib/admin";
import { useAuth } from "../../lib/auth";
import { getCommunityBySlug } from "../../lib/communityHubs";
import {
  hideCustomCommunity,
  setCustomCommunityBan,
  updateCustomCommunity,
  useCommunityBans,
  useCustomCommunityBySlug,
} from "../../lib/customCommunities";
import { useFollows } from "../../lib/follows";
import { describeIntegrityError } from "../../lib/integrity";
import { goBackOrFallback } from "../../lib/navigation";
import { deletePost, togglePostReaction, useGamePosts } from "../../lib/posts";
import { theme } from "../../lib/theme";

export default function CommunityScreen() {
  const { slug } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const staticCommunity = getCommunityBySlug(String(slug ?? ""));
  const { community: customCommunity, isLoading: customCommunityLoading, reload: reloadCustomCommunity } =
    useCustomCommunityBySlug(staticCommunity ? null : String(slug ?? ""));
  const community = staticCommunity ?? customCommunity;
  const { profile: currentProfile } = useMyAdminProfile();
  const { bannedUserIds, reload: reloadBans } = useCommunityBans(community);
  const scrollRef = useRef(null);
  const { isFollowingGame, getFollowStatus, setFollowStatus, unfollowGame } = useFollows();
  const {
    posts,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    reload,
    loadMore,
  } = useGamePosts(community?.id);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [giftPost, setGiftPost] = useState(null);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const [reactingPostId, setReactingPostId] = useState(null);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [isEditingCommunity, setIsEditingCommunity] = useState(false);
  const [communityTitle, setCommunityTitle] = useState("");
  const [communitySubtitle, setCommunitySubtitle] = useState("");
  const [communityBody, setCommunityBody] = useState("");
  const [moderatingUserId, setModeratingUserId] = useState(null);

  if (customCommunityLoading && !community) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!community) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Community not found</Text>
      </ScrollView>
    );
  }

  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? null;
  const isFollowed = isFollowingGame(community.id);
  const followStatus = getFollowStatus(community.id);
  const canModerateCommunity =
    Boolean(community.isCustom) &&
    (community.creatorUserId === session?.user?.id || isStaffRole(currentProfile?.accountRole));

  const openEditCommunity = () => {
    setCommunityTitle(community.title);
    setCommunitySubtitle(community.subtitle);
    setCommunityBody(community.body);
    setIsEditingCommunity(true);
  };

  const handleSelectStatus = async (status) => {
    const { error: followError } = await setFollowStatus(
      { id: community.id, title: community.title, coverUrl: null },
      status,
    );

    if (followError) {
      Alert.alert("Follow update failed", followError.message);
    }
  };

  const handleUnfollow = async () => {
    const { error: followError } = await unfollowGame(community.id);

    if (followError) {
      Alert.alert("Follow update failed", followError.message);
    }
  };

  const handleReact = async (post, reactionType) => {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to sign in before reacting to posts.");
      return;
    }

    try {
      setReactingPostId(post.id);
      await togglePostReaction({ userId: session.user.id, postId: post.id, reactionType });
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
    } catch (nextError) {
      const errorCopy = describeIntegrityError(nextError);
      Alert.alert(errorCopy.title, errorCopy.detail);
    } finally {
      setIsSendingGift(false);
    }
  };

  const handleDeletePost = (post) => {
    Alert.alert("Delete post", "This will remove the post from this community.", [
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

  const handleSaveCommunity = async () => {
    try {
      await updateCustomCommunity({
        communityId: community.id,
        title: communityTitle,
        subtitle: communitySubtitle,
        body: communityBody,
      });
      setIsEditingCommunity(false);
      await reloadCustomCommunity();
    } catch (nextError) {
      Alert.alert("Community update failed", nextError instanceof Error ? nextError.message : "Could not update this community.");
    }
  };

  const handleHideCommunity = () => {
    Alert.alert("Remove community", "This hides the community and stops it from appearing in community search.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await hideCustomCommunity({ communityId: community.id });
            router.replace("/platforms");
          } catch (nextError) {
            Alert.alert("Community removal failed", nextError instanceof Error ? nextError.message : "Could not remove this community.");
          }
        },
      },
    ]);
  };

  const handleBanUser = (post) => {
    Alert.alert("Ban from community", `Ban @${post.author} from posting or commenting here?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Ban",
        style: "destructive",
        onPress: async () => {
          try {
            setModeratingUserId(post.userId);
            await setCustomCommunityBan({
              communityId: community.id,
              targetUserId: post.userId,
              reason: `Banned from ${community.title}`,
            });
            await reloadBans();
          } catch (nextError) {
            Alert.alert("Ban failed", nextError instanceof Error ? nextError.message : "Could not ban that user.");
          } finally {
            setModeratingUserId(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={styles.content}
        onScroll={(event) => {
          if (!hasMore || isLoading || isLoadingMore) {
            return;
          }

          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);

          if (distanceFromBottom < 320) {
            loadMore();
          }
        }}
        scrollEventThrottle={16}
      >
        <View style={[styles.topBar, { paddingTop: insets.top + theme.spacing.md }]}>
          <Pressable onPress={() => goBackOrFallback(router, "/(tabs)")} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <NotificationInboxButton />
        </View>

        <SectionCard title={community.title} eyebrow={community.eyebrow}>
          {isEditingCommunity ? (
            <View style={styles.form}>
              <TextInput
                value={communityTitle}
                onChangeText={setCommunityTitle}
                placeholder="Community name"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
              />
              <TextInput
                value={communitySubtitle}
                onChangeText={setCommunitySubtitle}
                placeholder="Short description"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
              />
              <TextInput
                value={communityBody}
                onChangeText={setCommunityBody}
                multiline
                placeholder="Community details"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, styles.textArea]}
              />
              <View style={styles.actionRow}>
                <Pressable onPress={() => setIsEditingCommunity(false)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSaveCommunity} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Save</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Text style={styles.bodyText}>{community.body}</Text>
          )}
          {community.isCustom ? (
            <Text style={styles.helperText}>Created by @{community.creatorName}</Text>
          ) : null}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/create-post",
                  params: {
                    gameId: String(community.id),
                    gameTitle: community.title,
                    lockContext: "true",
                    allowedTypes: community.allowedPostTypes.join(","),
                  },
                })
              }
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Start thread</Text>
            </Pressable>
            <Pressable
              onPress={() => handleSelectStatus(isFollowed ? followStatus ?? "currently_playing" : "currently_playing")}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>{isFollowed ? "Following" : "Follow"}</Text>
            </Pressable>
          </View>
          {isFollowed ? (
            <Pressable onPress={handleUnfollow} style={styles.inlineButton}>
              <Text style={styles.inlineButtonText}>Unfollow community</Text>
            </Pressable>
          ) : null}
          {canModerateCommunity && !isEditingCommunity ? (
            <View style={styles.moderatorRow}>
              <Pressable onPress={openEditCommunity} style={styles.moderatorButton}>
                <Text style={styles.moderatorButtonText}>Edit community</Text>
              </Pressable>
              <Pressable onPress={handleHideCommunity} style={[styles.moderatorButton, styles.dangerButton]}>
                <Text style={styles.moderatorButtonText}>Remove community</Text>
              </Pressable>
            </View>
          ) : null}
        </SectionCard>

        <SectionCard title="Threads" eyebrow="Community">
          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={styles.helperText}>Loading community posts...</Text>
            </View>
          ) : posts.length > 0 ? (
            <View style={styles.threadList}>
              {posts.map((post) => (
                <View key={post.id} style={styles.moderatedPost}>
                  <PostCard
                    isDeleting={deletingPostId === post.id}
                    isReacting={reactingPostId === post.id}
                    onAuthorPress={() => router.push(`/user/${post.userId}`)}
                    onDelete={session?.user?.id === post.userId || canModerateCommunity ? () => handleDeletePost(post) : null}
                    onEdit={
                      session?.user?.id === post.userId
                        ? () =>
                            router.push({
                              pathname: "/create-post",
                              params: {
                                gameId: String(community.id),
                                gameTitle: community.title,
                                postId: post.id,
                                lockContext: "true",
                                allowedTypes: community.allowedPostTypes.join(","),
                              },
                            })
                        : null
                    }
                    onGift={session?.user?.id && session.user.id !== post.userId ? () => setGiftPost(post) : null}
                    onOpenComments={() => setSelectedPostId(post.id)}
                    onGamePress={null}
                    onReact={(reactionType) => handleReact(post, reactionType)}
                    onPress={() => router.push(`/post/${post.id}`)}
                    post={post}
                  />
                  {canModerateCommunity && post.userId !== session?.user?.id ? (
                    <View style={styles.moderatorRow}>
                      <Pressable
                        onPress={() => handleBanUser(post)}
                        disabled={bannedUserIds.has(post.userId) || moderatingUserId === post.userId}
                        style={[styles.moderatorButton, styles.dangerButton]}
                      >
                        <Text style={styles.moderatorButtonText}>
                          {bannedUserIds.has(post.userId)
                            ? "Banned"
                            : moderatingUserId === post.userId
                              ? "Saving..."
                              : "Ban from community"}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.helperText}>
              {error ? "This community could not load right now." : "No threads yet. Start the first one."}
            </Text>
          )}
          {hasMore ? (
            <Pressable onPress={loadMore} disabled={isLoadingMore} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{isLoadingMore ? "Loading..." : "Load more"}</Text>
            </Pressable>
          ) : null}
        </SectionCard>
      </ScrollView>

      <PostCommentsSheet
        onAuthorPress={(userId) => router.push(`/user/${userId}`)}
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  backButton: {
    backgroundColor: theme.colors.card,
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
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  form: {
    gap: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    flexWrap: "wrap",
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.md,
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  inlineButton: {
    alignSelf: "flex-start",
  },
  inlineButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  loadingState: {
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  threadList: {
    gap: theme.spacing.md,
  },
  moderatedPost: {
    gap: theme.spacing.sm,
  },
  moderatorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  moderatorButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  dangerButton: {
    borderColor: theme.colors.scoreBad,
  },
  moderatorButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
});
