// IGDB age_ratings organization/category: 1=ESRB, 2=PEGI, 3=CERO, 4=USK, 5=GRAC, 6=CLASS_IND, 7=ACB.
const AGE_RATING_LABELS_BY_ORGANIZATION = {
  1: { 1: "ESRB RP", 2: "ESRB EC", 3: "ESRB E", 4: "ESRB E10+", 5: "ESRB T", 6: "ESRB M", 7: "ESRB AO" },
  2: { 1: "PEGI 3", 2: "PEGI 7", 3: "PEGI 12", 4: "PEGI 16", 5: "PEGI 18" },
  3: { 1: "CERO A", 2: "CERO B", 3: "CERO C", 4: "CERO D", 5: "CERO Z" },
  4: { 1: "USK 0", 2: "USK 6", 3: "USK 12", 4: "USK 16", 5: "USK 18" },
  5: { 1: "GRAC All", 2: "GRAC 12", 3: "GRAC 15", 4: "GRAC 18" },
  6: { 1: "ClassInd L", 2: "ClassInd 10", 3: "ClassInd 12", 4: "ClassInd 14", 5: "ClassInd 16", 6: "ClassInd 18" },
  7: { 1: "ACB G", 2: "ACB PG", 3: "ACB M", 4: "ACB MA15+", 5: "ACB R18+", 6: "ACB RC" },
};

const AGE_RATING_ORGANIZATION_PRIORITY = [1, 2, 3, 4, 7, 5, 6];
const AGE_RATING_ORGANIZATION_LABELS = {
  1: "ESRB",
  2: "PEGI",
  3: "CERO",
  4: "USK",
  5: "GRAC",
  6: "ClassInd",
  7: "ACB",
};

function getAgeRatingOrganization(ageRating) {
  const ratingCategory = ageRating?.rating_category;
  if (ratingCategory && typeof ratingCategory === "object") {
    return Number(ratingCategory.organization ?? ageRating.organization ?? ageRating.category ?? 0);
  }

  return Number(ageRating?.organization ?? ageRating?.category ?? 0);
}

function getAgeRatingValue(ageRating) {
  const ratingCategory = ageRating?.rating_category;
  if (ratingCategory && typeof ratingCategory === "object") {
    return ratingCategory.rating ?? Number(ageRating.rating ?? 0);
  }

  return Number(ageRating?.rating ?? 0);
}

function normalizeAgeRatingText(organization, ratingValue) {
  const cleanValue = String(ratingValue ?? "").trim().replace(/_/g, " ");
  const normalizedValue = cleanValue.toLowerCase();
  const numericWords = {
    three: "3",
    seven: "7",
    twelve: "12",
    fourteen: "14",
    fifteen: "15",
    sixteen: "16",
    eighteen: "18",
    ten: "10",
  };
  const labelPrefix = AGE_RATING_ORGANIZATION_LABELS[organization];

  if (!labelPrefix || !cleanValue) {
    return null;
  }

  if (organization === 1 && normalizedValue === "e10") {
    return "ESRB E10+";
  }

  if (organization === 1) {
    const esrbLabels = {
      rp: "ESRB RP",
      ec: "ESRB EC",
      e: "ESRB E",
      t: "ESRB T",
      m: "ESRB M",
      ao: "ESRB AO",
    };
    return esrbLabels[normalizedValue] ?? `${labelPrefix} ${cleanValue.toUpperCase()}`;
  }

  if (organization === 2 && numericWords[normalizedValue]) {
    return `PEGI ${numericWords[normalizedValue]}`;
  }

  if (organization === 6 && normalizedValue === "l") {
    return "ClassInd L";
  }

  return `${labelPrefix} ${cleanValue}`;
}

export function getValidAgeRatingLabels(ageRatings = []) {
  return ageRatings
    .map((ageRating) => {
      const organization = getAgeRatingOrganization(ageRating);
      const ratingValue = getAgeRatingValue(ageRating);

      if (typeof ratingValue === "string") {
        const label = normalizeAgeRatingText(organization, ratingValue);
        return label ? { label, organization } : null;
      }

      const label = AGE_RATING_LABELS_BY_ORGANIZATION[organization]?.[ratingValue];

      if (!label) {
        return null;
      }

      return {
        label,
        organization,
      };
    })
    .filter(Boolean);
}

export function getAgeRatingLabel(ageRatings = []) {
  const ratingsWithLabels = getValidAgeRatingLabels(ageRatings);

  for (const organization of AGE_RATING_ORGANIZATION_PRIORITY) {
    const rating = ratingsWithLabels.find((item) => item.organization === organization);
    if (rating) {
      return rating.label;
    }
  }

  return ratingsWithLabels[0]?.label ?? null;
}

export function isMatureAgeRating(ageRatings = [], themes = []) {
  const hasAdultTheme = themes.some((theme) => {
    const themeName = String(theme?.name ?? "").toLowerCase();
    return /\b(adult|erotic|hentai|porn|sexual)\b/.test(themeName);
  });
  if (hasAdultTheme) return true;

  return getValidAgeRatingLabels(ageRatings).some((item) =>
    ["ESRB AO", "PEGI 18", "CERO Z", "USK 18", "ACB R18+", "ACB RC", "GRAC 18", "ClassInd 18"].includes(item.label)
  );
}
