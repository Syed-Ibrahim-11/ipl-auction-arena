import { getDb } from "@/db";
import { FRANCHISES, getActiveFranchise } from "@/lib/teams";
import { cachedStatic } from "./cache";
import {
  battingAverage,
  battingStrikeRate,
  boundaryBallPercent,
  boundaryRunPercent,
  bowlingAverage,
  bowlingStrikeRate,
  dotPercent,
  economyRate,
  fieldingDismissals,
  oversText,
} from "./stats";

export const ROLE_LABELS: Record<string, string> = {
  batter: "Batter",
  bowler: "Bowler",
  "all-rounder": "All-rounder",
  wicketkeeper: "Wicketkeeper",
  unknown: "Unclassified",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Unclassified";
  return ROLE_LABELS[role] ?? role;
}

export function ageFromBirthDate(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date("2026-10-25T00:00:00Z");
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const month = now.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const CURRENT_TEAM_SQL = `(
  SELECT ps.team_id FROM player_season_stats ps
  WHERE ps.player_id = p.id AND ps.season = 2026
  ORDER BY ps.matches DESC LIMIT 1
)`;

/**
 * The live player universe: the 2026 auction class, anyone who played the 2026
 * IPL season and a small set of under-31 prospects who last appeared in 2025
 * and are expected back in the next auction. Long-retired names are excluded
 * from every registry, search and auction pool.
 */
export const CURRENT_PLAYER_SQL = `(
  EXISTS (SELECT 1 FROM auction_players ap WHERE ap.player_id = p.id AND ap.auction_year = 2026)
  OR EXISTS (SELECT 1 FROM player_match_stats ms WHERE ms.player_id = p.id AND ms.season = 2026)
  OR EXISTS (
    SELECT 1 FROM player_career_stats cs
    WHERE cs.player_id = p.id
      AND cs.last_season = 2025
      AND p.birth_date IS NOT NULL
      AND 2026 - CAST(substr(p.birth_date, 1, 4) AS INTEGER) <= 30
  )
)`;

export function isCurrentPlayer(playerId: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT EXISTS (
         SELECT 1 FROM players p WHERE p.id = ? AND ${CURRENT_PLAYER_SQL}
       ) AS current`,
    )
    .get(playerId) as { current: number } | undefined;
  return row?.current === 1;
}

interface PlayerListDbRow {
  id: string;
  full_name: string;
  short_name: string;
  role: string;
  country: string | null;
  nationality: string | null;
  is_overseas: number | null;
  capped: number | null;
  birth_date: string | null;
  data_status: string;
  current_team_id: string | null;
  current_team_name: string | null;
  current_team_short: string | null;
  ovr: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  evidence_quality: string | null;
  matches: number | null;
  runs: number | null;
  balls_faced: number | null;
  dismissals: number | null;
  wickets: number | null;
  balls_bowled: number | null;
  runs_conceded: number | null;
  base_price_lakh: number | null;
  winning_bid_lakh: number | null;
  base_price_verified: number | null;
  buyer_team_id: string | null;
  buyer_name: string | null;
  buyer_short: string | null;
}

export type PlayerListItem = {
  id: string;
  name: string;
  shortName: string;
  role: string;
  roleLabel: string;
  country: string | null;
  isOverseas: boolean | null;
  capped: boolean | null;
  birthDate: string | null;
  age: number | null;
  dataStatus: string;
  teamId: string | null;
  teamName: string | null;
  teamShort: string | null;
  ovr: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  evidenceQuality: string | null;
  matches: number;
  runs: number;
  strikeRate: number | null;
  wickets: number;
  economy: number | null;
  auctionBaseLakh: number | null;
  winningBidLakh: number | null;
  baseVerified: boolean;
  buyerTeamId: string | null;
  buyerName: string | null;
  buyerShort: string | null;
};

function mapPlayerListItem(row: PlayerListDbRow): PlayerListItem {
  return {
    id: row.id,
    name: row.full_name,
    shortName: row.short_name,
    role: row.role,
    roleLabel: roleLabel(row.role),
    country: row.country,
    isOverseas: row.is_overseas === null ? null : row.is_overseas === 1,
    capped: row.capped === null ? null : row.capped === 1,
    birthDate: row.birth_date,
    age: ageFromBirthDate(row.birth_date),
    dataStatus: row.data_status,
    teamId: row.current_team_id,
    teamName: row.current_team_name,
    teamShort: row.current_team_short,
    ovr: row.ovr,
    batting: row.batting,
    bowling: row.bowling,
    fielding: row.fielding,
    evidenceQuality: row.evidence_quality,
    matches: row.matches ?? 0,
    runs: row.runs ?? 0,
    strikeRate: battingStrikeRate(row.runs ?? 0, row.balls_faced ?? 0),
    wickets: row.wickets ?? 0,
    economy: economyRate(row.runs_conceded ?? 0, row.balls_bowled ?? 0),
    auctionBaseLakh: row.base_price_lakh,
    winningBidLakh: row.winning_bid_lakh,
    baseVerified: row.base_price_verified === 1,
    buyerTeamId: row.buyer_team_id,
    buyerName: row.buyer_name,
    buyerShort: row.buyer_short,
  };
}

const PLAYER_SELECT = `
  SELECT p.id, p.full_name, p.short_name, p.role, p.country, p.nationality,
         p.is_overseas, p.capped, p.birth_date, p.data_status,
         ${CURRENT_TEAM_SQL} AS current_team_id,
         ct.name AS current_team_name, ct.short_name AS current_team_short,
         r.ovr, r.batting, r.bowling, r.fielding, r.evidence_quality,
         c.matches, c.runs, c.balls_faced, c.dismissals, c.wickets, c.balls_bowled, c.runs_conceded,
         a.base_price_lakh, a.winning_bid_lakh, a.base_price_verified,
         a.buyer_team_id, bt.name AS buyer_name, bt.short_name AS buyer_short
  FROM players p
  LEFT JOIN player_ratings r ON r.player_id = p.id AND r.as_of_season = 2026
  LEFT JOIN player_career_stats c ON c.player_id = p.id
  LEFT JOIN auction_players a ON a.player_id = p.id AND a.auction_year = 2026
  LEFT JOIN teams bt ON bt.id = a.buyer_team_id
  LEFT JOIN teams ct ON ct.id = ${CURRENT_TEAM_SQL}
`;

export type PlayerSort = "ovr" | "name" | "runs" | "wickets" | "auction" | "matches";

export interface PlayerFilters {
  q?: string;
  role?: string;
  team?: string;
  overseas?: "overseas" | "domestic";
  capped?: "capped" | "uncapped";
  sort?: PlayerSort;
  page?: number;
  pageSize?: number;
}

export function listPlayers(filters: PlayerFilters): {
  players: PlayerListItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
} {
  const clauses: string[] = [CURRENT_PLAYER_SQL];
  const params: Array<string | number> = [];

  const q = filters.q?.trim();
  if (q) {
    clauses.push("(p.full_name LIKE ? OR p.short_name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (filters.role && filters.role !== "all") {
    clauses.push("p.role = ?");
    params.push(filters.role);
  }
  if (filters.team && filters.team !== "all") {
    clauses.push(`${CURRENT_TEAM_SQL} = ?`);
    params.push(filters.team);
  }
  if (filters.overseas === "overseas") clauses.push("p.is_overseas = 1");
  if (filters.overseas === "domestic") clauses.push("p.is_overseas = 0");
  if (filters.capped === "capped") clauses.push("p.capped = 1");
  if (filters.capped === "uncapped") clauses.push("p.capped = 0");

  const where = `WHERE ${clauses.join(" AND ")}`;
  const orderBy = (() => {
    switch (filters.sort) {
      case "name":
        return "p.full_name COLLATE NOCASE ASC";
      case "runs":
        return "c.runs DESC, r.ovr DESC";
      case "wickets":
        return "c.wickets DESC, r.ovr DESC";
      case "matches":
        return "c.matches DESC, r.ovr DESC";
      case "auction":
        return "a.winning_bid_lakh DESC NULLS LAST, a.base_price_lakh DESC NULLS LAST, r.ovr DESC";
      default:
        return "r.ovr DESC NULLS LAST, c.matches DESC NULLS LAST";
    }
  })();

  const pageSize = Math.min(Math.max(filters.pageSize ?? 24, 6), 60);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const db = getDb();
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM players p
         LEFT JOIN player_career_stats c ON c.player_id = p.id
         LEFT JOIN auction_players a ON a.player_id = p.id AND a.auction_year = 2026
         ${where}`,
      )
      .get(...params) as { c: number }
  ).c;

  const rows = db
    .prepare(`${PLAYER_SELECT} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset) as PlayerListDbRow[];

  return {
    players: rows.map(mapPlayerListItem),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function getPlayerFilterOptions(): {
  teams: Array<{ id: string; name: string; shortName: string }>;
  roles: Array<{ id: string; label: string; count: number }>;
} {
  const db = getDb();
  const teams = db
    .prepare("SELECT id, name, short_name FROM teams WHERE active = 1 ORDER BY name")
    .all() as Array<{ id: string; name: string; short_name: string }>;
  const roles = db
    .prepare(
      `SELECT p.role AS id, COUNT(*) AS count FROM players p
       WHERE ${CURRENT_PLAYER_SQL} GROUP BY p.role`,
    )
    .all() as Array<{ id: string; count: number }>;
  return {
    teams: teams.map((team) => ({ id: team.id, name: team.name, shortName: team.short_name })),
    roles: roles
      .map((role) => ({ id: role.id, label: roleLabel(role.id), count: role.count }))
      .sort((a, b) => b.count - a.count),
  };
}

export interface RatingBreakdownJson {
  weights?: { batting: number; bowling: number; fielding: number };
  effectiveWeights?: { batting: number; bowling: number; fielding: number };
  batting?: {
    rating: number | null;
    careerRating: number | null;
    formRating: number | null;
    formWeight: number;
    percentile: number | null;
    reliability: number | null;
    raw: number | null;
    components: Array<{
      label: string;
      value: number | null;
      peerMedian: number | null;
      weight: number;
      ratio: number | null;
    }>;
    sample: { matches: number; balls: number; dismissals: number };
  } | null;
  bowling?: {
    rating: number | null;
    careerRating: number | null;
    formRating: number | null;
    formWeight: number;
    percentile: number | null;
    reliability: number | null;
    raw: number | null;
    components: Array<{
      label: string;
      value: number | null;
      peerMedian: number | null;
      weight: number;
      ratio: number | null;
    }>;
    sample: { matches: number; balls: number };
  } | null;
  fielding?: {
    rating: number | null;
    careerRating: number | null;
    formRating: number | null;
    formWeight: number;
    percentile: number | null;
    reliability: number | null;
    raw: number | null;
    components: Array<{
      label: string;
      value: number | null;
      peerMedian: number | null;
      weight: number;
      ratio: number | null;
    }>;
    sample: { matches: number; balls: number };
  } | null;
  pools?: { batting: number; bowling: number; fielding: number };
  medians?: Record<string, number>;
  notes?: string[];
}

export type PlayerProfile = {
  player: PlayerListItem & {
    battingStyle: string | null;
    bowlingStyle: string | null;
    primaryTeamId: string | null;
    cricsheetId: string | null;
    nationality: string | null;
    wikidataId: string | null;
  };
  rating: {
    ovr: number | null;
    batting: number | null;
    bowling: number | null;
    fielding: number | null;
    role: string;
    evidenceQuality: string;
    asOfSeason: number;
    formulaVersion: string;
    rank: number | null;
    ratedPlayers: number;
    breakdown: RatingBreakdownJson | null;
    sample: {
      matches: number;
      inningsBat: number;
      inningsBowl: number;
      ballsFaced: number;
      ballsBowled: number;
      seasons: number;
      firstSeason: number | null;
      lastSeason: number | null;
    } | null;
  } | null;
  ratingHistory: Array<{ season: number; ovr: number | null; batting: number | null; bowling: number | null; role: string }>;
  career: {
    matches: number;
    firstSeason: number | null;
    lastSeason: number | null;
    runs: number;
    ballsFaced: number;
    strikeRate: number | null;
    average: number | null;
    highScore: number;
    highScoreNotOut: boolean;
    fifties: number;
    hundreds: number;
    fours: number;
    sixes: number;
    wickets: number;
    economy: number | null;
    bowlingAverage: number | null;
    bowlingStrikeRate: number | null;
    dotPercent: number | null;
    bestBowling: string | null;
    catches: number;
    stumpings: number;
    runOuts: number;
    inningsBat: number;
    inningsBowl: number;
    overs: string;
  };
  phases: {
    batting: Array<{
      key: "powerplay" | "middle" | "death";
      label: string;
      runs: number;
      balls: number;
      dismissals: number;
      strikeRate: number | null;
      boundaryPercent: number | null;
      average: number | null;
    }>;
    bowling: Array<{
      key: "powerplay" | "middle" | "death";
      label: string;
      balls: number;
      runs: number;
      wickets: number;
      economy: number | null;
      dotPercent: number | null;
    }>;
  };
  seasonStats: Array<{
    season: number;
    teamId: string;
    teamShort: string;
    matches: number;
    runs: number;
    ballsFaced: number;
    strikeRate: number | null;
    average: number | null;
    highScore: number;
    fifties: number;
    hundreds: number;
    wickets: number;
    economy: number | null;
    bestBowling: string | null;
    catches: number;
    stumpings: number;
  }>;
  recentMatches: Array<{
    matchId: string;
    date: string;
    season: number;
    opponentId: string;
    opponentShort: string;
    venue: string | null;
    runs: number;
    ballsFaced: number;
    notOut: boolean;
    wickets: number;
    ballsBowled: number;
    runsConceded: number;
    catches: number;
    result: string | null;
  }>;
  auctionHistory: Array<{
    year: number;
    basePriceLakh: number;
    winningBidLakh: number | null;
    buyerTeamId: string | null;
    buyerName: string | null;
    basePriceVerified: boolean;
    cappedLabel: string | null;
  }>;
  similar: Array<{ id: string; name: string; ovr: number | null; teamShort: string | null; role: string }>;
  evidence: {
    boundaryPercent: number | null;
    fieldingDismissals: number;
  };
};

export function getPlayerProfile(playerId: string): PlayerProfile | null {
  const db = getDb();
  const base = db.prepare(`${PLAYER_SELECT} WHERE p.id = ?`).get(playerId) as PlayerListDbRow | undefined;
  if (!base) return null;

  const extra = db
    .prepare(
      "SELECT batting_style, bowling_style, primary_team_id, cricsheet_id, nationality, wikidata_id FROM players WHERE id = ?",
    )
    .get(playerId) as {
    batting_style: string | null;
    bowling_style: string | null;
    primary_team_id: string | null;
    cricsheet_id: string | null;
    nationality: string | null;
    wikidata_id: string | null;
  };

  const ratingRow = db
    .prepare("SELECT * FROM player_ratings WHERE player_id = ? AND as_of_season = 2026")
    .get(playerId) as
    | {
        ovr: number | null;
        batting: number | null;
        bowling: number | null;
        fielding: number | null;
        role: string;
        evidence_quality: string;
        as_of_season: number;
        formula_version: string;
        breakdown_json: string;
        sample_json: string;
      }
    | undefined;

  const rankRow = ratingRow
    ? (db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM player_ratings WHERE as_of_season = 2026 AND ovr IS NOT NULL) AS total,
             (SELECT COUNT(*) FROM player_ratings WHERE as_of_season = 2026 AND ovr > ?) AS above`,
        )
        .get(ratingRow.ovr ?? 0) as { total: number; above: number })
    : null;

  const careerRow = db
    .prepare("SELECT * FROM player_career_stats WHERE player_id = ?")
    .get(playerId) as
    | {
        matches: number;
        first_season: number | null;
        last_season: number | null;
        runs: number;
        balls_faced: number;
        dismissals: number;
        not_outs: number;
        high_score: number;
        high_score_not_out: number;
        fifties: number;
        hundreds: number;
        fours: number;
        sixes: number;
        innings_bat: number;
        innings_bowl: number;
        balls_bowled: number;
        runs_conceded: number;
        wickets: number;
        best_bowling_wickets: number | null;
        best_bowling_runs: number | null;
        dots: number;
        catches: number;
        stumpings: number;
        run_outs: number;
        pp_runs: number;
        pp_balls: number;
        pp_dismissals: number;
        pp_fours: number;
        pp_sixes: number;
        mid_runs: number;
        mid_balls: number;
        mid_dismissals: number;
        mid_fours: number;
        mid_sixes: number;
        death_runs: number;
        death_balls: number;
        death_dismissals: number;
        death_fours: number;
        death_sixes: number;
        pp_bowl_balls: number;
        pp_bowl_runs: number;
        pp_bowl_wickets: number;
        pp_bowl_dots: number;
        mid_bowl_balls: number;
        mid_bowl_runs: number;
        mid_bowl_wickets: number;
        mid_bowl_dots: number;
        death_bowl_balls: number;
        death_bowl_runs: number;
        death_bowl_wickets: number;
        death_bowl_dots: number;
      }
    | undefined;

  const seasons = db
    .prepare(
      `SELECT ps.*, t.short_name AS team_short
       FROM player_season_stats ps LEFT JOIN teams t ON t.id = ps.team_id
       WHERE ps.player_id = ? ORDER BY ps.season DESC, ps.matches DESC`,
    )
    .all(playerId) as Array<{
    season: number;
    team_id: string;
    team_short: string;
    matches: number;
    runs: number;
    balls_faced: number;
    dismissals: number;
    high_score: number;
    fifties: number;
    hundreds: number;
    wickets: number;
    balls_bowled: number;
    runs_conceded: number;
    best_bowling_wickets: number | null;
    best_bowling_runs: number | null;
    catches: number;
    stumpings: number;
  }>;

  const recent = db
    .prepare(
      `SELECT ms.*, t.short_name AS opponent_short, m.result
       FROM player_match_stats ms
       LEFT JOIN teams t ON t.id = ms.opponent_team_id
       LEFT JOIN matches m ON m.id = ms.match_id
       WHERE ms.player_id = ? ORDER BY ms.date DESC LIMIT 12`,
    )
    .all(playerId) as Array<{
    match_id: string;
    date: string;
    season: number;
    opponent_team_id: string;
    opponent_short: string;
    venue: string | null;
    runs: number;
    balls_faced: number;
    not_out: number;
    wickets: number;
    balls_bowled: number;
    runs_conceded: number;
    catches: number;
    result: string | null;
  }>;

  const auctions = db
    .prepare(
      `SELECT a.*, t.name AS buyer_name FROM auction_players a
       LEFT JOIN teams t ON t.id = a.buyer_team_id
       WHERE a.player_id = ? ORDER BY a.auction_year DESC`,
    )
    .all(playerId) as Array<{
    auction_year: number;
    base_price_lakh: number;
    winning_bid_lakh: number | null;
    buyer_team_id: string | null;
    buyer_name: string | null;
    base_price_verified: number;
    capped_label: string | null;
  }>;

  const history = db
    .prepare(
      "SELECT as_of_season, ovr, batting, bowling, role FROM player_rating_versions WHERE player_id = ? ORDER BY as_of_season ASC",
    )
    .all(playerId) as Array<{ as_of_season: number; ovr: number | null; batting: number | null; bowling: number | null; role: string }>;

  const similar = ratingRow?.ovr
    ? (db
        .prepare(
          `SELECT p.id, p.full_name, r.ovr, p.role, t.short_name
           FROM player_ratings r
           JOIN players p ON p.id = r.player_id
           LEFT JOIN teams t ON t.id = p.primary_team_id
           WHERE r.as_of_season = 2026 AND r.ovr IS NOT NULL AND p.role = ? AND p.id != ?
             AND ABS(r.ovr - ?) <= 5
           ORDER BY ABS(r.ovr - ?) ASC, p.full_name ASC LIMIT 6`,
        )
        .all(ratingRow.role, playerId, ratingRow.ovr, ratingRow.ovr) as Array<{
        id: string;
        full_name: string;
        ovr: number;
        role: string;
        short_name: string | null;
      }>)
    : [];

  const battingPhaseSeeds = [
    {
      key: "powerplay" as const,
      label: "Powerplay",
      runs: careerRow?.pp_runs ?? 0,
      balls: careerRow?.pp_balls ?? 0,
      dismissals: careerRow?.pp_dismissals ?? 0,
      fours: careerRow?.pp_fours ?? 0,
      sixes: careerRow?.pp_sixes ?? 0,
    },
    {
      key: "middle" as const,
      label: "Middle overs",
      runs: careerRow?.mid_runs ?? 0,
      balls: careerRow?.mid_balls ?? 0,
      dismissals: careerRow?.mid_dismissals ?? 0,
      fours: careerRow?.mid_fours ?? 0,
      sixes: careerRow?.mid_sixes ?? 0,
    },
    {
      key: "death" as const,
      label: "Death overs",
      runs: careerRow?.death_runs ?? 0,
      balls: careerRow?.death_balls ?? 0,
      dismissals: careerRow?.death_dismissals ?? 0,
      fours: careerRow?.death_fours ?? 0,
      sixes: careerRow?.death_sixes ?? 0,
    },
  ];

  const battingPhases: PlayerProfile["phases"]["batting"] = battingPhaseSeeds
    .filter((phase) => phase.balls > 0)
    .map((phase) => ({
      key: phase.key,
      label: phase.label,
      runs: phase.runs,
      balls: phase.balls,
      dismissals: phase.dismissals,
      strikeRate: battingStrikeRate(phase.runs, phase.balls),
      boundaryPercent: boundaryRunPercent(phase.fours, phase.sixes, phase.runs),
      average: battingAverage(phase.runs, phase.dismissals),
    }));

  const bowlingPhaseSeeds = [
    {
      key: "powerplay" as const,
      label: "Powerplay",
      balls: careerRow?.pp_bowl_balls ?? 0,
      runs: careerRow?.pp_bowl_runs ?? 0,
      wickets: careerRow?.pp_bowl_wickets ?? 0,
      dots: careerRow?.pp_bowl_dots ?? 0,
    },
    {
      key: "middle" as const,
      label: "Middle overs",
      balls: careerRow?.mid_bowl_balls ?? 0,
      runs: careerRow?.mid_bowl_runs ?? 0,
      wickets: careerRow?.mid_bowl_wickets ?? 0,
      dots: careerRow?.mid_bowl_dots ?? 0,
    },
    {
      key: "death" as const,
      label: "Death overs",
      balls: careerRow?.death_bowl_balls ?? 0,
      runs: careerRow?.death_bowl_runs ?? 0,
      wickets: careerRow?.death_bowl_wickets ?? 0,
      dots: careerRow?.death_bowl_dots ?? 0,
    },
  ];

  const bowlingPhases: PlayerProfile["phases"]["bowling"] = bowlingPhaseSeeds
    .filter((phase) => phase.balls > 0)
    .map((phase) => ({
      key: phase.key,
      label: phase.label,
      balls: phase.balls,
      runs: phase.runs,
      wickets: phase.wickets,
      economy: economyRate(phase.runs, phase.balls),
      dotPercent: dotPercent(phase.dots, phase.balls),
    }));

  const mapped = mapPlayerListItem(base);
  return {
    player: {
      ...mapped,
      battingStyle: extra?.batting_style ?? null,
      bowlingStyle: extra?.bowling_style ?? null,
      primaryTeamId: extra?.primary_team_id ?? null,
      cricsheetId: extra?.cricsheet_id ?? null,
      nationality: extra?.nationality ?? null,
      wikidataId: extra?.wikidata_id ?? null,
    },
    rating: ratingRow
      ? {
          ovr: ratingRow.ovr,
          batting: ratingRow.batting,
          bowling: ratingRow.bowling,
          fielding: ratingRow.fielding,
          role: ratingRow.role,
          evidenceQuality: ratingRow.evidence_quality,
          asOfSeason: ratingRow.as_of_season,
          formulaVersion: ratingRow.formula_version,
          rank: ratingRow.ovr !== null && rankRow ? rankRow.above + 1 : null,
          ratedPlayers: rankRow?.total ?? 0,
          breakdown: parseJson<RatingBreakdownJson>(ratingRow.breakdown_json),
          sample: parseJson<{
            matches: number;
            inningsBat: number;
            inningsBowl: number;
            ballsFaced: number;
            ballsBowled: number;
            seasons: number;
            firstSeason: number | null;
            lastSeason: number | null;
          }>(ratingRow.sample_json),
        }
      : null,
    ratingHistory: history.map((row) => ({
      season: row.as_of_season,
      ovr: row.ovr,
      batting: row.batting,
      bowling: row.bowling,
      role: row.role,
    })),
    career: {
      matches: careerRow?.matches ?? 0,
      firstSeason: careerRow?.first_season ?? null,
      lastSeason: careerRow?.last_season ?? null,
      runs: careerRow?.runs ?? 0,
      ballsFaced: careerRow?.balls_faced ?? 0,
      strikeRate: battingStrikeRate(careerRow?.runs ?? 0, careerRow?.balls_faced ?? 0),
      average: battingAverage(careerRow?.runs ?? 0, careerRow?.dismissals ?? 0),
      highScore: careerRow?.high_score ?? 0,
      highScoreNotOut: careerRow?.high_score_not_out === 1,
      fifties: careerRow?.fifties ?? 0,
      hundreds: careerRow?.hundreds ?? 0,
      fours: careerRow?.fours ?? 0,
      sixes: careerRow?.sixes ?? 0,
      wickets: careerRow?.wickets ?? 0,
      economy: economyRate(careerRow?.runs_conceded ?? 0, careerRow?.balls_bowled ?? 0),
      bowlingAverage: bowlingAverage(careerRow?.runs_conceded ?? 0, careerRow?.wickets ?? 0),
      bowlingStrikeRate: bowlingStrikeRate(careerRow?.balls_bowled ?? 0, careerRow?.wickets ?? 0),
      dotPercent: dotPercent(careerRow?.dots ?? 0, careerRow?.balls_bowled ?? 0),
      bestBowling:
        careerRow?.best_bowling_wickets !== null && careerRow?.best_bowling_wickets !== undefined
          ? `${careerRow.best_bowling_wickets}/${careerRow.best_bowling_runs}`
          : null,
      catches: careerRow?.catches ?? 0,
      stumpings: careerRow?.stumpings ?? 0,
      runOuts: careerRow?.run_outs ?? 0,
      inningsBat: careerRow?.innings_bat ?? 0,
      inningsBowl: careerRow?.innings_bowl ?? 0,
      overs: oversText(careerRow?.balls_bowled ?? 0),
    },
    phases: { batting: battingPhases, bowling: bowlingPhases },
    seasonStats: seasons.map((row) => ({
      season: row.season,
      teamId: row.team_id,
      teamShort: row.team_short,
      matches: row.matches,
      runs: row.runs,
      ballsFaced: row.balls_faced,
      strikeRate: battingStrikeRate(row.runs, row.balls_faced),
      average: battingAverage(row.runs, row.dismissals),
      highScore: row.high_score,
      fifties: row.fifties,
      hundreds: row.hundreds,
      wickets: row.wickets,
      economy: economyRate(row.runs_conceded, row.balls_bowled),
      bestBowling:
        row.best_bowling_wickets !== null && row.best_bowling_wickets !== undefined
          ? `${row.best_bowling_wickets}/${row.best_bowling_runs}`
          : null,
      catches: row.catches,
      stumpings: row.stumpings,
    })),
    recentMatches: recent.map((row) => ({
      matchId: row.match_id,
      date: row.date,
      season: row.season,
      opponentId: row.opponent_team_id,
      opponentShort: row.opponent_short,
      venue: row.venue,
      runs: row.runs,
      ballsFaced: row.balls_faced,
      notOut: row.not_out === 1,
      wickets: row.wickets,
      ballsBowled: row.balls_bowled,
      runsConceded: row.runs_conceded,
      catches: row.catches,
      result: row.result,
    })),
    auctionHistory: auctions.map((row) => ({
      year: row.auction_year,
      basePriceLakh: row.base_price_lakh,
      winningBidLakh: row.winning_bid_lakh,
      buyerTeamId: row.buyer_team_id,
      buyerName: row.buyer_name,
      basePriceVerified: row.base_price_verified === 1,
      cappedLabel: row.capped_label,
    })),
    similar: similar.map((row) => ({
      id: row.id,
      name: row.full_name,
      ovr: row.ovr,
      teamShort: row.short_name,
      role: row.role,
    })),
    evidence: {
      boundaryPercent: boundaryBallPercent(
        careerRow?.fours ?? 0,
        careerRow?.sixes ?? 0,
        careerRow?.balls_faced ?? 0,
      ),
      fieldingDismissals: fieldingDismissals(
        careerRow?.catches ?? 0,
        careerRow?.run_outs ?? 0,
        careerRow?.stumpings ?? 0,
      ),
    },
  };
}

