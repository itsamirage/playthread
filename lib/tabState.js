const TAB_ROOT_HREFS = {
  home: "/(tabs)",
  all: "/(tabs)/popular",
  browse: "/(tabs)/browse",
  profile: "/(tabs)/profile",
};

const lastRouteByTab = new Map(Object.entries(TAB_ROOT_HREFS));
const lastPressAtByTab = new Map();
let activeTabKey = "home";

export function getTabRootHref(tabKey) {
  return TAB_ROOT_HREFS[tabKey] ?? "/(tabs)";
}

export function resolveTabKeyFromPath(pathname) {
  if (!pathname || pathname === "/" || pathname === "/(tabs)" || pathname === "/(tabs)/index") {
    return "home";
  }

  if (pathname.startsWith("/(tabs)/popular")) {
    return "all";
  }

  if (pathname.startsWith("/(tabs)/browse")) {
    return "browse";
  }

  if (pathname.startsWith("/(tabs)/profile")) {
    return "profile";
  }

  return null;
}

export function setActiveTab(tabKey) {
  if (!tabKey) {
    return;
  }

  activeTabKey = tabKey;
}

export function getActiveTab() {
  return activeTabKey;
}

export function rememberTabRoute(tabKey, href) {
  if (!tabKey || !href) {
    return;
  }

  lastRouteByTab.set(tabKey, href);
}

export function getRememberedTabRoute(tabKey) {
  return lastRouteByTab.get(tabKey) ?? getTabRootHref(tabKey);
}

export function registerTabPress(tabKey, timestamp = Date.now(), thresholdMs = 450) {
  const lastPressedAt = lastPressAtByTab.get(tabKey) ?? 0;
  lastPressAtByTab.set(tabKey, timestamp);
  return timestamp - lastPressedAt <= thresholdMs;
}

export function bindRouteToTab(tabKey, href) {
  setActiveTab(tabKey);
  rememberTabRoute(tabKey, href);
}
