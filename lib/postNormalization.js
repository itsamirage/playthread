export function parsePostImageUrls(imageUrlsValue, fallbackImageUrl = null) {
  const fallbackUrls = fallbackImageUrl ? [fallbackImageUrl] : [];

  if (Array.isArray(imageUrlsValue)) {
    const urls = imageUrlsValue.map((value) => String(value ?? "").trim()).filter(Boolean);
    return urls.length > 0 ? urls : fallbackUrls;
  }

  if (typeof imageUrlsValue === "string") {
    const trimmedValue = imageUrlsValue.trim();

    if (!trimmedValue) {
      return fallbackUrls;
    }

    try {
      const parsedJson = JSON.parse(trimmedValue);

      if (Array.isArray(parsedJson)) {
        const urls = parsedJson.map((value) => String(value ?? "").trim()).filter(Boolean);
        if (urls.length > 0) {
          return urls;
        }
      }
    } catch {
      // Fall through to Postgres array parsing.
    }

    if (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) {
      const innerValue = trimmedValue.slice(1, -1);
      const urls = innerValue
        .split(",")
        .map((value) => value.trim().replace(/^"(.*)"$/, "$1"))
        .map((value) => value.replace(/\\"/g, '"'))
        .filter(Boolean);

      if (urls.length > 0) {
        return urls;
      }
    }

    return [trimmedValue];
  }

  return fallbackUrls;
}

export function normalizeNumericIdArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return [];
    }

    if (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) {
      return trimmedValue
        .slice(1, -1)
        .split(",")
        .map((item) => Number(item.trim().replace(/^"(.*)"$/, "$1")))
        .filter((item) => Number.isInteger(item) && item > 0);
    }

    return trimmedValue
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0);
  }

  return [];
}
