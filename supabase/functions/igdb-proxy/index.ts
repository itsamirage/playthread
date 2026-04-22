const IGDB_API_URL = "https://api.igdb.com/v4";
const COVER_SIZE = "t_cover_big";
const SCREENSHOT_SIZE = "t_screenshot_big";
const GAME_BATCH_SIZE = 100;
const STARTER_CACHE_TTL_MS = 1000 * 60 * 5;
const DETAIL_CACHE_TTL_MS = 1000 * 60 * 5;
const COVERS_CACHE_TTL_MS = 1000 * 60 * 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const platformMatchers = [
  { key: "ps5", pattern: /playstation 5|ps5/i },
  { key: "ps4", pattern: /playstation 4|ps4/i },
  { key: "ps3", pattern: /playstation 3|ps3/i },
  { key: "psn", pattern: /playstation|psn/i },
  { key: "xbox_series", pattern: /xbox series|xbox s|xbox x/i },
  { key: "xbox_one", pattern: /xbox one/i },
  { key: "xbox", pattern: /xbox/i },
  { key: "switch", pattern: /nintendo switch/i },
  { key: "wii", pattern: /wii/i },
  { key: "pc", pattern: /steam|pc \(microsoft windows\)|linux|mac os/i },
  { key: "ios", pattern: /ios|iphone|ipad/i },
  { key: "android", pattern: /android/i },
];

type CatalogSort =
  | "score_desc"
  | "score_asc"
  | "date_desc"
  | "date_asc";

type IgdbRequestBody = {
  action?: "discover" | "starter" | "detail" | "search" | "covers" | "catalog";
  limit?: number;
  offset?: number;
  gameId?: number;
  query?: string;
  gameIds?: number[];
  facet?: "studio" | "genre" | "year";
  value?: string | number;
  sortBy?: CatalogSort;
};

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

type NormalizedGame = ReturnType<typeof normalizeIgdbGame>;

const responseCache = new Map<string, CacheEntry>();

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function toImageUrl(imageId: string | undefined, size: string) {
  if (!imageId) {
    return null;
  }

  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}

function toRoundedNumber(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.round(value);
}

function toStarRating(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(5, Number((value / 20).toFixed(1))));
}

function toReleaseYear(timestamp: number | undefined) {
  if (!timestamp) {
    return "TBA";
  }

  return new Date(timestamp * 1000).getFullYear();
}

function normalizePlatforms(platforms: Array<{ name?: string }> = []) {
  const normalizedPlatforms: string[] = [];

  for (const platform of platforms) {
    const platformName = platform?.name ?? "";

    for (const matcher of platformMatchers) {
      if (matcher.pattern.test(platformName) && !normalizedPlatforms.includes(matcher.key)) {
        normalizedPlatforms.push(matcher.key);
      }
    }
  }

  return normalizedPlatforms;
}

function getPrimaryStudio(
  involvedCompanies: Array<{
    developer?: boolean;
    publisher?: boolean;
    company?: { name?: string };
  }> = []
) {
  const companyEntry =
    involvedCompanies.find((item) => item?.developer && item?.company?.name) ??
    involvedCompanies.find((item) => item?.publisher && item?.company?.name) ??
    involvedCompanies.find((item) => item?.company?.name);

  return companyEntry?.company?.name ?? "Unknown studio";
}

function getPrimaryGenre(genres: Array<{ name?: string }> = []) {
  return genres[0]?.name ?? "Unknown";
}

type IgdbAgeRating = {
  category?: number;
  organization?: number;
  rating?: number;
  rating_category?: number | { organization?: number };
};

