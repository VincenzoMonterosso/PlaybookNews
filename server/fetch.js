const ESPN_SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const ESPN_COMMON_BASE = "https://site.api.espn.com/apis/common/v3/sports/football/nfl";
const DEFAULT_SEASON = 2025;
const PLAYER_FETCH_CONCURRENCY = 8;

/**
 * Fetch JSON from ESPN public APIs.
 * Returns null when the request fails.
 */
async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Parse ESPN stat values which are often strings like "3,981".
 * Returns null for missing/invalid values.
 */
function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Turn a category stats row into a { statName: number } map.
 */
function statsRowToMap(category, row) {
  const names = Array.isArray(category?.names) ? category.names : [];
  const raw = Array.isArray(row?.stats) ? row.stats : [];
  const out = {};
  for (let i = 0; i < names.length && i < raw.length; i += 1) {
    out[names[i]] = toNumber(raw[i]);
  }
  return out;
}

/**
 * Pick a category row for the target season and team.
 */
function getSeasonTeamRow(category, season, teamId) {
  const rows = Array.isArray(category?.statistics) ? category.statistics : [];
  const teamKey = String(teamId);
  return rows.find((row) => Number(row?.season?.year) === Number(season) && String(row?.teamId) === teamKey) ?? null;
}

/**
 * Build a category map keyed by category name for one player.
 */
function buildPlayerCategoryMaps(payload, season, teamId) {
  const categories = Array.isArray(payload?.categories) ? payload.categories : [];
  const out = {};

  for (const category of categories) {
    const row = getSeasonTeamRow(category, season, teamId);
    out[category.name] = row ? statsRowToMap(category, row) : {};
  }

  return out;
}

/**
 * Normalize ESPN player payload into the UI format used by stats.html.
 */
function normalizePlayer(athlete, categoryMaps) {
  const passing = categoryMaps.passing ?? {};
  const rushing = categoryMaps.rushing ?? {};
  const receiving = categoryMaps.receiving ?? {};
  const defensive = categoryMaps.defensive ?? {};
  const scoring = categoryMaps.scoring ?? {};

  const passingTds = passing.passingTouchdowns ?? 0;
  const rushingTds = rushing.rushingTouchdowns ?? 0;
  const receivingTds = receiving.receivingTouchdowns ?? 0;
  const summedTouchdowns = passingTds + rushingTds + receivingTds;
  const totalTouchdowns = summedTouchdowns > 0 ? summedTouchdowns : scoring.totalTouchdowns ?? 0;

  const gamesPlayed =
    passing.gamesPlayed ??
    rushing.gamesPlayed ??
    receiving.gamesPlayed ??
    defensive.gamesPlayed ??
    scoring.gamesPlayed ??
    0;

  return {
    name: athlete?.fullName || "Unknown",
    number: athlete?.jersey ? Number(athlete.jersey) : null,
    position: athlete?.position?.abbreviation || "--",
    gamesPlayed: toNumber(gamesPlayed) ?? 0,
    passingYards: toNumber(passing.passingYards) ?? 0,
    rushingYards: toNumber(rushing.rushingYards) ?? 0,
    receivingYards: toNumber(receiving.receivingYards) ?? 0,
    totalTouchdowns: toNumber(totalTouchdowns) ?? 0,
    tackles: toNumber(defensive.totalTackles) ?? 0,
    sacks: toNumber(defensive.sacks) ?? 0,
    interceptions: toNumber(defensive.interceptions) ?? 0,
    fantasyPoints: 0,
  };
}

/**
 * Utility to process async work with bounded concurrency.
 */
async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Fetch and normalize team-level stats from ESPN.
 */
