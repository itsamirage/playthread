import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import ClipPlayer from "./ClipPlayer";
import { formatModerationWarning } from "../lib/moderation";
import { getProfileNameColor } from "../lib/profileAppearance";
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
  isDeleting = false,
  isReacting = false,
  concealSpoilers = false,
  spoilerRevealHint = null,
}) {
  const reactionLabels = reactionLabelsByMode[post.reactionMode] ?? reactionLabelsByMode.sentiment;
  const authorTitle = getProfileTitleOption(post.authorTitleKey);
  const authorNameColor = getProfileNameColor(post.authorNameColor);
  const reactionTypes =
    post.reactionMode === "utility"
      ? ["helpful", "not_helpful"]
      : post.reactionMode === "appreciation"
        ? ["respect"]
        : ["like", "dislike"];

  return (
    <Pressable
      disabled={!onPress}
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
              <Text style={styles.developerPillText}>Developer</Text>
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

      <View style={styles.mainContent}>
        <Pressable
          disabled={!onGamePress}
          onPress={(event) => { event.stopPropagation?.(); onGamePress?.(); }}
          style={styles.gameRow}
        >
          {post.gameCoverUrl ? (
            <Image source={{ uri: post.gameCoverUrl }} style={styles.coverImage} />
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

        <Text style={styles.bodyText}>{post.body}</Text>
        {post.isEdited ? (
          <Text style={styles.editedText}>
            Edited {new Date(post.updatedAt).toLocaleString()}
          </Text>
        ) : null}

        {post.imageUrl ? (
          <Image source={{ uri: post.imageUrl }} style={styles.postImage} />
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

        {concealSpoilers ? (
          <View pointerEvents="none" style={styles.blurWrap}>
            <BlurView intensity={80} style={styles.blurLayer} tint="dark" />
            <View style={styles.spoilerOverlay}>
              <Text style={styles.spoilerOverlayTitle}>Spoiler concealed</Text>
              <Text style={styles.spoilerOverlayText}>
                {spoilerRevealHint ?? "Tap this post if you want to open a potentially spoiler-heavy thread."}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
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
  commentButtonText: {
    color: theme.colors.accent,
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
