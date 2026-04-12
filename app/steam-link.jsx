import { StyleSheet, Text, View } from "react-native";

import { theme } from "../lib/theme";

export default function SteamLinkScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Finishing Steam link...</Text>
      <Text style={styles.body}>
        If this page does not close automatically, return to PlayThread.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
    padding: theme.layout.screenPadding,
    backgroundColor: theme.colors.background,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    textAlign: "center",
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
    textAlign: "center",
  },
});
