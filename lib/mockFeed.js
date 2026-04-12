const postTemplates = [
  {
    type: "review",
    reactionMode: "appreciation",
    title: "Worth jumping back in?",
    body:
      "Came back to this after a break and the pacing still holds up. The systems click fast and the late-game stuff gives you enough to chase without feeling bloated.",
    rating: 9,
    author: "mira_arc",
    reactionCounts: { like: 0, dislike: 0, helpful: 0, not_helpful: 0, respect: 148 },
    comments: 32,
    age: "2h ago",
  },
  {
    type: "discussion",
    reactionMode: "sentiment",
    title: "What build or playstyle actually feels best here?",
    body:
      "I keep bouncing between two approaches and both are fun for different reasons. Curious what other people settled on once the game opened up.",
    rating: null,
    author: "threadpilot",
    reactionCounts: { like: 91, dislike: 6, helpful: 0, not_helpful: 0, respect: 0 },
    comments: 54,
    age: "4h ago",
  },
  {
    type: "screenshot",
    reactionMode: "sentiment",
    title: "This area still looks ridiculous",
    body:
      "Stopped mid-session just to capture this moment. The lighting, color, and environment design are doing a lot of work here.",
    rating: null,
    author: "pixelgrave",
    reactionCounts: { like: 204, dislike: 5, helpful: 0, not_helpful: 0, respect: 0 },
    comments: 18,
    age: "6h ago",
  },
  {
    type: "clip",
    reactionMode: "sentiment",
    title: "The finish to this encounter was chaos",
    body:
      "Everything went wrong for about fifteen seconds and somehow still worked out. This is exactly the kind of clip I want the feed to surface later.",
    rating: null,
    author: "rallypoint",
    reactionCounts: { like: 122, dislike: 8, helpful: 0, not_helpful: 0, respect: 0 },
    comments: 27,
    age: "9h ago",
  },
];

function getTemplate(index) {
  return postTemplates[index % postTemplates.length];
}

export function buildMockFeed(followedGames) {
  if (!followedGames.length) {
    return [];
  }

  return followedGames.slice(0, 5).flatMap((game, index) => {
    const primaryTemplate = getTemplate(index);
    const secondaryTemplate = getTemplate(index + 1);

    return [
      {
        id: `${game.id}-primary`,
        gameId: game.id,
        gameTitle: game.title,
        gameCoverUrl: game.coverUrl,
        ...primaryTemplate,
      },
      {
        id: `${game.id}-secondary`,
        gameId: game.id,
        gameTitle: game.title,
        gameCoverUrl: game.coverUrl,
        ...secondaryTemplate,
        reactionCounts: {
          ...secondaryTemplate.reactionCounts,
          like: Math.max((secondaryTemplate.reactionCounts?.like ?? 0) - 24, 20),
          respect:
            secondaryTemplate.reactionMode === "appreciation"
              ? Math.max((secondaryTemplate.reactionCounts?.respect ?? 0) - 24, 20)
              : secondaryTemplate.reactionCounts?.respect ?? 0,
        },
        comments: Math.max(secondaryTemplate.comments - 8, 6),
      },
    ];
  });
}
