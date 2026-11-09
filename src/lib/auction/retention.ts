import type { Db } from "./internal";

export interface RetainedPlayer {
  teamId: string;
  playerId: string;
  fullName: string;
  role: string;
  priceLakh: number;
  rating: number | null;
  /** True when the charge is an official 2026 auction price rather than an estimate. */
  verified: boolean;
}

export const RETENTION_NOTE =
  "The supplied data contains 2026 appearance rosters, not official retention contracts. Retained squads exclude the 77 supplied auction players; each retention price is a transparent simulator estimate derived from pre-auction rating, role and overseas status.";

const RETENTION_MIN_SPEND_LAKH = 3_800;
const RETENTION_MAX_SPEND_LAKH = 7_200;

interface AppearanceRow {
  team_id: string;
  player_id: string;
  full_name: string;
  role: string;
  is_overseas: number | null;
  capped: number | null;
  ovr: number | null;
}

function rawRetentionLakh(row: AppearanceRow): number {
  const ovr = row.ovr;
  let raw: number;
  if (ovr === null) raw = 80;
  else if (ovr >= 88) raw = 1_200;
  else if (ovr >= 82) raw = 950;
  else if (ovr >= 76) raw = 750;
  else if (ovr >= 70) raw = 550;
  else if (ovr >= 64) raw = 380;
  else if (ovr >= 58) raw = 260;
  else raw = 140;
  if (row.is_overseas === 1) raw *= 1.06;
  if (row.capped === 0) raw *= 0.92;
  return raw;
}

function roundToFive(value: number): number {
  return Math.max(30, Math.round(value / 5) * 5);
}

export function buildRetainedSquads(
  db: Db,
  asOfSeason: number,
  maxSquad: number,
): Map<string, RetainedPlayer[]> {
  const rows = db
    .prepare(
      `WITH appearances AS (
         SELECT pm.team_id, pm.player_id,
                COUNT(*) AS games,
                MAX(pm.date) AS last_date,
                ROW_NUMBER() OVER (
                  PARTITION BY pm.player_id
                  ORDER BY COUNT(*) DESC, MAX(pm.date) DESC, pm.team_id
                ) AS rn
         FROM player_match_stats pm
         WHERE pm.season = 2026
         GROUP BY pm.team_id, pm.player_id
       )
       SELECT a.team_id, p.id AS player_id, p.full_name, p.role, p.is_overseas, p.capped, r.ovr
       FROM appearances a
       JOIN players p ON p.id = a.player_id
       LEFT JOIN player_rating_versions r
         ON r.player_id = p.id AND r.as_of_season = ?
       WHERE a.rn = 1
         AND p.id NOT IN (SELECT player_id FROM auction_players)
       ORDER BY a.team_id, r.ovr DESC, p.full_name`,
    )
    .all(asOfSeason) as AppearanceRow[];

  const grouped = new Map<string, AppearanceRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.team_id) ?? [];
    list.push(row);
    grouped.set(row.team_id, list);
  }

  const result = new Map<string, RetainedPlayer[]>();
  for (const [teamId, list] of grouped) {
    const trimmed = list.slice(0, maxSquad);
    const rawTotal = trimmed.reduce((sum, row) => sum + rawRetentionLakh(row), 0);
    if (rawTotal <= 0) {
      result.set(teamId, []);
      continue;
    }
    const target = Math.min(
      RETENTION_MAX_SPEND_LAKH,
      Math.max(RETENTION_MIN_SPEND_LAKH, rawTotal),
    );
    const scale = target / rawTotal;
    const players = trimmed.map((row) => ({
      teamId,
      playerId: row.player_id,
      fullName: row.full_name,
      role: row.role,
      priceLakh: roundToFive(rawRetentionLakh(row) * scale),
      rating: row.ovr,
      verified: false,
    }));

    // Scale again after rounding so the team total stays inside the announced band.
    const roundedTotal = players.reduce((sum, player) => sum + player.priceLakh, 0);
    if (roundedTotal > RETENTION_MAX_SPEND_LAKH) {
      const correction = RETENTION_MAX_SPEND_LAKH / roundedTotal;
      for (const player of players) player.priceLakh = roundToFive(player.priceLakh * correction);
    }
    result.set(teamId, players);
  }
  return result;
}

export function retainedValueLakh(players: RetainedPlayer[]): number {
  return players.reduce((sum, player) => sum + player.priceLakh, 0);
}
