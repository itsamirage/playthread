import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSearchFallbackQueries,
  matchesQueryFuzzily,
  rankGamesByQuery,
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
};

test("matchesQueryFuzzily accepts prefix title searches", () => {
  assert.equal(matchesQueryFuzzily(silksong, "Silkso"), true);
});

test("matchesQueryFuzzily accepts close keyboard mistakes", () => {
  assert.equal(matchesQueryFuzzily(silksong, "Silksnog"), true);
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
