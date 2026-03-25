import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let teamsCache = null;

async function getTeamsMap() {
  if (teamsCache) return teamsCache;

  const filePath = path.join(__dirname, "./teams.json");
  const file = await fs.readFile(filePath, "utf8");
  teamsCache = JSON.parse(file);
  return teamsCache;
}

export async function getTeamByPreferenceKey(teamKey) {
  // Keep one function for team lookup so every route checks team keys the same way.
  if (!teamKey || typeof teamKey !== "string") return null;

  const teams = await getTeamsMap();
  return teams[teamKey.trim()] ?? null;
}
