import { getCachedValue } from "./cache.js";
import { fetchTeamPlayers, fetchTeamSchedule, fetchTeamStats, DEFAULT_SEASON } from "./fetch.js";

const CACHE_TTL = {
  stats: 1000 * 60 * 30,
  players: 1000 * 60 * 30,
  schedule: 1000 * 60 * 60 * 6,
};

/**
 * Load preferred team data from ESPN and cache each data type independently.
 * `include` controls which payloads are fetched.
 */
export async function getPreferredData({ team, season = DEFAULT_SEASON, include = new Set(["stats", "players", "schedule"]) }) {
  if (!team?.id) {
    return { stats: null, players: [], schedule: [] };
  }

  const teamId = Number(team.id);
  const safeSeason = Number.isFinite(Number(season)) ? Number(season) : DEFAULT_SEASON;

  const wantsStats = include.has("stats");
  const wantsPlayers = include.has("players");
  const wantsSchedule = include.has("schedule");

  const [stats, players, schedule] = await Promise.all([
    wantsStats
      ? getCachedValue(`espn:stats:${safeSeason}:${teamId}`, CACHE_TTL.stats, async () => {
          const data = await fetchTeamStats(teamId, safeSeason);
          return data?.ok === "yes" ? data : null;
        })
      : Promise.resolve(null),
    wantsPlayers
      ? getCachedValue(`espn:players:${safeSeason}:${teamId}`, CACHE_TTL.players, async () => {
          return await fetchTeamPlayers(teamId, safeSeason);
        })
      : Promise.resolve([]),
    wantsSchedule
      ? getCachedValue(`espn:schedule:${safeSeason}:${teamId}`, CACHE_TTL.schedule, async () => {
          return await fetchTeamSchedule(teamId, safeSeason);
        })
      : Promise.resolve([]),
  ]);

  return { stats, players, schedule };
}
