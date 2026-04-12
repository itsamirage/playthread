export function normalizeSearchValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function filterFlags(flags, { status = "all", origin = "all", search = "" } = {}) {
  const searchValue = normalizeSearchValue(search);

  return flags.filter((flag) => {
    if (status !== "all" && flag.status !== status) {
      return false;
    }

    if (origin !== "all" && flag.origin !== origin) {
      return false;
    }

    if (!searchValue) {
      return true;
    }

    return [flag.author, flag.reason, flag.gameTitle, flag.category, flag.origin].some((value) =>
      normalizeSearchValue(value).includes(searchValue)
    );
  });
}

export function filterIntegrityEvents(events, { eventType = "all", search = "" } = {}) {
  const searchValue = normalizeSearchValue(search);

  return events.filter((event) => {
    if (eventType !== "all" && event.eventType !== eventType) {
      return false;
    }

    if (!searchValue) {
      return true;
    }

    return [
      event.actor,
      event.target,
      event.requestIpHash,
      event.eventType,
      JSON.stringify(event.metadata),
    ].some((value) => normalizeSearchValue(value).includes(searchValue));
  });
}

export function paginateItems(items, page = 1, pageSize = 8) {
  const safePageSize = Math.max(1, Number(pageSize) || 1);
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const safePage = Math.min(pageCount, Math.max(1, Number(page) || 1));
  const start = (safePage - 1) * safePageSize;

  return {
    page: safePage,
    pageCount,
    items: items.slice(start, start + safePageSize),
  };
}

export function buildIntegritySignals(events, flags) {
  const signalMap = new Map();

  events.forEach((event) => {
    const key = [event.requestIpHash ?? "none", event.targetUserId ?? "none", event.eventType].join(":");
    const current =
      signalMap.get(key) ?? {
        key,
        requestIpHash: event.requestIpHash,
        target: event.target ?? null,
        eventType: event.eventType,
        eventCount: 0,
        positiveCount: 0,
        blockedCount: 0,
        actors: new Set(),
        targets: new Set(),
        lastSeenAt: event.createdAt,
      };

    current.eventCount += 1;
    current.positiveCount += event.isPositive ? 1 : 0;
    current.actors.add(event.actor);
    if (event.target) {
      current.targets.add(event.target);
    }
    current.lastSeenAt = current.lastSeenAt > event.createdAt ? current.lastSeenAt : event.createdAt;
    signalMap.set(key, current);
  });

  flags
    .filter((flag) => flag.origin === "integrity")
    .forEach((flag) => {
      const requestIpHash = flag.evidence?.request_ip_hash ?? "none";
      const eventType = flag.evidence?.event_type ?? "blocked";
      const key = [requestIpHash, flag.userId ?? "none", eventType].join(":");
      const current =
        signalMap.get(key) ?? {
          key,
          requestIpHash,
          target: null,
          eventType,
          eventCount: 0,
          positiveCount: 0,
          blockedCount: 0,
          actors: new Set(),
          targets: new Set(),
          lastSeenAt: flag.createdAt,
        };

      current.blockedCount += 1;
      current.actors.add(flag.author);
      current.lastSeenAt = current.lastSeenAt > flag.createdAt ? current.lastSeenAt : flag.createdAt;
      signalMap.set(key, current);
    });

  return [...signalMap.values()]
    .map((signal) => ({
      ...signal,
      actorCount: signal.actors.size,
      targetCount: signal.targets.size,
      score: signal.blockedCount * 5 + signal.positiveCount * 2 + signal.actorCount * 3 + signal.eventCount,
    }))
    .sort((left, right) => right.score - left.score || right.lastSeenAt.localeCompare(left.lastSeenAt))
    .slice(0, 12);
}

export function buildIntegrityOverview(dailySummary, blockedSummary) {
  const totals = {
    totalEvents: 0,
    totalPositiveEvents: 0,
    totalBlockedEvents: 0,
    distinctNetworks: 0,
    distinctActors: 0,
  };
  const networks = new Set();
  const actors = new Set();

  dailySummary.forEach((row) => {
    totals.totalEvents += Number(row.eventCount ?? 0);
    totals.totalPositiveEvents += Number(row.positiveCount ?? 0);
    networks.add(`${row.summaryDay}:${row.eventType}:${row.distinctNetworkCount ?? 0}`);
    actors.add(`${row.summaryDay}:${row.eventType}:${row.distinctActorCount ?? 0}`);
  });

  blockedSummary.forEach((row) => {
    totals.totalBlockedEvents += Number(row.blockedCount ?? 0);
    networks.add(`${row.summaryDay}:${row.blockedEventType}:blocked:${row.distinctNetworkCount ?? 0}`);
    actors.add(`${row.summaryDay}:${row.blockedEventType}:blocked:${row.distinctActorCount ?? 0}`);
  });

  totals.distinctNetworks = networks.size;
  totals.distinctActors = actors.size;
  return totals;
}

export function canModerateFlagContent(flag) {
  return Boolean(flag?.id) && ["post", "comment"].includes(String(flag?.contentType ?? ""));
}

export function formatActionType(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
