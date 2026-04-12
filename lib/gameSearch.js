export function normalizeSearchValue(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSubsequenceMatch(query, candidate) {
  let queryIndex = 0;

  for (let index = 0; index < candidate.length && queryIndex < query.length; index += 1) {
    if (candidate[index] === query[queryIndex]) {
      queryIndex += 1;
    }
  }

  return queryIndex === query.length;
}

export function getEditDistance(left, right) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let diagonalValue = previousRow[0];
    previousRow[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const currentValue = previousRow[rightIndex + 1];
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;

      previousRow[rightIndex + 1] = Math.min(
        previousRow[rightIndex + 1] + 1,
        previousRow[rightIndex] + 1,
        diagonalValue + cost,
      );
      diagonalValue = currentValue;
    }
  }

  return previousRow[right.length];
}

export function isFuzzyWordMatch(query, candidateWords) {
  if (!query) {
    return true;
  }

  return candidateWords.some((candidateWord) => {
    if (candidateWord.includes(query) || isSubsequenceMatch(query, candidateWord)) {
      return true;
    }

    if (query.length < 4 || Math.abs(candidateWord.length - query.length) > 2) {
      return false;
    }

    const maxDistance = query.length >= 5 ? 2 : 1;
    return getEditDistance(query, candidateWord) <= maxDistance;
  });
}

export function getGameSearchText(game) {
  return normalizeSearchValue([game.title, game.studio, game.genre, ...(game.genres ?? [])].join(" "));
}

export function matchesQueryFuzzily(game, query) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  const searchText = getGameSearchText(game);
  const candidateWords = Array.from(new Set(searchText.split(" ").filter(Boolean)));
  const queryTerms = normalizedQuery.split(" ").filter(Boolean);

  return queryTerms.every(
    (queryTerm) => searchText.includes(queryTerm) || isFuzzyWordMatch(queryTerm, candidateWords),
  );
}

function scoreGameSearchMatch(game, query) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return 0;
  }

  const title = normalizeSearchValue(game.title);
  const studio = normalizeSearchValue(game.studio);
  const genreText = normalizeSearchValue([game.genre, ...(game.genres ?? [])].join(" "));
  const candidateWords = Array.from(
    new Set([title, studio, genreText].join(" ").split(" ").filter(Boolean)),
  );
  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  let score = 0;

  if (title === normalizedQuery) {
    score += 200;
  } else if (title.includes(normalizedQuery)) {
    score += 120;
  }

  for (const queryTerm of queryTerms) {
    if (title.includes(queryTerm)) {
      score += 30;
      continue;
    }

    if (studio.includes(queryTerm) || genreText.includes(queryTerm)) {
      score += 12;
      continue;
    }

    if (isFuzzyWordMatch(queryTerm, candidateWords)) {
      score += 18;
    }
  }

  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const compactTitle = title.replace(/\s+/g, "");
  const titleDistance = getEditDistance(compactQuery, compactTitle.slice(0, compactQuery.length));

  score -= Math.min(titleDistance, 20);
  return score;
}

export function rankGamesByQuery(games, query) {
  return [...games].sort((firstGame, secondGame) => {
    const secondScore = scoreGameSearchMatch(secondGame, query);
    const firstScore = scoreGameSearchMatch(firstGame, query);

    if (secondScore !== firstScore) {
      return secondScore - firstScore;
    }

    return secondGame.metacritic - firstGame.metacritic;
  });
}

export function buildSearchFallbackQueries(query) {
  const normalizedQuery = normalizeSearchValue(query);
  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  const fallbackQueries = [];

  for (let length = queryTerms.length - 1; length >= 1; length -= 1) {
    fallbackQueries.push(queryTerms.slice(0, length).join(" "));
  }

  for (let startIndex = 1; startIndex < queryTerms.length; startIndex += 1) {
    fallbackQueries.push(queryTerms.slice(startIndex).join(" "));
  }

  for (const queryTerm of queryTerms) {
    fallbackQueries.push(queryTerm);

    for (let prefixLength = queryTerm.length - 1; prefixLength >= 4; prefixLength -= 1) {
      fallbackQueries.push(queryTerm.slice(0, prefixLength));
    }
  }

  if (normalizedQuery.length >= 5) {
    const compactQuery = normalizedQuery.replace(/\s+/g, "");

    for (let prefixLength = compactQuery.length - 1; prefixLength >= 4; prefixLength -= 1) {
      fallbackQueries.push(compactQuery.slice(0, prefixLength));
    }
  }

  return [...new Set(fallbackQueries.filter(Boolean))];
}
