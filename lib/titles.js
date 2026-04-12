export const PROFILE_TITLE_OPTIONS = [
  { key: "none", label: "No title", style: "neutral" },
  { key: "admin", label: "Admin", style: "gold" },
  { key: "achievement_hunter", label: "Achievement Hunter", style: "accent" },
  { key: "boss_slayer", label: "Boss Slayer", style: "accent" },
  { key: "retro_legend", label: "Retro Legend", style: "gold" },
  { key: "co_op_carry", label: "Co-op Carry", style: "accent" },
  { key: "controller_poet", label: "Controller Poet", style: "accent" },
  { key: "gg_wp", label: "\"GG, well played.\"", style: "quote" },
  { key: "one_more_run", label: "\"One more run.\"", style: "quote" },
  { key: "press_start", label: "\"Press start to continue.\"", style: "quote" },
  { key: "git_gud", label: "\"git gud\"", style: "quote" },
  { key: "victory_fanfare", label: "\"Cue the victory fanfare.\"", style: "quote" },
];

export function getProfileTitleOption(key) {
  return (
    PROFILE_TITLE_OPTIONS.find((option) => option.key === key) ??
    PROFILE_TITLE_OPTIONS[0]
  );
}
