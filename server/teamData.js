import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEAM_KEY_ALIASES = {
  "Arizona Cardinals": "Arizona",
  "Atlanta Falcons": "Atlanta",
  "Baltimore Ravens": "Baltimore",
  "Buffalo Bills": "Buffalo",
  "Carolina Panthers": "Carolina",
  "Chicago Bears": "Chicago",
  "Cincinnati Bengals": "Cincinnati",
  "Cleveland Browns": "Cleveland",
  "Dallas Cowboys": "Dallas",
  "Denver Broncos": "Denver",
  "Detroit Lions": "Detroit",
  "Green Bay Packers": "Green Bay",
  "Houston Texans": "Houston",
  "Indianapolis Colts": "Indianapolis",
  "Jacksonville Jaguars": "Jacksonville",
  "Kansas City Chiefs": "Kansas City",
  "Las Vegas Raiders": "Las Vegas",
  "Los Angeles Chargers": "Los Angeles (AFC)",
  "Los Angeles Rams": "Los Angeles (NFC)",
  "Miami Dolphins": "Miami",
  "Minnesota Vikings": "Minnesota",
  "New England Patriots": "New England",
  "New Orleans Saints": "New Orleans",
  "New York Giants": "New York (NFC)",
  "New York Jets": "New York (AFC)",
  "Philadelphia Eagles": "Philadelphia",
  "Pittsburgh Steelers": "Pittsburgh",
  "San Francisco 49ers": "San Francisco",
  "Seattle Seahawks": "Seattle",
  "Tampa Bay Buccaneers": "Tampa Bay",
  "Tennessee Titans": "Tennessee",
  "Washington Commanders": "Washington",
};

let teamsCache = null;

async function getTeamsMap() {
  if (teamsCache) return teamsCache;

  const filePath = path.join(__dirname, "./teams.json");
  const file = await fs.readFile(filePath, "utf8");
  teamsCache = JSON.parse(file);
  return teamsCache;
}

export async function getTeamByPreferenceKey(teamKey) {
  if (!teamKey || typeof teamKey !== "string") return null;

  const teams = await getTeamsMap();
  return teams[teamKey] ?? teams[TEAM_KEY_ALIASES[teamKey]] ?? null;
}
