import type { Db } from "./internal";

/**
 * Franchise legacy for one player, keyed by team.
 *
 * The auction AI treats a genuine long-service association as a reason to pay
 * above fair value. Strength is 0..1 and blends how much of a career was spent
 * at the franchise with how long that association lasted, so a one-season
 * signing is a nudge while a 15-year icon is a near-unbreakable attachment.
 */
export type FranchiseLegacy = Map<string, number>;

interface CareerTeamRow {
  team_id: string;
  matches: number;
  seasons: number;
}

/**
 * Strength for a single franchise association.
 * Exported for tests; the loader below is the only runtime caller.
 */
export function legacyStrength(args: {
  matches: number;
  seasons: number;
  careerMatches: number;
}): number {
  const { matches, seasons, careerMatches } = args;
  if (matches <= 0 && seasons <= 0) return 0;
  const share = careerMatches > 0 ? Math.min(1, matches / careerMatches) : 0;
  const tenure = Math.min(1, matches / 120) * 0.6 + Math.min(1, seasons / 8) * 0.4;
  const blend = share * 0.15 + tenure * 0.85;
  return Math.max(0, Math.min(1, blend));
}

export function loadFranchiseLegacy(
  db: Db,
  playerId: string,
  asOfSeason: number,
  extraTeamIds: Array<string | null | undefined> = [],
): FranchiseLegacy {
  const rows = db
    .prepare(
      `SELECT team_id, SUM(matches) AS matches, COUNT(*) AS seasons
       FROM player_season_stats
       WHERE player_id = ? AND season <= ?
       GROUP BY team_id`,
    )
    .all(playerId, asOfSeason) as CareerTeamRow[];

  const legacy: FranchiseLegacy = new Map();
  const careerMatches = rows.reduce((sum, row) => sum + Math.max(0, row.matches), 0);
  for (const row of rows) {
    const strength = legacyStrength({
      matches: row.matches,
      seasons: row.seasons,
      careerMatches,
    });
    if (strength > 0.04) legacy.set(row.team_id, strength);
  }

  // A verified previous-side link (for example the 2025 RTM team) is a real
  // relationship even when season totals are thin or missing.
  for (const teamId of extraTeamIds) {
    if (!teamId) continue;
    const existing = legacy.get(teamId) ?? 0;
    legacy.set(teamId, Math.max(existing, 0.22));
  }
  return legacy;
}

/** Legacy strength for one team, clamped for direct valuation use. */
export function legacyForTeam(legacy: FranchiseLegacy | null | undefined, teamId: string): number {
  if (!legacy) return 0;
  const value = legacy.get(teamId) ?? 0;
  return Math.max(0, Math.min(1, value));
}