// IGDB age_ratings: organization/category 1=ESRB, 2=PEGI, 3=CERO, 4=USK, 5=GRAC, 6=CLASS_IND, 7=ACB.
// The deprecated `rating` field uses one global enum. Only accept a label when
// that enum's organization matches the age rating row's organization.
const AGE_RATING_LABELS: Record<number, { organization: number; label: string }> = {
  1: { organization: 2, label: "PEGI 3" },
  2: { organization: 2, label: "PEGI 7" },
  3: { organization: 2, label: "PEGI 12" },
  4: { organization: 2, label: "PEGI 16" },
  5: { organization: 2, label: "PEGI 18" },
  6: { organization: 1, label: "ESRB RP" },
  7: { organization: 1, label: "ESRB EC" },
  8: { organization: 1, label: "ESRB E" },
  9: { organization: 1, label: "ESRB E10+" },
  10: { organization: 1, label: "ESRB T" },
  11: { organization: 1, label: "ESRB M" },
  12: { organization: 1, label: "ESRB AO" },
  13: { organization: 3, label: "CERO A" },
  14: { organization: 3, label: "CERO B" },
  15: { organization: 3, label: "CERO C" },
  16: { organization: 3, label: "CERO D" },
  17: { organization: 3, label: "CERO Z" },
  18: { organization: 4, label: "USK 0" },
  19: { organization: 4, label: "USK 6" },
  20: { organization: 4, label: "USK 12" },
  21: { organization: 4, label: "USK 16" },
  22: { organization: 4, label: "USK 18" },
  23: { organization: 5, label: "GRAC All" },
  24: { organization: 5, label: "GRAC 12" },
  25: { organization: 5, label: "GRAC 15" },
  26: { organization: 5, label: "GRAC 18" },
  27: { organization: 5, label: "GRAC Testing" },
  28: { organization: 6, label: "ClassInd L" },
  29: { organization: 6, label: "ClassInd 10" },
  30: { organization: 6, label: "ClassInd 12" },
  31: { organization: 6, label: "ClassInd 14" },
  32: { organization: 6, label: "ClassInd 16" },
  33: { organization: 6, label: "ClassInd 18" },
  34: { organization: 7, label: "ACB G" },
  35: { organization: 7, label: "ACB PG" },
  36: { organization: 7, label: "ACB M" },
  37: { organization: 7, label: "ACB MA15+" },
  38: { organization: 7, label: "ACB R18+" },
  39: { organization: 7, label: "ACB RC" },
};

const AGE_RATING_ORGANIZATION_PRIORITY = [1, 2, 3, 4, 7, 5, 6];

function getAgeRatingOrganization(ageRating: IgdbAgeRating): number {
  const ratingCategory = ageRating?.rating_category;
  if (ratingCategory && typeof ratingCategory === "object") {
    return Number(ratingCategory.organization ?? ageRating.organization ?? ageRating.category ?? 0);
  }

  return Number(ageRating.organization ?? ageRating.category ?? 0);
}

function getAgeRatingValue(ageRating: IgdbAgeRating): number {
  return Number(ageRating.rating ?? 0);
}

function getAgeRatingLabel(ageRatings: IgdbAgeRating[] = []): string | null {
  const ratingsWithLabels = ageRatings
    .map((ageRating) => {
      const organization = getAgeRatingOrganization(ageRating);
      const ratingValue = getAgeRatingValue(ageRating);
      const ratingLabel = AGE_RATING_LABELS[ratingValue];

      if (!ratingLabel || (organization && organization !== ratingLabel.organization)) {
        return null;
      }

      return {
        label: ratingLabel.label,
        organization: organization || ratingLabel.organization,
      };
    })
    .filter(Boolean) as Array<{ label: string; organization: number }>;

  for (const organization of AGE_RATING_ORGANIZATION_PRIORITY) {
    const rating = ratingsWithLabels.find((item) => item.organization === organization);
    if (rating) {
      return rating.label;
    }
  }

  return ratingsWithLabels[0]?.label ?? null;
}

function isMatureAgeRating(
  ageRatings: IgdbAgeRating[] = [],
  themes: Array<{ id?: number; name?: string }> = [],
) {
  const hasAdultTheme = themes.some((theme) => {
    const themeName = String(theme?.name ?? "").toLowerCase();
    return /\b(adult|erotic|hentai|porn|sexual)\b/.test(themeName);
  });
  if (hasAdultTheme) return true;

  return ageRatings.some((item) => {
    const category = getAgeRatingOrganization(item);
    const rating = getAgeRatingValue(item);

    if (category === 1) {
      return rating === 12; // ESRB AO
    }

    if (category === 2) {
      return rating >= 5; // PEGI 18
    }

    if (category === 3) {
      return rating === 17; // CERO Z
    }

    if (category === 4) {
      return rating === 22; // USK 18
    }

    if (category === 7) {
      return rating >= 38; // ACB R18+ or RC
    }

    return false;
  });
}

function getGameModes(gameModes: Array<{ name?: string }> = []): string[] {
  return gameModes.map((m) => m?.name).filter(Boolean) as string[];
}

