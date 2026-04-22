import { BlurView } from "expo-blur";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Image as ExpoImage } from "expo-image";
import { useRef, useState } from "react";
import {
  Animated,
  Alert,
  Image as NativeImage,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import ClipPlayer from "./ClipPlayer";
import { formatModerationWarning } from "../lib/moderation";
import { getProfileNameColor } from "../lib/profileAppearance";
import { reportContent } from "../lib/reports";
import { useSavedPostIds } from "../lib/savedPosts";
import { getProfileTitleOption } from "../lib/titles";
import { theme } from "../lib/theme";

const postTypeLabels = {
  review: "Review",
  discussion: "Discussion",
  screenshot: "Image",
  guide: "Guide",
  tip: "Tip",
  clip: "Clip",
};

const reactionLabelsByMode = {
  utility: {
    helpful: "Helpful",
    not_helpful: "Not Helpful",
  },
  sentiment: {
    like: "Like",
    dislike: "Dislike",
  },
  appreciation: {
    respect: "Respect",
  },
};

function PostImage({ uri, style, resizeMode = "cover", onPress }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <View style={[style, styles.postImageFallback]}>
        <Text style={styles.postImageFallbackText}>Image unavailable</Text>
        <View style={styles.postImageFallbackActions}>
          <Pressable onPress={() => setHasError(false)} style={styles.postImageFallbackButton}>
            <Text style={styles.postImageFallbackButtonText}>Retry</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(uri)} style={styles.postImageFallbackButton}>
            <Text style={styles.postImageFallbackButtonText}>Open</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      disabled={!onPress}
      onPress={(event) => {
        event.stopPropagation?.();
        onPress?.();
      }}
      style={style}
    >
      <NativeImage
        onError={() => setHasError(true)}
        resizeMode={resizeMode}
        source={{ uri }}
        style={styles.fillImage}
      />
    </Pressable>
  );
}