interface TeamRow {
  id: string;
  name: string;
  short_name: string;
  city: string | null;
  primary_color: string;
  secondary_color: string;
  ink_color: string;
}

export type TeamOverview = {
  id: string;
  name: string;
  shortName: string;
  city: string | null;
  primary: string;
  secondary: string;
  ink: string;
  position: number | null;
  played: number;
  won: number;
  lost: number;
  noResult: number;
  points: number;
  netRunRate: number | null;
  titles: number;
  isChampion2026: boolean;
  squadCount2026: number;
  runs2026: number;
  wickets2026: number;
  auctionBuys: number;
  auctionSpendLakh: number;
  auctionTopBuy: { name: string; amountLakh: number } | null;
  topPlayers: Array<{ id: string; name: string; ovr: number | null; role: string }>;
  form: Array<"W" | "L" | "N">;
};

export function getTeamsOverview(): TeamOverview[] {
  const db = getDb();
  const teams = db
    .prepare("SELECT * FROM teams WHERE active = 1 ORDER BY name")
    .all() as TeamRow[];

  const points = db
    .prepare("SELECT * FROM points_table WHERE season = 2026")
    .all() as Array<{
    team_id: string;
    position: number;
    played: number;
    won: number;
    lost: number;
    no_result: number;
    net_run_rate: number | null;
    points: number;
  }>;
  const pointsByTeam = new Map(points.map((row) => [row.team_id, row]));

  const champions = db
    .prepare(
      "SELECT winner_id, COUNT(*) AS titles FROM matches WHERE stage = 'Final' AND winner_id IS NOT NULL GROUP BY winner_id",
    )
    .all() as Array<{ winner_id: string; titles: number }>;
  const titlesByTeam = new Map(champions.map((row) => [row.winner_id, row.titles]));

  const final2026 = db
    .prepare("SELECT winner_id FROM matches WHERE season = 2026 AND stage = 'Final'")
    .get() as { winner_id: string } | undefined;

  const seasonTotals = db
    .prepare(
      `SELECT team_id, COUNT(DISTINCT player_id) AS players, SUM(runs) AS runs, SUM(wickets) AS wickets
       FROM player_season_stats WHERE season = 2026 GROUP BY team_id`,
    )
    .all() as Array<{ team_id: string; players: number; runs: number; wickets: number }>;
  const totalsByTeam = new Map(seasonTotals.map((row) => [row.team_id, row]));

  const auctionTotals = db
    .prepare(
      `SELECT buyer_team_id AS team_id, COUNT(*) AS buys, SUM(winning_bid_lakh) AS spend,
              MAX(winning_bid_lakh) AS top
       FROM auction_players WHERE auction_year = 2026 AND buyer_team_id IS NOT NULL GROUP BY buyer_team_id`,
    )
    .all() as Array<{ team_id: string; buys: number; spend: number; top: number }>;
  const auctionByTeam = new Map(auctionTotals.map((row) => [row.team_id, row]));

  const topBuyRows = db
    .prepare(
      `SELECT a.buyer_team_id, a.winning_bid_lakh, p.full_name
       FROM auction_players a JOIN players p ON p.id = a.player_id
       WHERE a.auction_year = 2026 AND a.buyer_team_id IS NOT NULL
       ORDER BY a.winning_bid_lakh DESC`,
    )
    .all() as Array<{ buyer_team_id: string; winning_bid_lakh: number; full_name: string }>;
  const topBuyByTeam = new Map<string, { name: string; amountLakh: number }>();
  for (const row of topBuyRows) {
    if (!topBuyByTeam.has(row.buyer_team_id)) {
      topBuyByTeam.set(row.buyer_team_id, { name: row.full_name, amountLakh: row.winning_bid_lakh });
    }
  }

  const topPlayersByTeam = new Map<string, Array<{ id: string; name: string; ovr: number | null; role: string }>>();
  const topPlayerRows = db
    .prepare(
      `SELECT ps.team_id, p.id, p.full_name, p.role, r.ovr
       FROM player_season_stats ps
       JOIN players p ON p.id = ps.player_id
       LEFT JOIN player_ratings r ON r.player_id = p.id AND r.as_of_season = 2026
       WHERE ps.season = 2026
       ORDER BY r.ovr DESC NULLS LAST`,
    )
    .all() as Array<{ team_id: string; id: string; full_name: string; role: string; ovr: number | null }>;
  for (const row of topPlayerRows) {
    const list = topPlayersByTeam.get(row.team_id) ?? [];
    if (list.length < 3 && !list.some((player) => player.id === row.id)) {
      list.push({ id: row.id, name: row.full_name, ovr: row.ovr, role: row.role });
      topPlayersByTeam.set(row.team_id, list);
    }
  }

  const recentResults = db
    .prepare(
      `SELECT team1_id, team2_id, winner_id FROM matches WHERE season = 2026
       AND stage IN ('league', 'Qualifier 1', 'Qualifier 2', 'Eliminator', 'Final')
       ORDER BY date DESC`,
    )
    .all() as Array<{ team1_id: string; team2_id: string; winner_id: string | null }>;
  const formByTeam = new Map<string, Array<"W" | "L" | "N">>();
  for (const match of recentResults) {
    for (const teamId of [match.team1_id, match.team2_id]) {
      const list = formByTeam.get(teamId) ?? [];
      if (list.length < 5) {
        list.push(match.winner_id === teamId ? "W" : match.winner_id ? "L" : "N");
        formByTeam.set(teamId, list);
      }
    }
  }

  return teams.map((team) => {
    const point = pointsByTeam.get(team.id);
    const totals = totalsByTeam.get(team.id);
    const auction = auctionByTeam.get(team.id);
    return {
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      city: team.city,
      primary: team.primary_color,
      secondary: team.secondary_color,
      ink: team.ink_color,
      position: point?.position ?? null,
      played: point?.played ?? 0,
      won: point?.won ?? 0,
      lost: point?.lost ?? 0,
      noResult: point?.no_result ?? 0,
      points: point?.points ?? 0,
      netRunRate: point?.net_run_rate ?? null,
      titles: titlesByTeam.get(team.id) ?? 0,
      isChampion2026: final2026?.winner_id === team.id,
      squadCount2026: totals?.players ?? 0,
      runs2026: totals?.runs ?? 0,
      wickets2026: totals?.wickets ?? 0,
      auctionBuys: auction?.buys ?? 0,
      auctionSpendLakh: auction?.spend ?? 0,
      auctionTopBuy: topBuyByTeam.get(team.id) ?? null,
      topPlayers: topPlayersByTeam.get(team.id) ?? [],
      form: formByTeam.get(team.id) ?? [],
    };
  });
}

