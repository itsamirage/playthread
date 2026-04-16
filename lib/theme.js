export const theme = {
  colors: {
    accent: "#00e5ff",
    background: "#0b0e14",
    card: "#121620",
    border: "rgba(255,255,255,0.06)",
    textPrimary: "#e4e8f1",
    textSecondary: "rgba(228,232,241,0.5)",
    textMuted: "rgba(228,232,241,0.28)",
    spoiler: "#c060e0",
    steam: "#1b2838",
    xbox: "#107c10",
    psn: "#003087",
    nintendo: "#e4000f",
    ios: "#0071e3",
    android: "#3ddc84",
    scoreExcellent: "#66cc33",
    scoreGood: "#ffcc33",
    scoreMixed: "#ff6633",
    scoreBad: "#ff0000",
  },
  fonts: {
    primary: "System",
    heading: "System",
  },
  fontSizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  fontWeights: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    black: "900",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 14,
    pill: 999,
  },
  borders: {
    width: 1,
  },
  iconSizes: {
    sm: 16,
    md: 20,
    lg: 24,
  },
  layout: {
    screenPadding: 16,
    cardGap: 12,
  },
};

export const getMetacriticColor = (score) => {
  if (score >= 90) return theme.colors.scoreExcellent;
  if (score >= 75) return theme.colors.scoreGood;
  if (score >= 50) return theme.colors.scoreMixed;
  return theme.colors.scoreBad;
};
