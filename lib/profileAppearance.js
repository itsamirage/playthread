import { theme } from "./theme";

export const NAME_COLOR_STYLES = {
  default: theme.colors.textPrimary,
  gold: "#ffcc33",
  mint: "#77f7d2",
  owner_crimson: "#d22630",
};

export function getProfileNameColor(selectedNameColor) {
  return NAME_COLOR_STYLES[selectedNameColor ?? "default"] ?? NAME_COLOR_STYLES.default;
}
