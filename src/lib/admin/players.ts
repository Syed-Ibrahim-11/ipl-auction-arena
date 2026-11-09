import { getDb } from "@/db";
import { CURRENT_PLAYER_SQL, CURRENT_TEAM_SQL, parseJson, roleLabel } from "@/lib/data/queries";
import {
  battingAverage,
  battingStrikeRate,
  economyRate,
  oversText,
} from "@/lib/data/stats";
import { ageFromBirthDate, marketValueFor, type MarketValue } from "@/lib/market-value";

type AdminPlayerDbRow = {
  id: string;
  full_name: string;
  short_name: string;
  role: string;
  country: string | null;
  nationality: string | null;
  is_overseas: number | null;
  capped: number | null;
  birth_date: string | null;
  team_id: string | null;
  team_short: string | null;
  ovr: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  evidence_quality: string | null;
  sample_json: string | null;
  matches: number | null;
  innings_bat: number | null;
  runs: number | null;
  balls_faced: number | null;
  dismissals: number | null;
  fours: number | null;
  sixes: number | null;
  fifties: number | null;
  hundreds: number | null;
  high_score: number | null;
  high_score_not_out: number | null;
  wickets: number | null;
  balls_bowled: number | null;
  runs_conceded: number | null;
  best_bowling_wickets: number | null;
  best_bowling_runs: number | null;
  first_season: number | null;
  last_season: number | null;
};

export type AdminPlayerCareer = {
  matches: number;
  innings: number;
  runs: number;
  ballsFaced: number;
  strikeRate: number | null;
  average: number | null;
  highScore: string | null;
  fifties: number;
  hundreds: number;
  fours: number;
  sixes: number;
  wickets: number;
  overs: string;
  economy: number | null;
  bestBowling: string | null;
  firstSeason: number | null;
  lastSeason: number | null;
};

export type AdminPlayerRow = {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  country: string | null;
  isOverseas: boolean;
  capped: boolean | null;
  age: number | null;
  teamId: string | null;
  teamShort: string | null;
  ovr: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  evidenceQuality: string | null;
  fairValue: MarketValue | null;
  career: AdminPlayerCareer;
};

export type AdminPlayerSort = "ovr" | "value" | "name" | "runs" | "wickets";

export const ADMIN_PLAYER_SORTS: Array<{ id: AdminPlayerSort; label: string }> = [
  { id: "ovr", label: "OVR (high to low)" },
  { id: "value", label: "Fair price (high to low)" },
  { id: "runs", label: "Career runs" },
  { id: "wickets", label: "Career wickets" },
  { id: "name", label: "Name (A–Z)" },
];

const ADMIN_PLAYER_SELECT = `
  SELECT p.id, p.full_name, p.short_name, p.role, p.country, p.nationality,
         p.is_overseas, p.capped, p.birth_date,
         ${CURRENT_TEAM_SQL} AS team_id,
         ct.short_name AS team_short,
         r.ovr, r.batting, r.bowling, r.fielding, r.evidence_quality, r.sample_json,
         c.matches, c.innings_bat, c.runs, c.balls_faced, c.dismissals,
         c.fours, c.sixes, c.fifties, c.hundreds, c.high_score, c.high_score_not_out,
         c.wickets, c.balls_bowled, c.runs_conceded,
         c.best_bowling_wickets, c.best_bowling_runs, c.first_season, c.last_season
  FROM players p
  LEFT JOIN player_ratings r ON r.player_id = p.id AND r.as_of_season = 2026
  LEFT JOIN player_career_stats c ON c.player_id = p.id
  LEFT JOIN teams ct ON ct.id = ${CURRENT_TEAM_SQL}
`;