function normalizeIgdbGame(game: any) {
  const totalRating = game?.total_rating ?? game?.aggregated_rating ?? null;
  const members = toRoundedNumber(
    game?.follows ?? game?.hypes ?? game?.total_rating_count ?? game?.aggregated_rating_count
  );

  const gameModes = getGameModes(game.game_modes);

  return {
    id: game.id,
    title: game.name ?? "Untitled game",
    studio: getPrimaryStudio(game.involved_companies),
    releaseYear: toReleaseYear(game.first_release_date),
    releaseDate: game.first_release_date ?? null,
    genre: getPrimaryGenre(game.genres),
    genres: (game.genres ?? []).map((item: { name?: string }) => item.name).filter(Boolean),
    platforms: normalizePlatforms(game.platforms),
    metacritic: toRoundedNumber(game.aggregated_rating ?? game.total_rating) ?? 0,
    starRating: toStarRating(totalRating) ?? 0,
    members: members ?? 0,
    isMature: isMatureAgeRating(game.age_ratings, game.themes),
    ageRatingLabel: getAgeRatingLabel(game.age_ratings),
    gameModes,
    isCoOp: gameModes.some((m) => /co.?op|cooperative/i.test(m)),
    summary: game.summary ?? "No summary available yet.",
    coverUrl: toImageUrl(game.cover?.image_id, COVER_SIZE),
    screenshotUrls: (game.screenshots ?? [])
      .map((item: { image_id?: string }) => toImageUrl(item?.image_id, SCREENSHOT_SIZE))
      .filter(Boolean),
  };
}

async function igdbRequest(endpoint: string, body: string) {
  const igdbClientId = Deno.env.get("IGDB_CLIENT_ID");
  const igdbAccessToken = Deno.env.get("IGDB_ACCESS_TOKEN");

  if (!igdbClientId || !igdbAccessToken) {
    throw new Error("Missing IGDB_CLIENT_ID or IGDB_ACCESS_TOKEN in Supabase function secrets.");
  }

  const response = await fetch(`${IGDB_API_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": igdbClientId,
      Authorization: `Bearer ${igdbAccessToken}`,
      Accept: "application/json",
      "Content-Type": "text/plain",
    },
    body,
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`IGDB request failed (${response.status}): ${responseText}`);
  }

  return response.json();
}

function getCachedValue<T>(cacheKey: string) {
  const cachedEntry = responseCache.get(cacheKey);

  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return cachedEntry.value as T;
}

function setCachedValue(cacheKey: string, value: unknown, ttlMs: number) {
  if (ttlMs <= 0) {
    return;
  }

  responseCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

async function getOrLoadCachedValue<T>(cacheKey: string, ttlMs: number, loader: () => Promise<T>) {
  if (ttlMs <= 0) {
    return loader();
  }

  const cachedValue = getCachedValue<T>(cacheKey);

  if (cachedValue) {
    return cachedValue;
  }

  const nextValue = await loader();
  setCachedValue(cacheKey, nextValue, ttlMs);
  return nextValue;
}

function gameFields() {
  return "fields name,summary,first_release_date,aggregated_rating,aggregated_rating_count,total_rating,total_rating_count,follows,hypes,cover.image_id,screenshots.image_id,genres.name,platforms.name,age_ratings.category,age_ratings.organization,age_ratings.rating,age_ratings.rating_category.organization,game_modes.name,themes.id,themes.name,involved_companies.developer,involved_companies.publisher,involved_companies.company.name;";
}

function discoverQuery(limit: number, offset: number) {
  return [
    gameFields(),
    "where total_rating_count != null;",
    "sort total_rating_count desc;",
    `limit ${limit};`,
    `offset ${offset};`,
  ].join(" ");
}

function starterQuery(limit: number) {
  return [
    gameFields(),
    "where total_rating_count != null;",
    "sort total_rating_count desc;",
    `limit ${limit};`,
  ].join(" ");
}

function detailQuery(gameId: number) {
  return [
    gameFields(),
    `where id = ${gameId};`,
    "limit 1;",
  ].join(" ");
}

function coversQuery(gameIds: number[]) {
  return [
    "fields name,cover.image_id;",
    `where id = (${gameIds.join(",")});`,
    `limit ${gameIds.length};`,
  ].join(" ");
}

function escapeSearchTerm(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function searchQuery(searchTerm: string, limit: number, offset: number) {
  const safeSearchTerm = escapeSearchTerm(searchTerm);

  return [
    gameFields(),
    `search "${safeSearchTerm}";`,
    "where (category = null | category = (0,4,8,9,10)) & version_parent = null & parent_game = null;",
    `limit ${limit};`,
    `offset ${offset};`,
  ].join(" ");
}

function nameContainsQuery(searchTerm: string, limit: number, offset: number) {
  const safeSearchTerm = escapeSearchTerm(searchTerm);

  return [
    gameFields(),
    `where name ~ *"${safeSearchTerm}"* & (category = null | category = (0,4,8,9,10)) & version_parent = null & parent_game = null;`,
    "sort total_rating_count desc;",
    `limit ${limit};`,
    `offset ${offset};`,
  ].join(" ");
}

function yearCatalogQuery(year: number, limit: number) {
  const startOfYear = Math.floor(Date.UTC(year, 0, 1) / 1000);
  const startOfNextYear = Math.floor(Date.UTC(year + 1, 0, 1) / 1000);

  return [
    gameFields(),
    `where first_release_date >= ${startOfYear} & first_release_date < ${startOfNextYear};`,
    `limit ${limit};`,
  ].join(" ");
}

function genreLookupQuery(genreName: string) {
  const safeGenreName = escapeSearchTerm(genreName);

  return [
    "fields id,name;",
    `search "${safeGenreName}";`,
    "limit 10;",
  ].join(" ");
}

function developerGamesQuery(companyName: string, limit: number) {
  const safeCompanyName = escapeSearchTerm(companyName);

  return [
    "fields game,company.name;",
    `where developer = true & game != null & company.name ~ *\"${safeCompanyName}\"*;`,
    `limit ${limit};`,
  ].join(" ");
}

