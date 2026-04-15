import { useEffect, useMemo, useState } from "react";
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
import { Image } from "expo-image";

import CoinGiftSheet from "./CoinGiftSheet";
import { sendCoinGift } from "../lib/admin";
import { useAuth } from "../lib/auth";
import { pickPostImage } from "../lib/postMedia";
import { describeIntegrityError } from "../lib/integrity";
import { formatModerationWarning } from "../lib/moderation";
import { getProfileNameColor } from "../lib/profileAppearance";
import { getProfileTitleOption } from "../lib/titles";
import {
  createPostComment,
  deletePostComment,
  toggleCommentReaction,
  updatePostComment,
  usePostComments,
} from "../lib/posts";
import { theme } from "../lib/theme";

export default function PostCommentsThread({
  post,
  isEmbedded = false,
  onCommentCountChange,
  onAuthorPress,
}) {
  const { session } = useAuth();
  const { comments, isLoading, error, reload } = usePostComments(post?.id, Boolean(post?.id));
  const [draft, setDraft] = useState("");
  const [draftImage, setDraftImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [reactingCommentId, setReactingCommentId] = useState(null);
  const [giftingComment, setGiftingComment] = useState(null);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const [displayComments, setDisplayComments] = useState([]);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const commentCount = post?.comments ?? comments.length;

  useEffect(() => {
    setDisplayComments(comments);
  }, [comments]);

  const visibleComments = useMemo(() => displayComments, [displayComments]);

  useEffect(() => {
    if (!post?.id) {
      setDraft("");
      setEditingCommentId(null);
    }
  }, [post?.id]);

  const handleSubmit = async () => {
    const cleanBody = draft.trim();

    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to sign in before commenting.");
      return;
    }

    if (!post?.id) {
      return;
    }

    if (!cleanBody) {
      Alert.alert("Write a comment", "Add a quick thought before posting.");
      return;
    }

    try {
      setIsSubmitting(true);
      const { error: commentError, moderation } = editingCommentId
        ? await updatePostComment({
            commentId: editingCommentId,
            body: cleanBody,
          })
        : await createPostComment({
            userId: session.user.id,
            postId: post.id,
            body: cleanBody,
            imageAsset: draftImage,
          });

      if (commentError) {
        throw commentError;
      }

      setDraft("");
      setDraftImage(null);
      setEditingCommentId(null);
      await reload();
      await onCommentCountChange?.();

      if (moderation?.moderationState === "warning") {
        Alert.alert(
          "Comment posted with a warning",
          "This comment was flagged for review and added to the admin moderation log.",
        );
      }
    } catch (nextError) {
      const errorCopy = describeIntegrityError(nextError);
      Alert.alert(errorCopy.title, errorCopy.detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    if (!session?.user?.id) {
      return;
    }

    try {
      setDeletingCommentId(commentId);
      await deletePostComment({
        commentId,
        userId: session.user.id,
      });
      await reload();
      await onCommentCountChange?.();
    } catch (nextError) {
      const errorCopy = describeIntegrityError(nextError);
      Alert.alert(errorCopy.title, errorCopy.detail);
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleStartEdit = (comment) => {
    setEditingCommentId(comment.id);
    setDraft(comment.body ?? "");
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setDraft("");
    setDraftImage(null);
  };

  const handlePickImage = async () => {
    try {
      const asset = await pickPostImage();
      if (asset) setDraftImage(asset);
    } catch (err) {
      Alert.alert("Image error", err instanceof Error ? err.message : "Could not pick image.");
    }
  };

  const handleToggleLike = async (commentId) => {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to sign in before liking comments.");
      return;
    }

    try {
      setReactingCommentId(commentId);
      const result = await toggleCommentReaction({
        userId: session.user.id,
        commentId,
      });
      setDisplayComments((currentComments) =>
        currentComments.map((comment) => {
          if (comment.id !== commentId) {
            return comment;
          }

          const nextViewerReaction = result?.viewerReaction ?? null;
          const currentLikeCount = comment.reactionCounts?.like ?? 0;
          const nextLikeCount =
            result?.reactionCounts?.like ??
            (nextViewerReaction === "like"
              ? currentLikeCount + (comment.viewerReaction === "like" ? 0 : 1)
              : Math.max(0, currentLikeCount - (comment.viewerReaction === "like" ? 1 : 0)));

          return {
            ...comment,
            viewerReaction: nextViewerReaction,
            reactionCounts: {
              ...comment.reactionCounts,
              like: nextLikeCount,
            },
          };
        }),
      );
    } catch (nextError) {
      const errorCopy = describeIntegrityError(nextError);
      Alert.alert(errorCopy.title, errorCopy.detail);
    } finally {
      setReactingCommentId(null);
    }
  };

  const handleSendGift = async ({ amount, note, isAnonymous }) => {
    if (!session?.user?.id || !giftingComment?.userId) {
      return;
    }

    try {
      setIsSendingGift(true);
      await sendCoinGift({
        fromUserId: session.user.id,
        toUserId: giftingComment.userId,
        amount,
        note,
        isAnonymous,
      });
      setGiftingComment(null);
      Alert.alert("Gift sent", `Sent ${amount} coins to @${giftingComment.author}.`);
    } catch (nextError) {
      const errorCopy = describeIntegrityError(nextError);
      Alert.alert(errorCopy.title, errorCopy.detail);
    } finally {
      setIsSendingGift(false);
    }
  };

  const Container = isEmbedded ? View : ScrollView;
  const containerProps = isEmbedded ? {} : { contentContainerStyle: styles.commentsList };

  return (
    <>
      <Container {...containerProps} style={isEmbedded ? undefined : null}>
        <View style={styles.threadHeader}>
          <Text style={styles.eyebrow}>Comments</Text>
          <Text style={styles.subtitle}>
            {commentCount} {commentCount === 1 ? "comment" : "comments"}
          </Text>
        </View>
        <View style={styles.commentsList}>
          {isLoading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={styles.helperText}>Loading comments...</Text>
            </View>
          ) : visibleComments.length > 0 ? (
            visibleComments.map((comment) => {
              const authorTitle = getProfileTitleOption(comment.authorTitleKey);
              const authorNameColor = getProfileNameColor(comment.authorNameColor);

              return (
                <View key={comment.id} style={styles.commentCard}>
                  <View style={styles.commentHeader}>
                    <Pressable disabled={!onAuthorPress} onPress={() => onAuthorPress?.(comment.userId)}>
                      <Text style={styles.commentMeta}>
                        <Text style={[styles.commentAuthorText, { color: authorNameColor }]}>
                          @{comment.author}
                        </Text>
                        <Text> | {comment.age}</Text>
                      </Text>
                    </Pressable>
                    {comment.isMine ? (
                      <View style={styles.ownerCommentActions}>
                        <Pressable
                          disabled={isSubmitting}
                          onPress={() => handleStartEdit(comment)}
                          style={styles.editButton}
                        >
                          <Text style={styles.editButtonText}>Edit</Text>
                        </Pressable>
                        <Pressable
                          disabled={deletingCommentId === comment.id}
                          onPress={() => handleDelete(comment.id)}
                          style={styles.deleteButton}
                        >
                          <Text style={styles.deleteButtonText}>
                            {deletingCommentId === comment.id ? "Deleting..." : "Delete"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  {authorTitle.key !== "none" ? (
                    <View style={[styles.titleBadge, authorTitle.style === "gold" ? styles.titleBadgeGold : null]}>
                      <Text style={[styles.titleBadgeText, authorTitle.style === "gold" ? styles.titleBadgeTextGold : null]}>
                        {authorTitle.label}
                      </Text>
                    </View>
                  ) : null}
                  {comment.moderationState === "warning" ? (
                    <View style={styles.warningBanner}>
                      <Text style={styles.warningBannerTitle}>Content warning</Text>
                      <Text style={styles.warningBannerText}>
                        {formatModerationWarning(comment.moderationLabels)}
                      </Text>
                    </View>
                  ) : null}
                  {comment.body ? <Text style={styles.commentBody}>{comment.body}</Text> : null}
                  {comment.imageUrl ? (
                    <Image source={{ uri: comment.imageUrl }} style={styles.commentImage} contentFit="cover" />
                  ) : null}
                  {comment.isEdited ? (
                    <Text style={styles.commentEditedText}>
                      Last edited {new Date(comment.updatedAt).toLocaleString()}
                    </Text>
                  ) : null}
                  <View style={styles.commentActions}>
                    <Pressable
                      disabled={reactingCommentId === comment.id}
                      onPress={() => handleToggleLike(comment.id)}
                      style={[
                        styles.actionChip,
                        comment.viewerReaction === "like" ? styles.actionChipActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionChipText,
                          comment.viewerReaction === "like" ? styles.actionChipTextActive : null,
                        ]}
                      >
                        Like {comment.reactionCounts?.like ?? 0}
                      </Text>
                    </Pressable>
                    {!comment.isMine ? (
                      <Pressable onPress={() => setGiftingComment(comment)} style={styles.actionChip}>
                        <Text style={styles.actionChipText}>Gift coins</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.stateBlock}>
              <Text style={styles.helperText}>No comments yet. Start the conversation for this post.</Text>
            </View>
          )}

          {error ? <Text style={styles.warningText}>Comments could not load right now.</Text> : null}
        </View>
      </Container>

      <View style={styles.composer}>
        {editingCommentId ? (
          <View style={styles.editingBanner}>
            <Text style={styles.editingBannerText}>Editing comment</Text>
            <Pressable onPress={handleCancelEdit} style={styles.editingCancelButton}>
              <Text style={styles.editingCancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
        <TextInput
          editable={!isSubmitting}
          multiline
          maxLength={600}
          onChangeText={setDraft}
          placeholder="Add a comment"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={draft}
        />
        {draftImage ? (
          <View style={styles.draftImageContainer}>
            <Image source={{ uri: draftImage.uri }} style={styles.draftImagePreview} contentFit="cover" />
            <Pressable onPress={() => setDraftImage(null)} style={styles.draftImageRemove}>
              <Text style={styles.draftImageRemoveText}>✕</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.composerFooter}>
          <Text style={styles.counterText}>{draft.trim().length}/600</Text>
          {!editingCommentId ? (
            <Pressable
              disabled={isSubmitting}
              onPress={handlePickImage}
              style={styles.imagePickerButton}
            >
              <Text style={styles.imagePickerButtonText}>📎</Text>
            </Pressable>
          ) : null}
          <Pressable
            disabled={isSubmitting}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.submitButton,
              isSubmitting ? styles.submitButtonDisabled : null,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting
                ? editingCommentId
                  ? "Saving..."
                  : "Posting..."
                : editingCommentId
                  ? "Save edit"
                  : "Post comment"}
            </Text>
          </Pressable>
        </View>
      </View>

      <CoinGiftSheet
        visible={Boolean(giftingComment)}
        targetLabel={`@${giftingComment?.author ?? "player"}`}
        onClose={() => setGiftingComment(null)}
        onSubmit={handleSendGift}
        isSubmitting={isSendingGift}
      />
    </>
  );
}

const styles = StyleSheet.create({
  threadHeader: {
    gap: theme.spacing.xs,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
  commentsList: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  stateBlock: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xl,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  warningText: {
    color: "#f5a623",
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  commentCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  commentMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  commentAuthorText: {
    fontWeight: theme.fontWeights.bold,
  },
  titleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  titleBadgeGold: {
    backgroundColor: "rgba(255,204,51,0.14)",
    borderColor: "rgba(255,204,51,0.45)",
  },
  titleBadgeText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
  },
  titleBadgeTextGold: {
    color: "#ffcc33",
  },
  commentBody: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  commentActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  actionChip: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  actionChipActive: {
    backgroundColor: "rgba(0,229,255,0.12)",
    borderColor: theme.colors.accent,
  },
  actionChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  actionChipTextActive: {
    color: theme.colors.accent,
    fontWeight: theme.fontWeights.bold,
  },
  warningBanner: {
    gap: theme.spacing.xs,
    backgroundColor: "rgba(245,166,35,0.12)",
    borderColor: "rgba(245,166,35,0.45)",
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.sm,
  },
  warningBannerTitle: {
    color: "#f5a623",
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  warningBannerText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 18,
  },
  deleteButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  ownerCommentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  editButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  editButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  deleteButtonText: {
    color: "#ff8a8a",
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  commentEditedText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
  },
  composer: {
    gap: theme.spacing.sm,
    borderTopColor: theme.colors.border,
    borderTopWidth: theme.borders.width,
    paddingTop: theme.spacing.md,
  },
  editingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    backgroundColor: "rgba(0,229,255,0.08)",
    borderColor: "rgba(0,229,255,0.24)",
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  editingBannerText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  editingCancelButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  editingCancelButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  input: {
    minHeight: 96,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    textAlignVertical: "top",
  },
  composerFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  counterText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  buttonPressed: {
    opacity: 0.92,
  },
  commentImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  draftImageContainer: {
    position: "relative",
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  draftImagePreview: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  draftImageRemove: {
    position: "absolute",
    top: theme.spacing.xs,
    right: theme.spacing.xs,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: theme.radius.pill,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  draftImageRemoveText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: theme.fontWeights.bold,
  },
  imagePickerButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: theme.colors.border,
    borderWidth: theme.borders.width,
  },
  imagePickerButtonText: {
    fontSize: 16,
  },
});
