import { useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

import { theme } from "../lib/theme";

export default function ClipPlayer({ playbackId, thumbnailUrl, status }) {
  const source = useMemo(
    () =>
      playbackId
        ? {
            uri: `https://stream.mux.com/${playbackId}.m3u8`,
            contentType: "hls",
          }
        : null,
    [playbackId],
  );
  const player = useVideoPlayer(source, (nextPlayer) => {
    nextPlayer.loop = false;
  });

  if (status !== "ready" || !source) {
    return (
      <View style={styles.placeholder}>
        {thumbnailUrl ? <Image source={{ uri: thumbnailUrl }} style={styles.placeholderImage} /> : null}
        <View style={styles.placeholderOverlay} />
        <Text style={styles.placeholderTitle}>
          {status === "errored" ? "Clip failed to process" : "Clip is processing"}
        </Text>
        <Text style={styles.placeholderText}>
          {status === "errored"
            ? "This upload did not finish processing. Delete and re-upload the clip from the post actions."
            : status === "uploading"
              ? "Upload received. Processing will start as soon as Mux confirms the asset."
              : "Playback will appear here as soon as Mux finishes preparing the stream."}
        </Text>
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>Streaming only</Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable style={styles.playerWrap}>
      <VideoView
        allowsFullscreen
        allowsPictureInPicture
        contentFit="cover"
        nativeControls
        player={player}
        style={styles.player}
      />
      <View style={styles.readyBadge}>
        <Text style={styles.readyBadgeText}>Streaming only</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  playerWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  player: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  placeholderImage: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8,16,23,0.58)",
  },
  placeholderTitle: {
    zIndex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  placeholderText: {
    zIndex: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  modeBadge: {
    zIndex: 1,
    marginTop: theme.spacing.sm,
    backgroundColor: "rgba(0,0,0,0.36)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  modeBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  readyBadge: {
    position: "absolute",
    right: theme.spacing.sm,
    bottom: theme.spacing.sm,
    backgroundColor: "rgba(8,16,23,0.72)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  readyBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
});
