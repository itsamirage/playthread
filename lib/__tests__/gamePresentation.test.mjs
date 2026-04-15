import test from "node:test";
import assert from "node:assert/strict";

import { getGameScoreBadge } from "../gamePresentation.mjs";

test("getGameScoreBadge hides unreleased zero scores behind a neutral upcoming badge", () => {
  const badge = getGameScoreBadge(
    {
      title: "Hollow Knight: Silksong",
      metacritic: 0,
      releaseDate: 1777766400,
      releaseYear: 2026,
    },
    new Date("2026-04-13T12:00:00Z").getTime(),
  );

  assert.deepEqual(badge, {
    kind: "upcoming",
    label: "2026",
  });
});

test("getGameScoreBadge keeps real review scores for released games", () => {
  const badge = getGameScoreBadge(
    {
      title: "Hades",
      metacritic: 93,
      releaseDate: 1601424000,
      releaseYear: 2020,
    },
    new Date("2026-04-13T12:00:00Z").getTime(),
  );

  assert.deepEqual(badge, {
    kind: "score",
    label: "93",
  });
});