function genreGamesQuery(genreIds: number[], limit: number) {
  return [
    gameFields(),
    `where genres = (${genreIds.join(",")}) & version_parent = null & parent_game = null;`,
    `limit ${limit};`,
  ].join(" ");
}

function gamesByIdsQuery(gameIds: number[]) {
  return [
    gameFields(),
    `where id = (${gameIds.join(",")}) & version_parent = null & parent_game = null;`,
    `limit ${gameIds.length};`,
  ].join(" ");
}

function normalizeCatalogSort(sortBy: string | undefined): CatalogSort {
  if (
    sortBy === "score_asc" ||
    sortBy === "date_desc" ||
    sortBy === "date_asc" ||
    sortBy === "score_desc"
  ) {
    return sortBy;
  }

  return "score_desc";
}

function sortCatalogGames(games: NormalizedGame[], sortBy: CatalogSort) {
  return [...games].sort((firstGame, secondGame) => {
    if (sortBy === "date_desc") {
      return (secondGame.releaseDate ?? 0) - (firstGame.releaseDate ?? 0);
    }

    if (sortBy === "date_asc") {
      return (firstGame.releaseDate ?? 0) - (secondGame.releaseDate ?? 0);
    }

    if (sortBy === "score_asc") {
      return firstGame.metacritic - secondGame.metacritic;
    }

    return secondGame.metacritic - firstGame.metacritic;
  });
}

function pickBestExactMatches(
  results: Array<{ id: number; name?: string }>,
  value: string
) {
  const normalizedValue = value.trim().toLowerCase();
  const exactMatches = results.filter(
    (item) => String(item.name ?? "").trim().toLowerCase() === normalizedValue
  );

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return results.filter((item) =>
    String(item.name ?? "").trim().toLowerCase().includes(normalizedValue)
  );
}

async function fetchGamesByIds(gameIds: number[]) {
  const uniqueGameIds = [...new Set(gameIds)].filter((id) => id > 0);
  const results: any[] = [];

  for (let index = 0; index < uniqueGameIds.length; index += GAME_BATCH_SIZE) {
    const chunk = uniqueGameIds.slice(index, index + GAME_BATCH_SIZE);

    if (chunk.length === 0) {
      continue;
    }

    const response = await igdbRequest("games", gamesByIdsQuery(chunk));
    results.push(...response);
  }

  return results;
}

async function loadStudioCatalogGames(value: string, limit: number) {
  const involvedCompanyRows = await igdbRequest(
    "involved_companies",
    developerGamesQuery(value, Math.max(limit * 4, limit))
  );

  const gameIds = involvedCompanyRows
    .map((row: { game?: number }) => Number(row.game))
    .filter((id: number) => !Number.isNaN(id) && id > 0);

  const games = await fetchGamesByIds(gameIds);
  return games.map(normalizeIgdbGame);
}

