export const GENERAL_DISCUSSION = {
  id: -1001,
  slug: "general-gaming",
  title: "Gaming Discussion",
  subtitle: "Talk about favorites, hot takes, genres, trends, and gaming culture.",
  eyebrow: "Community",
  body: "A general discussion space for gaming topics that are bigger than any one title.",
  allowedPostTypes: ["discussion"],
};

export const PLATFORM_COMMUNITIES = [
  {
    id: -2001,
    slug: "xbox-series",
    title: "Xbox Series X|S",
    family: "Xbox",
    subtitle: "Current-gen Xbox discussion, reviews, and community threads.",
  },
  {
    id: -2002,
    slug: "xbox-one",
    title: "Xbox One",
    family: "Xbox",
    subtitle: "Last-gen Xbox games, performance, and backlog discussion.",
  },
  {
    id: -2003,
    slug: "xbox-360",
    title: "Xbox 360",
    family: "Xbox",
    subtitle: "Legacy Xbox classics, nostalgia, and replay value.",
  },
  {
    id: -2004,
    slug: "playstation-5",
    title: "PlayStation 5",
    family: "PlayStation",
    subtitle: "PS5 community reviews, exclusives, and recommendations.",
  },
  {
    id: -2005,
    slug: "playstation-4",
    title: "PlayStation 4",
    family: "PlayStation",
    subtitle: "PS4 library discussion, reviews, and evergreen picks.",
  },
  {
    id: -2006,
    slug: "nintendo-switch",
    title: "Nintendo Switch",
    family: "Nintendo",
    subtitle: "Switch releases, handheld play, and community impressions.",
  },
  {
    id: -2007,
    slug: "pc-gaming",
    title: "PC Gaming",
    family: "PC",
    subtitle: "A generic PC space for storefronts, mods, settings, and platform-wide discussion.",
  },
];

export const COMMUNITY_HUBS = [
  GENERAL_DISCUSSION,
  ...PLATFORM_COMMUNITIES.map((platform) => ({
    ...platform,
    eyebrow: "Platform",
    body: platform.subtitle,
    allowedPostTypes: ["discussion", "review", "guide", "tip", "screenshot"],
  })),
];

export function getCommunityBySlug(slug) {
  return COMMUNITY_HUBS.find((community) => community.slug === slug) ?? null;
}

export function getCommunityById(id) {
  return COMMUNITY_HUBS.find((community) => community.id === Number(id)) ?? null;
}

export function searchPlatformCommunities(query = "") {
  const cleanQuery = String(query ?? "").trim().toLowerCase();

  if (!cleanQuery) {
    return PLATFORM_COMMUNITIES;
  }

  return PLATFORM_COMMUNITIES.filter((platform) =>
    `${platform.title} ${platform.family} ${platform.subtitle}`.toLowerCase().includes(cleanQuery),
  );
}
