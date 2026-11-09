import type Database from "better-sqlite3";
import { type Aggregate, emptyAggregate, mergeAggregate } from "@/lib/data/stats";
import {
  RATING_FORMULA_VERSION,
  computeRatings,
  type RatingInput,
  type RatingRole,
  type RatingResult,
} from "@/lib/ratings";

type Db = Database.Database;

type SeasonRow = {
  player_id: string;
  season: number;
  team_id: string;
  matches: number;
  innings_bat: number;
  runs: number;
  balls_faced: number;
  dismissals: number;
  not_outs: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  high_score: number;
  high_score_not_out: number;
  twenty_plus: number;
  innings_bowl: number;
  balls_bowled: number;
  runs_conceded: number;
  wickets: number;
  best_bowling_wickets: number | null;
  best_bowling_runs: number | null;
  dots: number;
  catches: number;
  run_outs: number;
  stumpings: number;
  phases_json: string | null;
};

type PhaseJson = {
  bat?: {
    pp?: Partial<Aggregate["ppBat"]>;
    mid?: Partial<Aggregate["midBat"]>;
    death?: Partial<Aggregate["deathBat"]>;
  };
  bowl?: {
    pp?: Partial<Aggregate["ppBowl"]>;
    mid?: Partial<Aggregate["midBowl"]>;
    death?: Partial<Aggregate["deathBowl"]>;
  };
};

export type RatingDistribution = {
  "90+": number;
  "85-89": number;
  "80-84": number;
  "75-79": number;
  "70-74": number;
  "65-69": number;
  "<65": number;
};

export type RecomputeSummary = {
  formulaVersion: string;
  asOfSeason: number;
  ratedPlayers: number;
  seasonVersions: number;
  distribution: RatingDistribution;
  top: Array<{ name: string; ovr: number | null; role: string }>;
};

function toAggregate(row: SeasonRow): Aggregate {
  const agg = emptyAggregate();
  agg.matches = row.matches;
  agg.inningsBat = row.innings_bat;
  agg.runs = row.runs;
  agg.ballsFaced = row.balls_faced;
  agg.dismissals = row.dismissals;
  agg.notOuts = row.not_outs;
  agg.fours = row.fours;
  agg.sixes = row.sixes;
  agg.fifties = row.fifties;
  agg.hundreds = row.hundreds;
  agg.highScore = row.high_score;
  agg.highScoreNotOut = row.high_score_not_out === 1;
  agg.twentyPlus = row.twenty_plus;
  agg.inningsBowl = row.innings_bowl;
  agg.ballsBowled = row.balls_bowled;
  agg.runsConceded = row.runs_conceded;
  agg.wickets = row.wickets;
  agg.bestBowlingWickets = row.best_bowling_wickets;
  agg.bestBowlingRuns = row.best_bowling_runs;
  agg.dots = row.dots;
  agg.catches = row.catches;
  agg.runOuts = row.run_outs;
  agg.stumpings = row.stumpings;
  if (row.phases_json) {
    try {
      const parsed = JSON.parse(row.phases_json) as PhaseJson;
      if (parsed.bat?.pp) Object.assign(agg.ppBat, parsed.bat.pp);
      if (parsed.bat?.mid) Object.assign(agg.midBat, parsed.bat.mid);
      if (parsed.bat?.death) Object.assign(agg.deathBat, parsed.bat.death);
      if (parsed.bowl?.pp) Object.assign(agg.ppBowl, parsed.bowl.pp);
      if (parsed.bowl?.mid) Object.assign(agg.midBowl, parsed.bowl.mid);
      if (parsed.bowl?.death) Object.assign(agg.deathBowl, parsed.bowl.death);
    } catch {
      // A malformed phase block should not block a full rating refresh.
    }
  }
  return agg;
}

function isRatingRole(value: string): value is RatingRole {
  return value === "batter" || value === "bowler" || value === "all-rounder" || value === "wicketkeeper";
}

function bandOf(ovr: number, min: number, max: number): boolean {
  return ovr >= min && ovr <= max;
}

