import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import CoinGiftSheet from "./CoinGiftSheet";
import { sendCoinGift } from "../lib/admin";
import { useAuth } from "../lib/auth";
import { describeIntegrityError } from "../lib/integrity";
import { formatModerationWarning } from "../lib/moderation";
import { getProfileNameColor } from "../lib/profileAppearance";
import { getProfileTitleOption } from "../lib/titles";
import {
  createPostComment,
  deletePostComment,
  toggleCommentReaction,
  usePostComments,
} from "../lib/posts";
import { theme } from "../lib/theme";

export default function PostCommentsSheet({
  post,
  visible,
  onClose,
  onCommentCountChange,
}) {
  const { session } = useAuth();
  const { comments, isLoading, error, reload } = usePostComments(post?.id, visible);
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [reactingCommentId, setReactingCommentId] = useState(null);
  const [giftingComment, setGiftingComment] = useState(null);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const commentCount = post?.comments ?? comments.length;

  useEffect(() => {
    if (!visible) {
      setDraft("");
    }
  }, [visible]);

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
      const { error: commentError, moderation } = await createPostComment({
        userId: session.user.id,
        postId: post.id,
        body: cleanBody,
      });

      if (commentError) {
        throw commentError;
      }

      setDraft("");
      await reload();
      await onCommentCountChange?.();

      if (moderation?.moderationState === "warning") {
        Alert.alert(
          "Comment posted with a warning",
          "This comment was flagged for review and added to the admin moderation log."
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

  const handleToggleLike = async (commentId) => {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to sign in before liking comments.");
      return;
    }

    try {
      setReactingCommentId(commentId);
      await toggleCommentReaction({
        userId: session.user.id,
        commentId,
      });
      await reload();
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

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Comments</Text>
              <Text style={styles.title}>{post?.title ?? "Post comments"}</Text>
              <Text style={styles.subtitle}>
                {commentCount} {commentCount === 1 ? "comment" : "comments"}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.commentsList}>
            {isLoading ? (
              <View style={styles.stateBlock}>
                <ActivityIndicator color={theme.colors.accent} />
                <Text style={styles.helperText}>Loading comments...</Text>
              </View>
            ) : comments.length > 0 ? (
              comments.map((comment) => {
                const authorTitle = getProfileTitleOption(comment.authorTitleKey);
                const authorNameColor = getProfileNameColor(comment.authorNameColor);

                return (
                <View key={comment.id} style={styles.commentCard}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentMeta}>
                      <Text style={[styles.commentAuthorText, { color: authorNameColor }]}>@{comment.author}</Text>
                      <Text> | {comment.age}</Text>
                    </Text>
                    {comment.isMine ? (
                      <Pressable
                        disabled={deletingCommentId === comment.id}
                        onPress={() => handleDelete(comment.id)}
                        style={styles.deleteButton}
                      >
                        <Text style={styles.deleteButtonText}>
                          {deletingCommentId === comment.id ? "Deleting..." : "Delete"}
                        </Text>
                      </Pressable>
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
                  <Text style={styles.commentBody}>{comment.body}</Text>
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
                      <Pressable
                        onPress={() => setGiftingComment(comment)}
                        style={styles.actionChip}
                      >
                        <Text style={styles.actionChipText}>Gift coins</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              )})
            ) : (
              <View style={styles.stateBlock}>
                <Text style={styles.helperText}>
                  No comments yet. Start the conversation for this post.
                </Text>
              </View>
            )}

            {error ? (
              <Text style={styles.warningText}>
                Comments could not load right now.
              </Text>
            ) : null}
          </ScrollView>

          <View style={styles.composer}>
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
            <View style={styles.composerFooter}>
              <Text style={styles.counterText}>{draft.trim().length}/600</Text>
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
                  {isSubmitting ? "Posting..." : "Post comment"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      <CoinGiftSheet
        visible={Boolean(giftingComment)}
        targetLabel={`@${giftingComment?.author ?? "player"}`}
        onClose={() => setGiftingComment(null)}
        onSubmit={handleSendGift}
        isSubmitting={isSendingGift}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: theme.spacing.md,
  },
  modalCard: {
    maxHeight: "88%",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.width,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  headerText: {
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
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
  closeButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  closeButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  commentsList: {
    gap: theme.spacing.sm,
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
  deleteButtonText: {
    color: "#ff8a8a",
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  composer: {
    gap: theme.spacing.sm,
    borderTopColor: theme.colors.border,
    borderTopWidth: theme.borders.width,
    paddingTop: theme.spacing.md,
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
});