export default function PostCard({
  post,
  onPress,
  onGamePress,
  onAuthorPress,
  onReact,
  onOpenComments,
  onGift,
  onEdit,
  onDelete,
  onReport,
  onSave,
  isDeleting = false,
  isReacting = false,
  isSaved = false,
  concealSpoilers = false,
  spoilerRevealHint = null,
}) {
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [imageGridWidth, setImageGridWidth] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const { width: viewportWidth } = useWindowDimensions();
  const blurOpacity = useRef(new Animated.Value(1)).current;
  const isSpoilerConcealed = concealSpoilers && !spoilerRevealed;
  const { isSavedPost, toggleSavedPost } = useSavedPostIds();
  const isPostSaved = isSaved || isSavedPost(post.id);
  const handleSavePost = onSave ?? (() => toggleSavedPost(post.id));
  const handleReportPost = onReport ?? (() => {
    Alert.alert("Report post", "Send this post to moderators for review.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Abuse",
        onPress: () => reportContent({ contentType: "post", contentId: post.id, category: "abuse", reason: "User reported this post for abuse." }).catch((error) => Alert.alert("Report failed", error.message)),
      },
      {
        text: "Nudity",
        onPress: () => reportContent({ contentType: "post", contentId: post.id, category: "nudity", reason: "User reported this post for sexual content." }).catch((error) => Alert.alert("Report failed", error.message)),
      },
      {
        text: "Hate",
        onPress: () => reportContent({ contentType: "post", contentId: post.id, category: "hate", reason: "User reported this post for hateful content." }).catch((error) => Alert.alert("Report failed", error.message)),
      },
    ]);
  });

  const handleRevealSpoiler = () => {
    Animated.timing(blurOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setSpoilerRevealed(true));
  };

  const reactionLabels = reactionLabelsByMode[post.reactionMode] ?? reactionLabelsByMode.sentiment;
  const authorTitle = getProfileTitleOption(post.authorTitleKey);
  const authorNameColor = getProfileNameColor(post.authorNameColor);
  const imageUrls = Array.isArray(post.imageUrls) && post.imageUrls.length > 0
    ? post.imageUrls
    : post.imageUrl
      ? [post.imageUrl]
      : [];
  const imageCaptions = Array.isArray(post.imageCaptions) ? post.imageCaptions : [];
  const reactionTypes =
    post.reactionMode === "utility"
      ? ["helpful", "not_helpful"]
      : post.reactionMode === "appreciation"
        ? ["respect"]
        : ["like", "dislike"];

  return (
    <Pressable
      disabled={!onPress || isSpoilerConcealed}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.typePill}>
            <Text style={styles.typePillText}>{postTypeLabels[post.type] ?? "Post"}</Text>
          </View>
          {post.spoiler ? (
            <View style={styles.spoilerPill}>
              <Text style={styles.spoilerPillText}>
                {post.spoilerTag ? `Spoiler: ${post.spoilerTag}` : "Spoiler"}
              </Text>
            </View>
          ) : null}
          {post.isDeveloperPost ? (
            <View style={styles.developerPill}>
              <Text style={styles.developerPillText}>Verified developer</Text>
            </View>
          ) : null}
          {post.isPinned ? (
            <View style={styles.pinnedPill}>
              <Text style={styles.pinnedPillText}>Pinned</Text>
            </View>
          ) : null}
        </View>
        <Pressable disabled={!onAuthorPress} onPress={() => onAuthorPress?.(post.userId)}>
          <Text style={styles.metaText}>
            <Text style={[styles.authorNameText, { color: authorNameColor }]}>@{post.author}</Text>
            <Text> | {post.age}</Text>
          </Text>
        </Pressable>
      </View>
      {authorTitle.key !== "none" ? (
        <View style={[styles.titleBadge, authorTitle.style === "gold" ? styles.titleBadgeGold : null]}>
          <Text style={[styles.titleBadgeText, authorTitle.style === "gold" ? styles.titleBadgeTextGold : null]}>
            {authorTitle.label}
          </Text>
        </View>
      ) : null}

      <Pressable
        disabled={!onGamePress}
        onPress={(event) => { event.stopPropagation?.(); onGamePress?.(); }}
        style={styles.gameRow}
      >
        {post.gameCoverUrl ? (
          <ExpoImage source={{ uri: post.gameCoverUrl }} style={styles.coverImage} />
        ) : (
          <View style={styles.coverFallback}>
            <Text style={styles.coverFallbackText}>
              {post.gameTitle.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.gameText}>
          <Text style={styles.gameTitle}>{post.gameTitle}</Text>
          <Text style={styles.postTitle}>{post.title}</Text>
        </View>
      </Pressable>

      <View style={styles.mainContent}>
        <Text style={styles.bodyText}>{post.body}</Text>
        {post.isEdited ? (
          <Text style={styles.editedText}>
            Edited {new Date(post.updatedAt).toLocaleString()}
          </Text>
        ) : null}

        {imageUrls.length === 1 ? (
          <View style={styles.postImageBlock}>
            <PostImage uri={imageUrls[0]} style={styles.postImage} onPress={() => setGalleryIndex(0)} />
            {imageCaptions[0] ? <Text style={styles.imageCaption}>{imageCaptions[0]}</Text> : null}
          </View>
        ) : imageUrls.length > 1 ? (
          <View
            onLayout={(event) => setImageGridWidth(event.nativeEvent.layout.width)}
            style={styles.postImageGrid}
          >
            {imageUrls.map((imageUrl, index) => (
              <PostImage
                key={`${post.id}:image:${index}`}
                uri={imageUrl}
                onPress={() => setGalleryIndex(index)}
                style={[
                  styles.postImageGridItem,
                  imageGridWidth > 0
                    ? {
                        width: (imageGridWidth - theme.spacing.sm) / 2,
                        height: (imageGridWidth - theme.spacing.sm) / 2,
                      }
                    : null,
                ]}
              />
            ))}
          </View>
        ) : null}
        {imageUrls.length > 1 && imageCaptions.some(Boolean) ? (
          <View style={styles.imageCaptionList}>
            {imageCaptions.map((caption, index) =>
              caption ? (
                <Text key={`${post.id}:caption:${index}`} style={styles.imageCaption}>
                  {index + 1}. {caption}
                </Text>
              ) : null,
            )}
          </View>
        ) : null}

        {post.type === "clip" ? (
          <ClipPlayer
            playbackId={post.videoPlaybackId}
            status={post.videoStatus}
            thumbnailUrl={post.videoThumbnailUrl}
          />
        ) : null}
        {post.type === "clip" ? (
          <Text style={styles.clipMetaText}>
            {post.videoStatus === "ready"
              ? "Streaming-only clip. Downloads are disabled for now."
              : post.videoStatus === "errored"
                ? "This clip failed to process."
                : "Mux is still preparing this clip for streaming."}
          </Text>
        ) : null}
        {onEdit || onDelete ? (
          <View style={styles.ownerActionRow}>
            {onEdit ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  onEdit?.(post);
                }}
                style={({ pressed }) => [styles.ownerActionButton, pressed ? styles.cardPressed : null]}
              >
                <Text style={styles.ownerActionButtonText}>Edit post</Text>
              </Pressable>
            ) : null}
            {onDelete ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  onDelete?.(post);
                }}
                style={({ pressed }) => [
                  styles.ownerActionButton,
                  styles.ownerActionButtonDanger,
                  pressed ? styles.cardPressed : null,
                ]}
              >
                <Text style={styles.ownerActionButtonDangerText}>
                  {isDeleting ? "Deleting..." : "Delete post"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {post.moderationState === "warning" ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningBannerTitle}>Content warning</Text>
            <Text style={styles.warningBannerText}>
              {formatModerationWarning(post.moderationLabels)}
            </Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {post.rating ? `${post.rating}/10` : "Community post"}
          </Text>
          <View style={styles.footerActions}>
            {onGift ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  onGift?.(post);
                }}
                style={({ pressed }) => [styles.commentButton, pressed ? styles.cardPressed : null]}
              >
                <Text style={[styles.footerText, styles.commentButtonText]}>Gift coins</Text>
              </Pressable>
            ) : null}
            {handleSavePost ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  handleSavePost?.(post);
                }}
                style={({ pressed }) => [
                  styles.footerIconAction,
                  isPostSaved ? styles.footerIconActionSaved : null,
                  pressed ? styles.cardPressed : null,
                ]}
              >
                <FontAwesome
                  color={isPostSaved ? theme.colors.background : theme.colors.accent}
                  name={isPostSaved ? "bookmark" : "bookmark-o"}
                  size={13}
                />
                <Text style={[styles.footerText, styles.commentButtonText, isPostSaved ? styles.savedButtonText : null]}>
                  {isPostSaved ? "Saved" : "Save"}
                </Text>
              </Pressable>
            ) : null}
            {handleReportPost ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  handleReportPost?.(post);
                }}
                style={({ pressed }) => [styles.commentButton, pressed ? styles.cardPressed : null]}
              >
                <Text style={[styles.footerText, styles.reportButtonText]}>Report</Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={!onOpenComments}
              onPress={(event) => {
                event.stopPropagation?.();
                onOpenComments?.(post);
              }}
              style={({ pressed }) => [styles.commentButton, pressed ? styles.cardPressed : null]}
            >
              <Text style={[styles.footerText, onOpenComments ? styles.commentButtonText : null]}>
                {post.comments} comments
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.reactionRow}>
          {reactionTypes.map((reactionType) => {
            const isSelected = post.viewerReaction === reactionType;
            const isNegative = reactionType === "dislike" || reactionType === "not_helpful";
            const isAppreciation = reactionType === "respect";

            return (
              <Pressable
                key={reactionType}
                disabled={isReacting || !onReact}
                onPress={(event) => {
                  event.stopPropagation?.();
                  onReact?.(reactionType);
                }}
                style={({ pressed }) => [
                  styles.reactionButton,
                  reactionTypes.length === 1 ? styles.reactionButtonSingle : null,
                  isSelected ? (isNegative ? styles.reactionButtonNegativeSelected : styles.reactionButtonSelected) : null,
                  isSelected && isAppreciation ? styles.reactionButtonAppreciationSelected : null,
                  isReacting ? styles.reactionButtonDisabled : null,
                  pressed ? styles.cardPressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.reactionButtonText,
                    isSelected
                      ? isNegative
                        ? styles.reactionButtonNegativeSelectedText
                        : isAppreciation
                          ? styles.reactionButtonAppreciationSelectedText
                        : styles.reactionButtonSelectedText
                      : null,
                  ]}
                >
                  {(() => {
                    const count = post.reactionCounts?.[reactionType] ?? 0;
                    const base = isAppreciation ? "Respect" : reactionLabels[reactionType];
                    const label = (reactionType === "like" || reactionType === "dislike") && count !== 1 ? base + "s" : base;
                    return `${count} ${label}`;
                  })()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isSpoilerConcealed ? (
          <Pressable onPress={handleRevealSpoiler} style={styles.blurWrap}>
            <Animated.View style={[styles.blurLayer, { opacity: blurOpacity }]}>
              <BlurView intensity={80} style={styles.blurLayer} tint="dark" />
            </Animated.View>
            <View style={styles.spoilerOverlay}>
              <Text style={styles.spoilerOverlayTitle}>Spoiler concealed</Text>
              <Text style={styles.spoilerOverlayText}>
                {spoilerRevealHint ?? "Tap to reveal this spoiler post."}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </View>
      {galleryIndex !== null ? (
        <Modal
          animationType="fade"
          onRequestClose={() => setGalleryIndex(null)}
          transparent
          visible
        >
          <View style={styles.galleryBackdrop}>
            <View style={styles.galleryHeader}>
              <Text style={styles.galleryCounter}>{galleryIndex + 1} / {imageUrls.length}</Text>
              <Pressable onPress={() => setGalleryIndex(null)} style={styles.galleryHeaderButton}>
                <Text style={styles.galleryHeaderButtonText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.galleryScroll}
              contentOffset={{ x: galleryIndex * viewportWidth, y: 0 }}
            >
              {imageUrls.map((imageUrl, index) => (
                <View
                  key={`${post.id}:gallery:${index}`}
                  style={[styles.galleryPage, { width: viewportWidth }]}
                >
                  <NativeImage resizeMode="contain" source={{ uri: imageUrl }} style={styles.galleryImage} />
                  {imageCaptions[index] ? (
                    <Text style={styles.galleryCaption}>{imageCaptions[index]}</Text>
                  ) : null}
                  <Pressable onPress={() => Linking.openURL(imageUrl)} style={styles.galleryOpenButton}>
                    <Text style={styles.galleryOpenButtonText}>Open raw image</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "relative",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.width,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.92,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.xs,
    flex: 1,
  },
  typePill: {
    backgroundColor: "rgba(0,229,255,0.12)",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  typePillText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  spoilerPill: {
    backgroundColor: "rgba(192,96,224,0.16)",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  spoilerPillText: {
    color: theme.colors.spoiler,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
  },
  developerPill: {
    backgroundColor: "rgba(255,204,51,0.14)",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  developerPillText: {
    color: "#ffcc33",
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  pinnedPill: {
    backgroundColor: "rgba(102,204,255,0.14)",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  pinnedPillText: {
    color: "#8ad6ff",
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  metaText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
  },
  authorNameText: {
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
  mainContent: {
    position: "relative",
    gap: theme.spacing.md,
    minHeight: 136,
  },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  coverImage: {
    width: 52,
    height: 72,
    borderRadius: theme.radius.sm,
  },
  coverFallback: {
    width: 52,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: theme.radius.sm,
  },
  coverFallbackText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  gameText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  gameTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  postTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  editedText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
  },
  postImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  postImageBlock: {
    gap: theme.spacing.xs,
  },
  imageCaptionList: {
    gap: theme.spacing.xs,
  },
  imageCaption: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.width,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  fillImage: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.md,
  },
  postImageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  postImageGridItem: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  postImageFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: theme.colors.border,
    borderWidth: theme.borders.width,
  },
  postImageFallbackText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  postImageFallbackActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  postImageFallbackButton: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  postImageFallbackButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
  },
  galleryBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    paddingVertical: theme.spacing.xl,
  },
  galleryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  galleryCounter: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  galleryHeaderButton: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  galleryHeaderButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  galleryScroll: {
    flex: 1,
  },
  galleryPage: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  galleryImage: {
    width: "100%",
    height: "78%",
  },
  galleryCaption: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    textAlign: "center",
  },
  galleryOpenButton: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  galleryOpenButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  clipMetaText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  ownerActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  ownerActionButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  ownerActionButtonDanger: {
    backgroundColor: "rgba(255,138,138,0.12)",
    borderColor: "rgba(255,138,138,0.32)",
  },
  ownerActionButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  ownerActionButtonDangerText: {
    color: "#ff8a8a",
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  warningBanner: {
    gap: theme.spacing.xs,
    backgroundColor: "rgba(245,166,35,0.12)",
    borderColor: "rgba(245,166,35,0.45)",
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
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
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  footerText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  commentButton: {
    alignItems: "flex-end",
  },
  footerIconAction: {
    alignItems: "center",
    borderColor: "rgba(0,229,255,0.32)",
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    flexDirection: "row",
    gap: theme.spacing.xs,
    minHeight: 32,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  footerIconActionSaved: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  commentButtonText: {
    color: theme.colors.accent,
  },
  savedButtonText: {
    color: theme.colors.background,
    fontWeight: theme.fontWeights.bold,
  },
  reportButtonText: {
    color: "#ff8a8a",
  },
  reactionRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  reactionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    minHeight: 40,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  reactionButtonSingle: {
    flex: 0,
    alignSelf: "flex-start",
    minWidth: 124,
  },
  reactionButtonSelected: {
    backgroundColor: "rgba(0,229,255,0.14)",
    borderColor: theme.colors.accent,
  },
  reactionButtonAppreciationSelected: {
    backgroundColor: "rgba(255,204,51,0.14)",
    borderColor: "rgba(255,204,51,0.45)",
  },
  reactionButtonNegativeSelected: {
    backgroundColor: "rgba(255,138,138,0.14)",
    borderColor: "rgba(255,138,138,0.4)",
  },
  reactionButtonDisabled: {
    opacity: 0.6,
  },
  reactionButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  reactionButtonSelectedText: {
    color: theme.colors.accent,
    fontWeight: theme.fontWeights.bold,
  },
  reactionButtonAppreciationSelectedText: {
    color: "#ffcc33",
    fontWeight: theme.fontWeights.bold,
  },
  reactionButtonNegativeSelectedText: {
    color: "#ff8a8a",
    fontWeight: theme.fontWeights.bold,
  },
  blurWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  blurLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  spoilerOverlay: {
    marginHorizontal: theme.spacing.lg,
    backgroundColor: "rgba(8,16,23,0.72)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  spoilerOverlayTitle: {
    color: theme.colors.spoiler,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  spoilerOverlayText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
});
