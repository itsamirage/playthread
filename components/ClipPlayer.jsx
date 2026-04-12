import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

import { theme } from "../lib/theme";

export default function ClipPlayer({ playbackId, thumbnailUrl, status }) {
  const source = useMemo(
    () => (playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : null),
    [playbackId],
  );
  const player = useVideoPlayer(source, (nextPlayer) => {
    nextPlayer.loop = false;
  });

  if (status !== "ready" || !source) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>
          {status === "errored" ? "Clip failed to process" : "Clip is processing"}
        </Text>
        <Text style={styles.placeholderText}>
          {status === "errored"
            ? "This upload did not finish processing."
            : "Playback will appear here as soon as Mux finishes preparing the stream."}
        </Text>
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
        posterSource={thumbnailUrl ? { uri: thumbnailUrl } : undefined}
        style={styles.player}
      />
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  placeholderTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  placeholderText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
    textAlign: "center",
  },
});