function mapRow(row: AdminPlayerDbRow): AdminPlayerRow {
  const sample = parseJson<{ seasons?: number; lastSeason?: number | null }>(row.sample_json) ?? {};
  const age = ageFromBirthDate(row.birth_date);
  const fairValue = marketValueFor({
    ovr: row.ovr,
    batting: row.batting,
    bowling: row.bowling,
    role: row.role,
    age,
    evidenceQuality: row.evidence_quality,
    isOverseas: row.is_overseas === 1,
    seasons: sample.seasons ?? null,
    lastSeason: sample.lastSeason ?? null,
    asOfSeason: 2026,
  });
  const matches = row.matches ?? 0;
  const bestBowling =
    row.best_bowling_wickets !== null && row.best_bowling_runs !== null
      ? `${row.best_bowling_wickets}/${row.best_bowling_runs}`
      : null;
  return {
    id: row.id,
    name: row.full_name,
    role: row.role,
    roleLabel: roleLabel(row.role),
    country: row.country ?? row.nationality,
    isOverseas: row.is_overseas === 1,
    capped: row.capped === null ? null : row.capped === 1,
    age,
    teamId: row.team_id,
    teamShort: row.team_short,
    ovr: row.ovr,
    batting: row.batting,
    bowling: row.bowling,
    fielding: row.fielding,
    evidenceQuality: row.evidence_quality,
    fairValue: row.ovr === null ? null : fairValue,
    career: {
      matches,
      innings: row.innings_bat ?? 0,
      runs: row.runs ?? 0,
      ballsFaced: row.balls_faced ?? 0,
      strikeRate: battingStrikeRate(row.runs ?? 0, row.balls_faced ?? 0),
      average: battingAverage(row.runs ?? 0, row.dismissals ?? 0),
      highScore:
        matches > 0 && (row.high_score ?? 0) > 0
          ? `${row.high_score}${row.high_score_not_out === 1 ? "*" : ""}`
          : null,
      fifties: row.fifties ?? 0,
      hundreds: row.hundreds ?? 0,
      fours: row.fours ?? 0,
      sixes: row.sixes ?? 0,
      wickets: row.wickets ?? 0,
      overs: oversText(row.balls_bowled ?? 0),
      economy: economyRate(row.runs_conceded ?? 0, row.balls_bowled ?? 0),
      bestBowling,
      firstSeason: row.first_season,
      lastSeason: row.last_season,
    },
  };
}

function sortRows(rows: AdminPlayerRow[], sort: AdminPlayerSort): AdminPlayerRow[] {
  const byName = (a: AdminPlayerRow, b: AdminPlayerRow) => a.name.localeCompare(b.name);
  switch (sort) {
    case "name":
      return [...rows].sort(byName);
    case "value":
      return [...rows].sort(
        (a, b) => (b.fairValue?.valueLakh ?? -1) - (a.fairValue?.valueLakh ?? -1) || byName(a, b),
      );
    case "runs":
      return [...rows].sort((a, b) => b.career.runs - a.career.runs || byName(a, b));
    case "wickets":
      return [...rows].sort((a, b) => b.career.wickets - a.career.wickets || byName(a, b));
    default:
      return [...rows].sort((a, b) => (b.ovr ?? -1) - (a.ovr ?? -1) || byName(a, b));
  }
}

export type AdminPlayerQuery = {
  q?: string;
  role?: string;
  sort?: AdminPlayerSort;
  page?: number;
  pageSize?: number;
};

export function loadAdminPlayers(query: AdminPlayerQuery): {
  players: AdminPlayerRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  rated: number;
  poolTotal: number;
  roles: Array<{ id: string; label: string; count: number }>;
} {
  const rows = getDb()
    .prepare(`${ADMIN_PLAYER_SELECT} WHERE ${CURRENT_PLAYER_SQL} ORDER BY r.ovr DESC NULLS LAST, p.full_name`)
    .all() as AdminPlayerDbRow[];
  const mapped = rows.map(mapRow);

  const term = query.q?.trim().toLowerCase() ?? "";
  const filtered = mapped.filter((player) => {
    if (query.role && query.role !== "all" && player.role !== query.role) return false;
    if (!term) return true;
    return (
      player.name.toLowerCase().includes(term) ||
      (player.teamShort ?? "").toLowerCase().includes(term)
    );
  });

  const sorted = sortRows(filtered, query.sort ?? "ovr");

  const pageSize = Math.min(Math.max(query.pageSize ?? 30, 10), 60);
  const page = Math.max(query.page ?? 1, 1);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pages);
  const offset = (safePage - 1) * pageSize;

  const roleCounts = new Map<string, number>();
  for (const player of mapped) roleCounts.set(player.role, (roleCounts.get(player.role) ?? 0) + 1);

  return {
    players: sorted.slice(offset, offset + pageSize),
    total: sorted.length,
    page: safePage,
    pageSize,
    pages,
    rated: mapped.filter((player) => player.ovr !== null).length,
    poolTotal: mapped.length,
    roles: [...roleCounts.entries()]
      .map(([id, count]) => ({ id, label: roleLabel(id), count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function loadAdminPlayer(playerId: string): AdminPlayerRow | null {
  const row = getDb().prepare(`${ADMIN_PLAYER_SELECT} WHERE p.id = ?`).get(playerId) as
    | AdminPlayerDbRow
    | undefined;
  return row ? mapRow(row) : null;
}