export type TeamSeasonRecord = {
  season: number;
  played: number;
  won: number;
  lost: number;
  noResult: number;
  finalResult: string | null;
  champion: boolean;
};

export type TeamDetail = TeamOverview & {
  history: TeamSeasonRecord[];
  roster: Array<PlayerListItem & { seasonMatches: number; seasonRuns: number; seasonWickets: number }>;
  auctionPurchases: Array<{
    playerId: string;
    name: string;
    role: string;
    basePriceLakh: number;
    winningBidLakh: number | null;
    cappedLabel: string | null;
    basePriceVerified: boolean;
  }>;
  matches: Array<{
    id: string;
    date: string;
    opponentId: string;
    opponentShort: string;
    venue: string | null;
    result: string | null;
    winnerId: string | null;
    stage: string | null;
    teamScore: string | null;
    opponentScore: string | null;
  }>;
  squadRoles: Array<{ role: string; label: string; count: number }>;
  depth: {
    top11Ovr: number | null;
    bestXiOvr: number | null;
    squadOvr: number | null;
    averageAge: number | null;
  };
};

export function getTeamDetail(teamId: string): TeamDetail | null {
  if (!getActiveFranchise(teamId)) return null;
  const db = getDb();
  const overview = getTeamsOverview().find((team) => team.id === teamId);
  if (!overview) return null;

  const historyRows = db
    .prepare(
      `SELECT season,
              COUNT(*) AS played,
              SUM(CASE WHEN winner_id = @team THEN 1 ELSE 0 END) AS won,
              SUM(CASE WHEN winner_id IS NOT NULL AND winner_id != @team THEN 1 ELSE 0 END) AS lost,
              SUM(CASE WHEN winner_id IS NULL THEN 1 ELSE 0 END) AS no_result
       FROM matches WHERE team1_id = @team OR team2_id = @team
       GROUP BY season ORDER BY season DESC`,
    )
    .all({ team: teamId }) as Array<{
    season: number;
    played: number;
    won: number;
    lost: number;
    no_result: number;
  }>;
  const finals = db
    .prepare(
      `SELECT season, result, winner_id FROM matches WHERE stage = 'Final' AND (team1_id = ? OR team2_id = ?) ORDER BY season DESC`,
    )
    .all(teamId, teamId) as Array<{ season: number; result: string; winner_id: string | null }>;
  const finalBySeason = new Map(finals.map((row) => [row.season, row]));

  const rosterRows = db
    .prepare(
      `SELECT p.id, p.full_name, p.short_name, p.role, p.country, p.nationality, p.is_overseas,
              p.capped, p.birth_date, p.data_status,
              ps.matches AS season_matches, ps.runs AS season_runs, ps.wickets AS season_wickets,
              ps.balls_faced AS season_balls, ps.balls_bowled AS season_balls_bowled,
              ps.runs_conceded AS season_runs_conceded,
              r.ovr, r.batting, r.bowling, r.fielding, r.evidence_quality,
              c.matches, c.runs, c.balls_faced, c.dismissals, c.wickets, c.balls_bowled, c.runs_conceded,
              a.base_price_lakh, a.winning_bid_lakh, a.base_price_verified,
              a.buyer_team_id, bt.name AS buyer_name, bt.short_name AS buyer_short
       FROM player_season_stats ps
       JOIN players p ON p.id = ps.player_id
       LEFT JOIN player_ratings r ON r.player_id = p.id AND r.as_of_season = 2026
       LEFT JOIN player_career_stats c ON c.player_id = p.id
       LEFT JOIN auction_players a ON a.player_id = p.id AND a.auction_year = 2026
       LEFT JOIN teams bt ON bt.id = a.buyer_team_id
       WHERE ps.season = 2026 AND ps.team_id = ?
       ORDER BY r.ovr DESC NULLS LAST, ps.matches DESC`,
    )
    .all(teamId) as Array<
    PlayerListDbRow & {
      season_matches: number;
      season_runs: number;
      season_wickets: number;
      season_balls: number;
      season_balls_bowled: number;
      season_runs_conceded: number;
    }
  >;

  const buys = db
    .prepare(
      `SELECT a.player_id, p.full_name, p.role, a.base_price_lakh, a.winning_bid_lakh,
              a.capped_label, a.base_price_verified
       FROM auction_players a JOIN players p ON p.id = a.player_id
       WHERE a.auction_year = 2026 AND a.buyer_team_id = ?
       ORDER BY a.winning_bid_lakh DESC NULLS LAST, p.full_name`,
    )
    .all(teamId) as Array<{
    player_id: string;
    full_name: string;
    role: string;
    base_price_lakh: number;
    winning_bid_lakh: number | null;
    capped_label: string | null;
    base_price_verified: number;
  }>;

  const matchRows = db
    .prepare(
      `SELECT m.id, m.date, m.stage, m.venue, m.result, m.winner_id,
              CASE WHEN m.team1_id = @team THEN m.team2_id ELSE m.team1_id END AS opponent_id,
              CASE WHEN m.team1_id = @team THEN t2.short_name ELSE t1.short_name END AS opponent_short,
              CASE WHEN m.team1_id = @team THEN m.team1_score ELSE m.team2_score END AS team_score,
              CASE WHEN m.team1_id = @team THEN m.team2_score ELSE m.team1_score END AS opponent_score
       FROM matches m
       JOIN teams t1 ON t1.id = m.team1_id
       JOIN teams t2 ON t2.id = m.team2_id
       WHERE m.season = 2026 AND (m.team1_id = @team OR m.team2_id = @team)
       ORDER BY m.date DESC`,
    )
    .all({ team: teamId }) as Array<{
    id: string;
    date: string;
    stage: string | null;
    venue: string | null;
    result: string | null;
    winner_id: string | null;
    opponent_id: string;
    opponent_short: string;
    team_score: string | null;
    opponent_score: string | null;
  }>;

  const roster = rosterRows.map((row) => ({
    ...mapPlayerListItem({ ...row, current_team_id: teamId }),
    seasonMatches: row.season_matches,
    seasonRuns: row.season_runs,
    seasonWickets: row.season_wickets,
  }));

  const roleCounts = new Map<string, number>();
  for (const player of roster) roleCounts.set(player.role, (roleCounts.get(player.role) ?? 0) + 1);
  const squadRoles = [...roleCounts.entries()]
    .map(([role, count]) => ({ role, label: roleLabel(role), count }))
    .sort((a, b) => b.count - a.count);

  const ratedPlayers = roster
    .filter((player): player is typeof player & { ovr: number } => player.ovr !== null)
    .sort((a, b) => b.ovr - a.ovr || b.seasonMatches - a.seasonMatches);
  const top11 = ratedPlayers.slice(0, 11).map((player) => player.ovr);
  const ages = roster.map((player) => player.age).filter((age): age is number => age !== null);

  // Best XI: highest-rated eleven that still contains a keeper and four bowling
  // options. All-rounders count on both sides, so this rewards balanced squads
  // rather than eleven stacked specialist batters.
  const xi: typeof ratedPlayers = [];
  const taken = new Set<string>();
  const add = (player: (typeof ratedPlayers)[number] | undefined) => {
    if (!player || taken.has(player.id) || xi.length >= 11) return;
    xi.push(player);
    taken.add(player.id);
  };
  add(ratedPlayers.find((player) => player.role === "wicketkeeper"));
  const isBowlingOption = (role: string) => role === "bowler" || role === "all-rounder";
  const isBattingOption = (role: string) => role === "batter" || role === "wicketkeeper" || role === "all-rounder";
  while (xi.filter((player) => isBowlingOption(player.role)).length < 4) {
    const next = ratedPlayers.find((player) => !taken.has(player.id) && isBowlingOption(player.role));
    if (!next) break;
    add(next);
  }
  while (xi.filter((player) => isBattingOption(player.role)).length < 5) {
    const next = ratedPlayers.find((player) => !taken.has(player.id) && isBattingOption(player.role));
    if (!next) break;
    add(next);
  }
  for (const player of ratedPlayers) {
    if (xi.length >= 11) break;
    add(player);
  }
  const bestXiOvr = xi.length
    ? Math.round((xi.reduce((sum, player) => sum + player.ovr, 0) / xi.length) * 10) / 10
    : null;

  return {
    ...overview,
    history: historyRows.map((row) => {
      const final = finalBySeason.get(row.season);
      return {
        season: row.season,
        played: row.played,
        won: row.won,
        lost: row.lost,
        noResult: row.no_result,
        finalResult: final?.result ?? null,
        champion: final?.winner_id === teamId,
      };
    }),
    roster,
    auctionPurchases: buys.map((row) => ({
      playerId: row.player_id,
      name: row.full_name,
      role: row.role,
      basePriceLakh: row.base_price_lakh,
      winningBidLakh: row.winning_bid_lakh,
      cappedLabel: row.capped_label,
      basePriceVerified: row.base_price_verified === 1,
    })),
    matches: matchRows.map((row) => ({
      id: row.id,
      date: row.date,
      opponentId: row.opponent_id,
      opponentShort: row.opponent_short,
      venue: row.venue,
      result: row.result,
      winnerId: row.winner_id,
      stage: row.stage,
      teamScore: row.team_score,
      opponentScore: row.opponent_score,
    })),
    squadRoles,
    depth: {
      top11Ovr: top11.length ? Math.round((top11.reduce((sum, ovr) => sum + ovr, 0) / top11.length) * 10) / 10 : null,
      bestXiOvr,
      squadOvr: ratedPlayers.length
        ? Math.round((ratedPlayers.reduce((sum, player) => sum + player.ovr, 0) / ratedPlayers.length) * 10) / 10
        : null,
      averageAge: ages.length ? Math.round((ages.reduce((sum, age) => sum + age, 0) / ages.length) * 10) / 10 : null,
    },
  };
}

