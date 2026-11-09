import fs from "node:fs";
import path from "node:path";
import { parseCsvObjects } from "./csv";
import { getFranchise, teamIdFromName } from "@/lib/teams";

export type OpenIplMatchMeta = {
  cricsheetMatchId: string;
  matchNumber: number | null;
  stage: string | null;
  method: string | null;
  targetOvers: number | null;
  dlsRevisedTarget: number | null;
  umpires: string[];
  matchReferee: string | null;
};

export type OpenIplPlayer = {
  name: string;
  teamId: string;
  role: string;
  matches: number;
  cricsheetId: string | null;
};

export type OpenIplPointsRow = {
  position: number;
  teamId: string;
  played: number;
  won: number;
  lost: number;
  noResult: number;
  netRunRate: number | null;
  points: number;
};

export type OpenIplData = {
  season: number;
  matches: OpenIplMatchMeta[];
  players: OpenIplPlayer[];
  pointsTable: OpenIplPointsRow[];
  registry: Map<string, string>;
  warnings: string[];
  stats: {
    matchRows: number;
    playerRows: number;
    registryRows: number;
    duplicatePlayerNames: number;
    playersWithoutRegistry: number;
    pointsRows: number;
  };
};

const KNOWN_ROLES = new Set(["batter", "bowler", "all-rounder", "wicketkeeper"]);

export function parseOpenIpl(rootDir: string, season = 2026): OpenIplData {
  const seasonDir = path.join(rootDir, String(season));
  const warnings: string[] = [];
  const read = (file: string): Record<string, string>[] => {
    const full = path.join(seasonDir, file);
    if (!fs.existsSync(full)) {
      warnings.push(`Missing openIPL file: ${path.relative(process.cwd(), full)}`);
      return [];
    }
    return parseCsvObjects(fs.readFileSync(full, "utf8"));
  };

  const matchRows = read("matches.csv");
  const playerRows = read("players.csv");
  const registryRows = read("player_registry.csv");
  const pointsRows = read("points_table.csv");

  const registry = new Map<string, string>();
  const registryByCricsheet = new Map<string, string>();
  for (const row of registryRows) {
    const name = row.player?.trim();
    const id = row.cricsheet_id?.trim();
    if (!name || !id) continue;
    if (registry.has(name) && registry.get(name) !== id) {
      warnings.push(`openIPL registry has conflicting Cricsheet IDs for ${name}`);
    }
    registry.set(name, id);
    registryByCricsheet.set(id, name);
  }

  const matches: OpenIplMatchMeta[] = [];
  for (const row of matchRows) {
    const cricsheetMatchId = row.cricsheet_match_id?.trim();
    if (!cricsheetMatchId) {
      warnings.push("openIPL match row without cricsheet_match_id");
      continue;
    }
    for (const key of ["team_1", "team_2", "winner", "toss_winner"]) {
      const value = row[key]?.trim();
      if (value && value !== "No result" && !getFranchise(teamIdFromName(value))) {
        warnings.push(`Unknown openIPL team "${value}" in match ${cricsheetMatchId} (${key})`);
      }
    }
    const targetOvers = Number(row.target_overs);
    const revised = Number(row.dls_revised_target);
    matches.push({
      cricsheetMatchId,
      matchNumber: row.match_number ? Number(row.match_number) : null,
      stage: row.match_stage?.trim() || null,
      method: row.method?.trim() || null,
      targetOvers: Number.isFinite(targetOvers) && row.target_overs ? targetOvers : null,
      dlsRevisedTarget: Number.isFinite(revised) && row.dls_revised_target ? revised : null,
      umpires: [row.umpire_1, row.umpire_2, row.tv_umpire].map((v) => v?.trim()).filter(Boolean),
      matchReferee: row.match_referee?.trim() || null,
    });
  }

  const players: OpenIplPlayer[] = [];
  const seenNames = new Set<string>();
  let duplicatePlayerNames = 0;
  let playersWithoutRegistry = 0;
  for (const row of playerRows) {
    const name = row.player?.trim();
    const rawTeam = row.team?.trim();
    if (!name || !rawTeam) {
      warnings.push("openIPL player row missing name or team");
      continue;
    }
    if (seenNames.has(name)) {
      duplicatePlayerNames += 1;
      warnings.push(`Duplicate openIPL player row for ${name}; keeping the first`);
      continue;
    }
    seenNames.add(name);
    const teamId = teamIdFromName(rawTeam);
    if (!getFranchise(teamId)) {
      warnings.push(`Unknown openIPL team "${rawTeam}" for player ${name}`);
      continue;
    }
    const role = (row.role?.trim() || "unknown").toLowerCase();
    if (!KNOWN_ROLES.has(role)) warnings.push(`Unrecognised openIPL role "${role}" for ${name}`);
    const cricsheetId = registry.get(name) ?? null;
    if (!cricsheetId) {
      playersWithoutRegistry += 1;
      warnings.push(`openIPL player ${name} has no Cricsheet registry ID`);
    }
    const matchCount = Number(row.matches);
    players.push({
      name,
      teamId,
      role,
      matches: Number.isFinite(matchCount) ? matchCount : 0,
      cricsheetId,
    });
  }

  const pointsTable: OpenIplPointsRow[] = [];
  const seenTeams = new Set<string>();
  for (const row of pointsRows) {
    const rawTeam = row.team?.trim();
    if (!rawTeam) continue;
    const teamId = teamIdFromName(rawTeam);
    if (!getFranchise(teamId)) {
      warnings.push(`Unknown openIPL points-table team "${rawTeam}"`);
      continue;
    }
    if (seenTeams.has(teamId)) {
      warnings.push(`Duplicate points-table row for ${rawTeam}`);
      continue;
    }
    seenTeams.add(teamId);
    const played = Number(row.played);
    const won = Number(row.won);
    const lost = Number(row.lost);
    const noResult = Number(row.no_result);
    const points = Number(row.points);
    const nrr = Number(row.net_run_rate);
    if (won + lost + noResult !== played) {
      warnings.push(`Points-table arithmetic mismatch for ${rawTeam}: W+L+NR != played`);
    }
    if (won * 2 + noResult !== points) {
      warnings.push(`Points-table points mismatch for ${rawTeam}`);
    }
    pointsTable.push({
      position: Number(row.position),
      teamId,
      played,
      won,
      lost,
      noResult,
      netRunRate: Number.isFinite(nrr) ? nrr : null,
      points,
    });
  }
  pointsTable.sort((a, b) => a.position - b.position);

  return {
    season,
    matches,
    players,
    pointsTable,
    registry,
    warnings,
    stats: {
      matchRows: matchRows.length,
      playerRows: playerRows.length,
      registryRows: registryRows.length,
      duplicatePlayerNames,
      playersWithoutRegistry,
      pointsRows: pointsRows.length,
    },
  };
}
