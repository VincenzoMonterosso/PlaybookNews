import { fetchData, teamCodeFromId } from "./fetch.js";
import { getCachedValue } from "./cache.js";

const SPORTSDATA_BASE = "https://api.sportsdata.io/v3/nfl";

const CACHE_TTL = {
  stats: 1000 * 60 * 30,
  players: 1000 * 60 * 30,
  schedule: 1000 * 60 * 60 * 6,
};

function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sportsDataKey() {
  return (
    process.env.SPORTSDATA ||
    process.env.SPORTSDATA_API_KEY ||
    process.env.SPORTSDATAIO_API_KEY ||
    ""
  );
}

async function fetchSportsData(pathname) {
  const key = sportsDataKey();
  if (!key) return null;

  const url = `${SPORTSDATA_BASE}${pathname}`;
  const res = await fetch(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": key,
    },
  });

  if (!res.ok) return null;
  return res.json();
}

function normalizePlayers(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row) => row?.Played)
    .map((row) => {
      const touchdowns =
        toNumber(row.PassingTouchdowns) +
        toNumber(row.RushingTouchdowns) +
        toNumber(row.ReceivingTouchdowns) +
        toNumber(row.KickReturnTouchdowns) +
        toNumber(row.PuntReturnTouchdowns) +
        toNumber(row.InterceptionReturnTouchdowns) +
        toNumber(row.FumbleReturnTouchdowns);

      return {
        name: row.Name || "Unknown",
        number: row.Number ?? null,
        position: row.Position || "--",
        gamesPlayed: toNumber(row.Played),
        passingYards: toNumber(row.PassingYards),
        rushingYards: toNumber(row.RushingYards),
        receivingYards: toNumber(row.ReceivingYards),
        totalTouchdowns: touchdowns,
        tackles: toNumber(row.Tackles),
        sacks: toNumber(row.Sacks),
        interceptions: toNumber(row.Interceptions),
        fantasyPoints: toNumber(row.FantasyPoints),
      };
    })
    .sort((a, b) => {
      if (b.fantasyPoints !== a.fantasyPoints) return b.fantasyPoints - a.fantasyPoints;
      if (b.totalTouchdowns !== a.totalTouchdowns) return b.totalTouchdowns - a.totalTouchdowns;
      return b.receivingYards + b.rushingYards + b.passingYards - (a.receivingYards + a.rushingYards + a.passingYards);
    })
    .slice(0, 20);
}

function normalizeSchedule(rows, teamCode) {
  if (!Array.isArray(rows) || !teamCode) return [];

  const filtered = rows.filter((game) => game?.HomeTeam === teamCode || game?.AwayTeam === teamCode);

  filtered.sort((a, b) => {
    if (toNumber(a.Week) !== toNumber(b.Week)) return toNumber(a.Week) - toNumber(b.Week);
    return new Date(a.DateTime || a.Date || 0).getTime() - new Date(b.DateTime || b.Date || 0).getTime();
  });

  return filtered.map((game) => {
    const isHome = game.HomeTeam === teamCode;
    const opponent = isHome ? game.AwayTeam : game.HomeTeam;
    return {
      week: toNumber(game.Week),
      dateTime: game.DateTime || game.Date || null,
      status: game.Status || "Scheduled",
      channel: game.Channel || "--",
      homeAway: isHome ? "Home" : "Away",
      opponent,
    };
  });
}

async function loadPreferredStats(teamId, season) {
  const data = await fetchData(teamId, season);
  return data?.ok === "yes" ? data : null;
}

async function loadPreferredPlayers(teamCode, season) {
  const data = await fetchSportsData(`/stats/json/PlayerSeasonStatsByTeam/${Number(season)}/${encodeURIComponent(teamCode)}`);
  return normalizePlayers(data);
}

async function loadPreferredSchedule(teamCode, season) {
  const data = await fetchSportsData(`/scores/json/Schedules/${Number(season)}`);
  return normalizeSchedule(data, teamCode);
}

export async function getPreferredData({ team, season = 2025, include = new Set(["stats", "players", "schedule"]) }) {
  if (!team?.id) {
    return { stats: null, players: [], schedule: [] };
  }

  const teamId = Number(team.id);
  const teamCode = teamCodeFromId(teamId);
  const safeSeason = Number.isFinite(Number(season)) ? Number(season) : 2025;

  const wantsStats = include.has("stats");
  const wantsPlayers = include.has("players");
  const wantsSchedule = include.has("schedule");

  const [stats, players, schedule] = await Promise.all([
    wantsStats
      ? getCachedValue(`stats:${safeSeason}:${teamId}`, CACHE_TTL.stats, () => loadPreferredStats(teamId, safeSeason))
      : Promise.resolve(null),
    wantsPlayers && teamCode
      ? getCachedValue(`players:${safeSeason}:${teamCode}`, CACHE_TTL.players, () => loadPreferredPlayers(teamCode, safeSeason))
      : Promise.resolve([]),
    wantsSchedule && teamCode
      ? getCachedValue(`schedule:${safeSeason}:${teamCode}`, CACHE_TTL.schedule, () => loadPreferredSchedule(teamCode, safeSeason))
      : Promise.resolve([]),
  ]);

  return { stats, players, schedule };
}
