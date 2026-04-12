import { StyleSheet, Text, View } from "react-native";

import { theme } from "../lib/theme";

const platformMap = {
  steam: {
    label: "S",
    color: theme.colors.steam,
  },
  xbox: {
    label: "X",
    color: theme.colors.xbox,
  },
  psn: {
    label: "P",
    color: theme.colors.psn,
  },
};

export default function PlatformBadge({ platform }) {
  const platformInfo = platformMap[platform];

  if (!platformInfo) {
    return null;
  }

  return (
    <View style={[styles.badge, { backgroundColor: platformInfo.color }]}>
      <Text style={styles.text}>{platformInfo.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  text: {
    color: "#ffffff",
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
  },
});