export async function fetchTeamStats(teamId, season = DEFAULT_SEASON) {
  const payload = await fetchJson(`${ESPN_SITE_BASE}/teams/${Number(teamId)}/statistics?season=${Number(season)}&seasontype=2`);
  const categories = Array.isArray(payload?.results?.stats?.categories) ? payload.results.stats.categories : [];
  if (categories.length === 0) return null;

  const byCategory = {};
  for (const category of categories) {
    const stats = Array.isArray(category?.stats) ? category.stats : [];
    const statMap = {};
    for (const stat of stats) {
      statMap[stat?.name] = toNumber(stat?.value);
    }
    byCategory[category.name] = statMap;
  }

  const passing = byCategory.passing ?? {};
  const rushing = byCategory.rushing ?? {};
  const misc = byCategory.miscellaneous ?? {};
  const kicking = byCategory.kicking ?? {};
  const returning = byCategory.returning ?? {};
  const punting = byCategory.punting ?? {};

  return {
    ok: "yes",
    "Passing Yards": passing.passingYards ?? null,
    "Rushing Yards": rushing.rushingYards ?? null,
    "Net Passing Yards": passing.netPassingYards ?? null,
    "Passing Yards per Game": passing.passingYardsPerGame ?? null,
    "Completion Percentage": passing.completionPct ?? null,
    "Pass Yards per Attempt": passing.yardsPerPassAttempt ?? null,
    Interceptions: passing.interceptions ?? null,
    "Pass Touchdowns": passing.passingTouchdowns ?? null,
    Attempts: rushing.rushingAttempts ?? null,
    "Rush Yards per Attempt": rushing.yardsPerRushAttempt ?? null,
    "Fumbles Lost": misc.fumblesLost ?? rushing.rushingFumblesLost ?? null,
    "Rushing Touchdowns": rushing.rushingTouchdowns ?? null,
    "Field Goal%": kicking.fieldGoalPct ?? null,
    "Average Return Yards": returning.yardsPerKickReturn ?? null,
    "Punt Yards": punting.puntYards ?? null,
  };
}

/**
 * Fetch and normalize team schedule from ESPN.
 */
export async function fetchTeamSchedule(teamId, season = DEFAULT_SEASON) {
  const payload = await fetchJson(`${ESPN_SITE_BASE}/teams/${Number(teamId)}/schedule?season=${Number(season)}&seasontype=2`);
  const events = Array.isArray(payload?.events) ? payload.events : [];

  return events
    .map((event) => {
      const competition = Array.isArray(event?.competitions) ? event.competitions[0] : null;
      const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
      const teamCompetitor = competitors.find((c) => Number(c?.team?.id) === Number(teamId));
      const opponentCompetitor = competitors.find((c) => Number(c?.team?.id) !== Number(teamId));
      const homeAway = teamCompetitor?.homeAway === "home" ? "Home" : "Away";
      const opponent = opponentCompetitor?.team?.abbreviation || opponentCompetitor?.team?.shortDisplayName || "--";
      const channel = Array.isArray(competition?.broadcasts) ? competition.broadcasts[0]?.names?.[0] || "--" : "--";

      return {
        week: toNumber(event?.week?.number),
        dateTime: event?.date || null,
        status: event?.status?.type?.description || event?.status?.type?.name || "Scheduled",
        channel,
        homeAway,
        opponent,
      };
    })
    .sort((a, b) => (toNumber(a.week) ?? 0) - (toNumber(b.week) ?? 0));
}

/**
 * Fetch and normalize top team players from ESPN.
 */
export async function fetchTeamPlayers(teamId, season = DEFAULT_SEASON) {
  const rosterPayload = await fetchJson(`${ESPN_SITE_BASE}/teams/${Number(teamId)}/roster`);
  const groups = Array.isArray(rosterPayload?.athletes) ? rosterPayload.athletes : [];
  const athletes = groups.flatMap((group) => (Array.isArray(group?.items) ? group.items : []));
  if (athletes.length === 0) return [];

  const players = await mapWithConcurrency(athletes, PLAYER_FETCH_CONCURRENCY, async (athlete) => {
    const athleteId = Number(athlete?.id);
    if (!Number.isFinite(athleteId)) return null;

    const statsPayload = await fetchJson(
      `${ESPN_COMMON_BASE}/athletes/${athleteId}/stats?season=${Number(season)}&seasontype=2`
    );
    if (!statsPayload) return null;

    const categoryMaps = buildPlayerCategoryMaps(statsPayload, season, teamId);
    const player = normalizePlayer(athlete, categoryMaps);
    const usageScore = (player.passingYards ?? 0) + (player.rushingYards ?? 0) + (player.receivingYards ?? 0) + (player.tackles ?? 0);
    if (usageScore <= 0 && (player.totalTouchdowns ?? 0) <= 0) return null;
    return player;
  });

  return players
    .filter(Boolean)
    .sort((a, b) => {
      if (b.totalTouchdowns !== a.totalTouchdowns) return b.totalTouchdowns - a.totalTouchdowns;
      const bYards = b.passingYards + b.rushingYards + b.receivingYards;
      const aYards = a.passingYards + a.rushingYards + a.receivingYards;
      if (bYards !== aYards) return bYards - aYards;
      return b.tackles - a.tackles;
    })
    .slice(0, 20);
}

export { DEFAULT_SEASON };
