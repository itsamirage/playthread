import { StyleSheet, Text, View } from "react-native";

import { theme } from "../lib/theme";

const platformMap = {
  ps5: { label: "PS5", color: theme.colors.psn },
  ps4: { label: "PS4", color: theme.colors.psn },
  ps3: { label: "PS3", color: theme.colors.psn },
  psn: { label: "PS", color: theme.colors.psn },
  xbox_series: { label: "XSX", color: theme.colors.xbox },
  xbox_one: { label: "XB1", color: theme.colors.xbox },
  xbox: { label: "XB", color: theme.colors.xbox },
  switch: { label: "NSW", color: theme.colors.nintendo },
  wii: { label: "Wii", color: "#9e9e9e" },
  pc: { label: "PC", color: theme.colors.steam },
  steam: { label: "PC", color: theme.colors.steam },
  ios: { label: "iOS", color: theme.colors.ios },
  android: { label: "AND", color: theme.colors.android },
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
    height: 22,
    minWidth: 22,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  text: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: theme.fontWeights.bold,
  },
});