async function loadGenreCatalogGames(value: string, limit: number) {
  const genres = await igdbRequest("genres", genreLookupQuery(value));
  const matchedGenres = pickBestExactMatches(genres, value).slice(0, 5);

  if (matchedGenres.length === 0) {
    return [];
  }

  const response = await igdbRequest(
    "games",
    genreGamesQuery(
      matchedGenres.map((genre: { id: number }) => genre.id),
      Math.max(limit * 2, limit)
    )
  );

  return response.map(normalizeIgdbGame);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = (await request.json()) as IgdbRequestBody;
    const action = body.action;

    if (action === "discover") {
      const limit = Math.min(Math.max(Number(body.limit ?? 60), 1), 100);
      const offset = Math.max(Number(body.offset ?? 0), 0);
      const games = await getOrLoadCachedValue(`discover:${limit}:${offset}`, 0, async () => {
        const response = await igdbRequest("games", discoverQuery(limit, offset));
        return response.map(normalizeIgdbGame);
      });
      return jsonResponse({ games });
    }

    if (action === "starter") {
      const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 25);
      const games = await getOrLoadCachedValue(`starter:${limit}`, STARTER_CACHE_TTL_MS, async () => {
        const response = await igdbRequest("games", starterQuery(limit));
        return response.map(normalizeIgdbGame);
      });
      return jsonResponse({ games });
    }

    if (action === "detail") {
      const gameId = Number(body.gameId);

      if (!gameId || Number.isNaN(gameId)) {
        return jsonResponse({ error: "A valid gameId is required." }, 400);
      }

      const game = await getOrLoadCachedValue(`detail:${gameId}`, DETAIL_CACHE_TTL_MS, async () => {
        const response = await igdbRequest("games", detailQuery(gameId));
        return response[0] ? normalizeIgdbGame(response[0]) : null;
      });
      return jsonResponse({ game });
    }

    if (action === "search") {
      const query = String(body.query ?? "").trim();
      const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 50);
      const offset = Math.max(Number(body.offset ?? 0), 0);

      if (!query) {
        return jsonResponse({ games: [] });
      }

      const games = await getOrLoadCachedValue(
        `search:${query.toLowerCase()}:${limit}:${offset}`,
        0,
        async () => {
          // Run keyword search and name-contains search in parallel.
          // Keyword search handles full-word relevance; name-contains catches
          // partial inputs like "Biosh" that IGDB's word index misses.
          const [keywordResults, nameResults] = await Promise.all([
            igdbRequest("games", searchQuery(query, limit, offset)),
            igdbRequest("games", nameContainsQuery(query, limit, offset)),
          ]);

          const seenIds = new Set<number>();
          const merged: any[] = [];

          for (const game of [...keywordResults, ...nameResults]) {
            if (!seenIds.has(game.id)) {
              seenIds.add(game.id);
              merged.push(game);
            }
          }

          return merged.map(normalizeIgdbGame);
        }
      );
      return jsonResponse({ games });
    }

    if (action === "covers") {
      const gameIds = (body.gameIds ?? [])
        .map((value) => Number(value))
        .filter((value) => !Number.isNaN(value) && value > 0)
        .slice(0, 25);

      if (!gameIds.length) {
        return jsonResponse({ covers: [] });
      }

      const covers = await getOrLoadCachedValue(
        `covers:${gameIds.sort((a, b) => a - b).join(",")}`,
        COVERS_CACHE_TTL_MS,
        async () => {
          const response = await igdbRequest("games", coversQuery(gameIds));
          return response.map((game: any) => ({
            id: game.id,
            title: game.name ?? `Game ${game.id}`,
            coverUrl: toImageUrl(game.cover?.image_id, COVER_SIZE),
          }));
        }
      );

      return jsonResponse({ covers });
    }

    if (action === "catalog") {
      const facet = body.facet;
      const sortBy = normalizeCatalogSort(body.sortBy);
      const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 200);
      const value = String(body.value ?? "").trim();

      if (!facet || !value) {
        return jsonResponse({ games: [] });
      }

      const cacheKey = `catalog:${facet}:${value.toLowerCase()}:${sortBy}:${limit}`;
      const games = await getOrLoadCachedValue(cacheKey, 0, async () => {
        if (facet === "year") {
          const numericYear = Number(value);

          if (!numericYear || Number.isNaN(numericYear)) {
            return [];
          }

          const response = await igdbRequest("games", yearCatalogQuery(numericYear, limit));
          return sortCatalogGames(response.map(normalizeIgdbGame), sortBy).slice(0, limit);
        }

        if (facet === "studio") {
          const studioGames = await loadStudioCatalogGames(value, limit);
          return sortCatalogGames(studioGames, sortBy).slice(0, limit);
        }

        if (facet === "genre") {
          const genreGames = await loadGenreCatalogGames(value, limit);
          return sortCatalogGames(genreGames, sortBy).slice(0, limit);
        }

        return [];
      });

      return jsonResponse({ games });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown function error.";
    return jsonResponse({ error: message }, 500);
  }
});