export type HomeHero = {
  counts: { players: number; matches: number; deliveries: number; seasons: number };
  topBuy: {
    playerId: string;
    name: string;
    role: string;
    winningBidLakh: number;
    basePriceLakh: number;
    buyerTeamId: string | null;
    buyerShort: string | null;
    ovr: number | null;
  } | null;
};

export function getHomeHero(): HomeHero {
  return cachedStatic("home-hero", () => {
    const db = getDb();
    const countRow = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM players p WHERE ${CURRENT_PLAYER_SQL}) AS players,
                (SELECT COUNT(*) FROM matches) AS matches,
                (SELECT COUNT(*) FROM deliveries) AS deliveries,
                (SELECT COUNT(DISTINCT season) FROM matches) AS seasons`,
      )
      .get() as { players: number; matches: number; deliveries: number; seasons: number };

    const topBuy = db
      .prepare(
        `SELECT a.player_id, p.full_name, p.role, a.winning_bid_lakh, a.base_price_lakh,
                a.buyer_team_id, bt.short_name AS buyer_short, r.ovr
         FROM auction_players a
         JOIN players p ON p.id = a.player_id
         LEFT JOIN teams bt ON bt.id = a.buyer_team_id
         LEFT JOIN player_ratings r ON r.player_id = p.id AND r.as_of_season = 2026
         WHERE a.auction_year = 2026 AND a.winning_bid_lakh IS NOT NULL
         ORDER BY a.winning_bid_lakh DESC LIMIT 1`,
      )
      .get() as
      | {
          player_id: string;
          full_name: string;
          role: string;
          winning_bid_lakh: number;
          base_price_lakh: number;
          buyer_team_id: string | null;
          buyer_short: string | null;
          ovr: number | null;
        }
      | undefined;

    return {
      counts: {
        players: countRow.players,
        matches: countRow.matches,
        deliveries: countRow.deliveries,
        seasons: countRow.seasons,
      },
      topBuy: topBuy
        ? {
            playerId: topBuy.player_id,
            name: topBuy.full_name,
            role: topBuy.role,
            winningBidLakh: topBuy.winning_bid_lakh,
            basePriceLakh: topBuy.base_price_lakh,
            buyerTeamId: topBuy.buyer_team_id,
            buyerShort: topBuy.buyer_short,
            ovr: topBuy.ovr,
          }
        : null,
    };
  });
}

export function getComparePool(): Array<{
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  teamShort: string | null;
  ovr: number | null;
}> {
  return cachedStatic("compare-pool", () => {
    const rows = getDb()
      .prepare(
        `SELECT p.id, p.full_name, p.role, t.short_name, r.ovr
         FROM players p
         LEFT JOIN player_ratings r ON r.player_id = p.id AND r.as_of_season = 2026
         LEFT JOIN teams t ON t.id = ${CURRENT_TEAM_SQL}
         WHERE r.ovr IS NOT NULL AND ${CURRENT_PLAYER_SQL}
         ORDER BY r.ovr DESC, p.full_name`,
      )
      .all() as Array<{ id: string; full_name: string; role: string; short_name: string | null; ovr: number }>;
    return rows.map((row) => ({
      id: row.id,
      name: row.full_name,
      role: row.role,
      roleLabel: roleLabel(row.role),
      teamShort: row.short_name,
      ovr: row.ovr,
    }));
  });
}

export function getFranchiseDirectory(): Array<{ id: string; name: string; shortName: string }> {
  return FRANCHISES.map((franchise) => ({
    id: franchise.id,
    name: franchise.name,
    shortName: franchise.shortName,
  }));
}
