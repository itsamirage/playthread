import React, { useMemo, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { theme } from "../lib/theme";
import { buildYouTubeEmbedUrl, buildYouTubeWatchUrl } from "../lib/youtube";

const PLAYER_ORIGIN = "https://playthread.app";

function buildNativePlayerHtml(embedUrl, title) {
  const escapedTitle = String(title || "YouTube video").replace(/"/g, "&quot;");

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #000;
      }
      iframe {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        background: #000;
      }
    </style>
  </head>
  <body>
    <iframe
      src="${embedUrl}"
      title="${escapedTitle}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin">
    </iframe>
  </body>
</html>`;
}

export default function YouTubePlayer({ videoId, title = null, watchUrl = null }) {
  const [hasError, setHasError] = useState(false);
  const embedUrl = useMemo(
    () =>
      buildYouTubeEmbedUrl(videoId, {
        playsinline: 1,
        rel: 0,
        origin: PLAYER_ORIGIN,
        widget_referrer: PLAYER_ORIGIN,
      }),
    [videoId],
  );
  const nativeHtml = useMemo(() => (embedUrl ? buildNativePlayerHtml(embedUrl, title) : null), [embedUrl, title]);
  const normalizedWatchUrl = watchUrl || buildYouTubeWatchUrl(videoId);

  const openInYouTube = () => {
    if (normalizedWatchUrl) {
      void Linking.openURL(normalizedWatchUrl);
    }
  };

  if (!embedUrl || hasError) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>YouTube video unavailable</Text>
        {normalizedWatchUrl ? (
          <Pressable onPress={openInYouTube} style={({ pressed }) => [styles.openButton, pressed ? styles.pressed : null]}>
            <Text style={styles.openButtonText}>Open in YouTube</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {Platform.OS === "web" ? (
        React.createElement("iframe", {
          src: embedUrl,
          title: title || "YouTube video",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
          allowFullScreen: true,
          referrerPolicy: "strict-origin-when-cross-origin",
          style: styles.webFrame,
        })
      ) : (
        <WebView
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          javaScriptEnabled
          mediaPlaybackRequiresUserAction
          onError={() => setHasError(true)}
          onHttpError={() => setHasError(true)}
          originWhitelist={["https://*", "http://*"]}
          source={{
            html: nativeHtml,
            baseUrl: PLAYER_ORIGIN,
          }}
          style={styles.webView}
        />
      )}
      <View style={styles.metaRow}>
        <Text numberOfLines={1} style={styles.sourceText}>
          YouTube
        </Text>
        {normalizedWatchUrl ? (
          <Pressable onPress={openInYouTube} style={({ pressed }) => [styles.inlineButton, pressed ? styles.pressed : null]}>
            <Text style={styles.inlineButtonText}>Open</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  webView: {
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: theme.radius.md,
    minHeight: 210,
    overflow: "hidden",
    width: "100%",
  },
  webFrame: {
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: theme.radius.md,
    borderWidth: 0,
    minHeight: 210,
    width: "100%",
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.sm,
    justifyContent: "space-between",
  },
  sourceText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  inlineButton: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  inlineButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
  },
  fallback: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    gap: theme.spacing.sm,
    justifyContent: "center",
    minHeight: 210,
    padding: theme.spacing.lg,
  },
  fallbackTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
    textAlign: "center",
  },
  openButton: {
    backgroundColor: "rgba(0,229,255,0.12)",
    borderColor: "rgba(0,229,255,0.32)",
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  openButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  pressed: {
    opacity: 0.88,
  },
});
