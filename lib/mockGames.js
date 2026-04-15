export const mockGames = [
  {
    id: 1,
    title: "Persona 5 Royal",
    studio: "Atlus",
    releaseYear: 2020,
    genre: "RPG",
    platforms: ["psn"],
    metacritic: 95,
    starRating: 4.8,
    members: 18200,
  },
  {
    id: 2,
    title: "Hades",
    studio: "Supergiant",
    releaseYear: 2020,
    genre: "Action RPG",
    platforms: ["steam", "psn", "xbox"],
    metacritic: 93,
    starRating: 4.7,
    members: 14500,
  },
  {
    id: 3,
    title: "Celeste",
    studio: "Extremely OK",
    releaseYear: 2018,
    genre: "Platformer",
    platforms: ["steam", "xbox", "psn"],
    metacritic: 91,
    starRating: 4.6,
    members: 9700,
  },
  {
    id: 8,
    title: "Hades II",
    studio: "Supergiant",
    releaseYear: 2024,
    genre: "Action RPG",
    platforms: ["steam"],
    metacritic: 90,
    starRating: 4.6,
    members: 9100,
  },
  {
    id: 4,
    title: "Halo Infinite",
    studio: "343 Industries",
    releaseYear: 2021,
    genre: "Shooter",
    platforms: ["xbox", "steam"],
    metacritic: 87,
    starRating: 4.1,
    members: 11100,
  },
  {
    id: 9,
    title: "DOOM Eternal",
    studio: "id Software",
    releaseYear: 2020,
    genre: "Shooter",
    platforms: ["steam", "psn", "xbox"],
    metacritic: 88,
    starRating: 4.4,
    members: 12400,
  },
  {
    id: 5,
    title: "Forza Horizon 5",
    studio: "Playground Games",
    releaseYear: 2021,
    genre: "Open World",
    platforms: ["xbox", "steam"],
    metacritic: 92,
    starRating: 4.5,
    members: 13300,
  },
  {
    id: 10,
    title: "The Witcher 3",
    studio: "CD Projekt Red",
    releaseYear: 2015,
    genre: "Open World",
    platforms: ["steam", "psn", "xbox"],
    metacritic: 93,
    starRating: 4.9,
    members: 24100,
  },
  {
    id: 6,
    title: "Stardew Valley",
    studio: "ConcernedApe",
    releaseYear: 2016,
    genre: "Simulation",
    platforms: ["steam", "xbox", "psn"],
    metacritic: 89,
    starRating: 4.9,
    members: 22600,
  },
  {
    id: 7,
    title: "Civilization VI",
    studio: "Firaxis",
    releaseYear: 2016,
    genre: "Strategy",
    platforms: ["steam"],
    metacritic: 88,
    starRating: 4.2,
    members: 8600,
  },
];

for (const game of mockGames) {
  game.genres = game.genres ?? [game.genre];
  game.summary =
    game.summary ??
    `${game.title} is part of the local fallback catalog until IGDB credentials are configured.`;
  game.coverUrl = game.coverUrl ?? null;
  game.screenshotUrls = game.screenshotUrls ?? [];
  game.isMature = Boolean(game.isMature);
}

export function getMockGameById(gameId) {
  return mockGames.find((game) => String(game.id) === String(gameId)) ?? null;
}
