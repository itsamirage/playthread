import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSearchFallbackQueries,
  matchesQueryFuzzily,
  rankGamesByQuery,
  stripAgeRatingQueryTerms,
} from "../gameSearch.mjs";

const silksong = {
  id: 1,
  title: "Hollow Knight: Silksong",
  studio: "Team Cherry",
  genre: "Action",
  genres: ["Metroidvania"],
  metacritic: 92,
};

const otherGame = {
  id: 2,
  title: "Sea of Stars",
  studio: "Sabotage",
  genre: "RPG",
  genres: ["Turn-Based"],
  metacritic: 88,
  members: 5000,
  releaseDate: 1693526400,
};

const silksOfMind = {
  id: 3,
  title: "Silks of Mind",
  studio: "Indie Studio",
  genre: "Adventure",
  genres: ["Adventure"],
  metacritic: 0,
  members: 3,
  releaseDate: null,
};

test("matchesQueryFuzzily accepts prefix title searches", () => {
  assert.equal(matchesQueryFuzzily(silksong, "Silkso"), true);
});

test("matchesQueryFuzzily accepts close keyboard mistakes", () => {
  assert.equal(matchesQueryFuzzily(silksong, "Silksnog"), true);
});

test("matchesQueryFuzzily ignores optional descriptor terms like remake", () => {
  assert.equal(
    matchesQueryFuzzily(
      {
        id: 4,
        title: "Resident Evil 2",
        studio: "Capcom",
        genre: "Survival Horror",
        genres: ["Horror"],
        metacritic: 91,
      },
      "Resident Evil 2 Remake",
    ),
    true,
  );
});

test("matchesQueryFuzzily ignores ESRB tags added to a game search", () => {
  assert.equal(matchesQueryFuzzily(silksong, "Hollow Knight Silksong E"), true);
  assert.equal(matchesQueryFuzzily(silksong, "Hollow Knight Silksong M"), true);
  assert.equal(matchesQueryFuzzily(silksong, "Hollow Knight Silksong E10+"), true);
});

test("stripAgeRatingQueryTerms preserves rating-only searches", () => {
  assert.equal(stripAgeRatingQueryTerms("M"), "m");
  assert.equal(stripAgeRatingQueryTerms("E T"), "e t");
  assert.equal(stripAgeRatingQueryTerms("Resident Evil 4 M"), "resident evil 4");
});

test("matchesQueryFuzzily accepts alias-style shorthand like re2", () => {
  assert.equal(
    matchesQueryFuzzily(
      {
        id: 5,
        title: "Resident Evil 2",
        studio: "Capcom",
        genre: "Survival Horror",
        genres: ["Horror"],
      },
      "re2",
    ),
    true,
  );
});

test("buildSearchFallbackQueries adds shorter typo-tolerant prefixes", () => {
  const queries = buildSearchFallbackQueries("Silksnog");

  assert.equal(queries.includes("silksno"), true);
  assert.equal(queries.includes("silksn"), true);
  assert.equal(queries.includes("silks"), true);
});

test("rankGamesByQuery keeps the closest title first", () => {
  const ranked = rankGamesByQuery([otherGame, silksong], "Silksnog");

  assert.equal(ranked[0].id, silksong.id);
});

test("rankGamesByQuery prefers a popular likely title over an obscure cross-word fuzzy match", () => {
  const ranked = rankGamesByQuery(
    [
      {
        ...silksong,
        metacritic: 0,
        members: 250000,
        releaseDate: 1777766400,
      },
      silksOfMind,
    ],
    "Silkso",
  );

  assert.equal(ranked[0].id, silksong.id);
});

test("rankGamesByQuery promotes acronym and numeral shorthand like ff7r", () => {
  const ranked = rankGamesByQuery(
    [
      {
        id: 6,
        title: "Final Fantasy Tactics",
        studio: "Square",
        genre: "RPG",
        genres: ["Strategy"],
      },
      {
        id: 7,
        title: "Final Fantasy VII Remake",
        studio: "Square Enix",
        genre: "RPG",
        genres: ["Action RPG"],
      },
    ],
    "ff7r",
  );

  assert.equal(ranked[0].id, 7);
});
