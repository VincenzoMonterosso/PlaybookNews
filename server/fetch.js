import "dotenv/config";

const SPORTSDATA_BASE = "https://api.sportsdata.io/v3/nfl/stats/json";
const ESPN_TO_TEAM_CODE = {
  1: "ATL",
  2: "BUF",
  3: "CHI",
  4: "CIN",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GB",
  10: "TEN",
  11: "IND",
  12: "KC",
  13: "LV",
  14: "LAR",
  15: "MIA",
  16: "MIN",
  17: "NE",
  18: "NO",
  19: "NYG",
  20: "NYJ",
  21: "PHI",
  22: "ARI",
  23: "PIT",
  24: "LAC",
  25: "SF",
  26: "SEA",
  27: "TB",
  28: "WAS",
  29: "CAR",
  30: "JAX",
  33: "BAL",
  34: "HOU",
};

export function teamCodeFromId(teamId) {
  return ESPN_TO_TEAM_CODE[Number(teamId)] ?? null;
}

function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fieldGoalPct(stats) {
  const made = toNumber(stats?.FieldGoalsMade);
  const attempts = toNumber(stats?.FieldGoalAttempts);
  if (made === null || attempts === null || attempts <= 0) return null;
  return Math.round((made / attempts) * 1000) / 10;
}

export async function fetchData(teamId, year) {
  try {
    const apiKey =
      process.env.SPORTSDATA ||
      process.env.SPORTSDATA_API_KEY ||
      process.env.SPORTSDATAIO_API_KEY;
    const teamCode = teamCodeFromId(teamId);

    if (!apiKey || !teamCode || !Number.isFinite(Number(year))) {
      return { ok: "no" };
    }

    const url = `${SPORTSDATA_BASE}/TeamSeasonStats/${Number(year)}`;
    const res = await fetch(url, {
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
      },
    });

    if (!res.ok) {
      return { ok: "no" };
    }

    const allTeams = await res.json();
    if (!Array.isArray(allTeams)) {
      return { ok: "no" };
    }

    const stats = allTeams.find((entry) => entry?.Team === teamCode);
    if (!stats) {
      return { ok: "no" };
    }

    return {
      ok: "yes",
      "Passing Yards": toNumber(stats.PassingYards),
      "Rushing Yards": toNumber(stats.RushingYards),
      "Opponent Passing Yards": toNumber(stats.OpponentPassingYards),
      "Opponent Rushing Yards": toNumber(stats.OpponentRushingYards),
      "Completion Percentage": toNumber(stats.CompletionPercentage),
      "Pass Yards per Attempt": toNumber(stats.PassingYardsPerAttempt),
      Interceptions: toNumber(stats.PassingInterceptions),
      "Pass Touchdowns": toNumber(stats.PassingTouchdowns),
      Attempts: toNumber(stats.RushingAttempts),
      "Rush Yards per Attempt": toNumber(stats.RushingYardsPerAttempt),
      "Fumbles Lost": toNumber(stats.FumblesLost),
      "Rushing Touchdowns": toNumber(stats.RushingTouchdowns),
      "Field Goal%": fieldGoalPct(stats),
      "Average Return Yards": toNumber(stats.KickReturnYards),
      "Punt Yards": toNumber(stats.PuntYards),
    };
  } catch {
    return { ok: "no" };
  }
}