/** Rebuild every stored rating from the season aggregates currently in the database. */
export function recomputeRatings(db: Db, computedAt = new Date().toISOString()): RecomputeSummary {
  const players = db.prepare("SELECT id, full_name, role FROM players").all() as Array<{
    id: string;
    full_name: string;
    role: string;
  }>;
  const roleById = new Map(players.map((row) => [row.id, isRatingRole(row.role) ? row.role : "unknown"]));
  const nameById = new Map(players.map((row) => [row.id, row.full_name]));

  const rows = db
    .prepare(
      `SELECT player_id, season, team_id, matches, innings_bat, runs, balls_faced, dismissals, not_outs,
              fours, sixes, fifties, hundreds, high_score, high_score_not_out, twenty_plus,
              innings_bowl, balls_bowled, runs_conceded, wickets, best_bowling_wickets, best_bowling_runs,
              dots, catches, run_outs, stumpings, phases_json
       FROM player_season_stats`,
    )
    .all() as SeasonRow[];

  const byPlayer = new Map<string, Map<number, Aggregate>>();
  const seasons = new Set<number>();
  for (const row of rows) {
    seasons.add(row.season);
    let seasonMap = byPlayer.get(row.player_id);
    if (!seasonMap) {
      seasonMap = new Map();
      byPlayer.set(row.player_id, seasonMap);
    }
    const existing = seasonMap.get(row.season) ?? emptyAggregate();
    mergeAggregate(existing, toAggregate(row));
    seasonMap.set(row.season, existing);
  }

  const inputs: RatingInput[] = [];
  for (const [playerId, seasonMap] of byPlayer) {
    inputs.push({
      playerId,
      role: roleById.get(playerId) ?? "unknown",
      seasons: [...seasonMap.entries()].map(([season, agg]) => ({ season, agg })),
    });
  }

  const asOfSeasons = [...seasons].sort((a, b) => a - b);
  const latest = asOfSeasons[asOfSeasons.length - 1] ?? 2026;
  const results = new Map<number, Map<string, RatingResult>>();
  for (const asOf of asOfSeasons) results.set(asOf, computeRatings(inputs, asOf));

  const upsertVersion = db.prepare(`
    INSERT INTO player_rating_versions (
      player_id, as_of_season, formula_version, role, ovr, batting, bowling, fielding,
      batting_raw, bowling_raw, fielding_raw, evidence_quality, breakdown_json, sample_json, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (player_id, as_of_season) DO UPDATE SET
      formula_version = excluded.formula_version,
      role = excluded.role,
      ovr = excluded.ovr,
      batting = excluded.batting,
      bowling = excluded.bowling,
      fielding = excluded.fielding,
      batting_raw = excluded.batting_raw,
      bowling_raw = excluded.bowling_raw,
      fielding_raw = excluded.fielding_raw,
      evidence_quality = excluded.evidence_quality,
      breakdown_json = excluded.breakdown_json,
      sample_json = excluded.sample_json,
      computed_at = excluded.computed_at
  `);
  const upsertCurrent = db.prepare(`
    INSERT INTO player_ratings (
      player_id, formula_version, as_of_season, role, ovr, batting, bowling, fielding,
      batting_raw, bowling_raw, fielding_raw, evidence_quality, breakdown_json, sample_json, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (player_id) DO UPDATE SET
      formula_version = excluded.formula_version,
      as_of_season = excluded.as_of_season,
      role = excluded.role,
      ovr = excluded.ovr,
      batting = excluded.batting,
      bowling = excluded.bowling,
      fielding = excluded.fielding,
      batting_raw = excluded.batting_raw,
      bowling_raw = excluded.bowling_raw,
      fielding_raw = excluded.fielding_raw,
      evidence_quality = excluded.evidence_quality,
      breakdown_json = excluded.breakdown_json,
      sample_json = excluded.sample_json,
      computed_at = excluded.computed_at
  `);

  const write = db.transaction(() => {
    for (const [asOf, ratings] of results) {
      for (const rating of ratings.values()) {
        upsertVersion.run(
          rating.playerId,
          asOf,
          RATING_FORMULA_VERSION,
          rating.breakdown.role,
          rating.ovr,
          rating.batting,
          rating.bowling,
          rating.fielding,
          rating.breakdown.batting?.raw ?? null,
          rating.breakdown.bowling?.raw ?? null,
          rating.breakdown.fielding?.raw ?? null,
          rating.evidenceQuality,
          JSON.stringify(rating.breakdown),
          JSON.stringify(rating.sample),
          computedAt,
        );
      }
    }
    for (const rating of (results.get(latest) ?? new Map()).values()) {
      upsertCurrent.run(
        rating.playerId,
        RATING_FORMULA_VERSION,
        latest,
        rating.breakdown.role,
        rating.ovr,
        rating.batting,
        rating.bowling,
        rating.fielding,
        rating.breakdown.batting?.raw ?? null,
        rating.breakdown.bowling?.raw ?? null,
        rating.breakdown.fielding?.raw ?? null,
        rating.evidenceQuality,
        JSON.stringify(rating.breakdown),
        JSON.stringify(rating.sample),
        computedAt,
      );
    }
  });
  write();

  const current = [...(results.get(latest)?.values() ?? [])].filter((row) => row.ovr !== null);
  const distribution: RatingDistribution = {
    "90+": current.filter((row) => bandOf(row.ovr!, 90, 100)).length,
    "85-89": current.filter((row) => bandOf(row.ovr!, 85, 89)).length,
    "80-84": current.filter((row) => bandOf(row.ovr!, 80, 84)).length,
    "75-79": current.filter((row) => bandOf(row.ovr!, 75, 79)).length,
    "70-74": current.filter((row) => bandOf(row.ovr!, 70, 74)).length,
    "65-69": current.filter((row) => bandOf(row.ovr!, 65, 69)).length,
    "<65": current.filter((row) => bandOf(row.ovr!, 0, 64)).length,
  };
  const top = current
    .slice()
    .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))
    .slice(0, 12)
    .map((row) => ({
      name: nameById.get(row.playerId) ?? row.playerId,
      ovr: row.ovr,
      role: row.breakdown.role,
    }));

  return {
    formulaVersion: RATING_FORMULA_VERSION,
    asOfSeason: latest,
    ratedPlayers: current.length,
    seasonVersions: results.size,
    distribution,
    top,
  };
}
