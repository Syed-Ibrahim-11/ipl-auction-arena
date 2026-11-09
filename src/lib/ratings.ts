import type { Aggregate } from "@/lib/data/stats";
import {
  battingAverage,
  battingStrikeRate,
  boundaryBallPercent,
  dotPercent,
  economyRate,
  bowlingStrikeRate,
  emptyAggregate,
  mergeAggregate,
} from "@/lib/data/stats";

export const RATING_FORMULA_VERSION = "ipl-ovr-v2";

export type RatingRole = "batter" | "bowler" | "all-rounder" | "wicketkeeper" | "unknown";

export type RatingSeason = { season: number; agg: Aggregate };

export type RatingInput = {
  playerId: string;
  role: RatingRole;
  seasons: RatingSeason[];
};

export type DisciplineComponents = {
  label: string;
  value: number;
  peerMedian: number;
  weight: number;
  ratio: number;
};

export type DisciplineRating = {
  rating: number;
  careerRating: number;
  formRating: number | null;
  formWeight: number;
  percentile: number;
  adjustedPercentile: number;
  reliability: number;
  raw: number;
  components: DisciplineComponents[];
  sample: { matches: number; balls: number; dismissals?: number };
  asOfSeason?: number;
};

export type RatingBreakdown = {
  formulaVersion: string;
  asOfSeason: number;
  role: RatingRole;
  /** Role actually used for the OVR blend when a listed all-rounder is a specialist. */
  ovrRole?: RatingRole;
  weights: { batting: number; bowling: number; fielding: number };
  effectiveWeights: { batting: number; bowling: number; fielding: number };
  batting: DisciplineRating | null;
  bowling: DisciplineRating | null;
  fielding: DisciplineRating | null;
  pools: { batting: number; bowling: number; fielding: number };
  medians: { strikeRate: number; battingAverage: number; boundaryPct: number; economy: number; bowlingStrikeRate: number; dotPct: number; fieldingPerMatch: number };
  notes: string[];
};

export type RatingResult = {
  playerId: string;
  asOfSeason: number;
  ovr: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  evidenceQuality: "strong" | "moderate" | "limited" | "insufficient";
  breakdown: RatingBreakdown;
  sample: {
    matches: number;
    inningsBat: number;
    inningsBowl: number;
    ballsFaced: number;
    ballsBowled: number;
    seasons: number;
    firstSeason: number | null;
    lastSeason: number | null;
    recentBallsFaced: number;
    recentBallsBowled: number;
  };
};

type RawBatting = {
  strikeRate: number | null;
  average: number | null;
  boundaryPct: number | null;
  raw: number;
  components: DisciplineComponents[];
};

type RawBowling = {
  economy: number | null;
  strikeRate: number | null;
  dotPct: number | null;
  raw: number;
  components: DisciplineComponents[];
};

type RawFielding = {
  perMatch: number;
  raw: number;
};

type Prepared = {
  input: RatingInput;
  role: RatingRole;
  career: Aggregate;
  recent: Aggregate;
  seasonsPlayed: number;
  firstSeason: number | null;
  lastSeason: number | null;
  rawBatting: RawBatting | null;
  rawBowling: RawBowling | null;
  rawFielding: RawFielding | null;
  recentRawBatting: RawBatting | null;
  recentRawBowling: RawBowling | null;
};

const BATTING_POOL_BALLS = 300;
const BOWLING_POOL_BALLS = 300;
const FIELDING_POOL_MATCHES = 10;
const MIN_BATTING_BALLS = 30;
const MIN_BOWLING_BALLS = 30;
const MIN_FIELDING_MATCHES = 3;
const MIN_RECENT_BALLS = 60;

export function ratingRoleWeights(role: RatingRole): { batting: number; bowling: number; fielding: number } {
  switch (role) {
    case "batter":
      return { batting: 0.9, bowling: 0, fielding: 0.1 };
    case "bowler":
      return { batting: 0, bowling: 0.9, fielding: 0.1 };
    case "wicketkeeper":
      return { batting: 0.72, bowling: 0, fielding: 0.28 };
    case "all-rounder":
      return { batting: 0.45, bowling: 0.45, fielding: 0.1 };
    default:
      return { batting: 0.45, bowling: 0.45, fielding: 0.1 };
  }
}

/**
 * The registry role is a label, not always a summary of how a player wins
 * matches. A listed all-rounder whose batting and bowling are far apart is
 * scored as the specialist they actually are, otherwise an elite strike
 * bowler with a modest lower-order batting grade is dragged down by a
 * discipline he rarely uses. The dominant discipline carries 85% of the
 * overall grade, with fielding making up the rest.
 */
export function resolveOvrRole(
  role: RatingRole,
  batting: number | null,
  bowling: number | null,
): { role: RatingRole; weights: { batting: number; bowling: number; fielding: number } } {
  if (role === "all-rounder" && batting !== null && bowling !== null) {
    const gap = batting - bowling;
    if (gap >= 10) return { role: "batter", weights: { batting: 0.85, bowling: 0.05, fielding: 0.1 } };
    if (gap <= -10) return { role: "bowler", weights: { batting: 0.05, bowling: 0.85, fielding: 0.1 } };
  }
  if (role === "unknown" && batting !== null && bowling !== null) {
    if (batting - bowling >= 10) return { role: "batter", weights: { batting: 0.85, bowling: 0.05, fielding: 0.1 } };
    if (bowling - batting >= 10) return { role: "bowler", weights: { batting: 0.05, bowling: 0.85, fielding: 0.1 } };
  }
  return { role, weights: ratingRoleWeights(role) };
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentileRank(sorted: number[], value: number): number {
  if (sorted.length === 0) return 0.5;
  let below = 0;
  let equal = 0;
  for (const entry of sorted) {
    if (entry < value) below += 1;
    else if (entry === value) equal += 1;
  }
  return (below + equal * 0.5) / sorted.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * League-relative percentile mapped onto the familiar 0–99 OVR scale.
 * The concave curve lifts the middle of the league into the 70s while a
 * genuine top-two-percent performer lands in the mid 90s, which is how a
 * scouting board reads: most IPL cricketers are good, the outliers are rare.
 */
function toRating(adjustedPercentile: number): number {
  return clamp(Math.round(38 + 58 * Math.pow(clamp(adjustedPercentile, 0, 1), 0.75)), 32, 99);
}

function buildBattingRaw(agg: Aggregate, medians: { strikeRate: number; average: number; boundaryPct: number } | null): RawBatting {
  const sr = battingStrikeRate(agg.runs, agg.ballsFaced);
  const average = battingAverage(agg.runs, agg.dismissals);
  const boundaryPct = boundaryBallPercent(agg.fours, agg.sixes, agg.ballsFaced);
  if (!medians) {
    return {
      strikeRate: sr,
      average,
      boundaryPct,
      raw: 0,
      components: [],
    };
  }
  const components: DisciplineComponents[] = [];
  const srRatio = sr !== null && medians.strikeRate ? sr / medians.strikeRate : 1;
  components.push({
    label: "Strike rate",
    value: sr !== null ? round(sr, 1) : 0,
    peerMedian: round(medians.strikeRate, 1),
    weight: average !== null ? 0.5 : 0.8,
    ratio: round(srRatio, 3),
  });
  if (average !== null && medians.average) {
    components.push({
      label: "Batting average",
      value: round(average, 2),
      peerMedian: round(medians.average, 2),
      weight: 0.3,
      ratio: round(average / medians.average, 3),
    });
  }
  const boundaryRatio = boundaryPct !== null && medians.boundaryPct ? boundaryPct / medians.boundaryPct : 1;
  components.push({
    label: "Boundary ball %",
    value: boundaryPct !== null ? round(boundaryPct, 2) : 0,
    peerMedian: round(medians.boundaryPct, 2),
    weight: 0.2,
    ratio: round(boundaryRatio, 3),
  });
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0) || 1;
  const raw = components.reduce((sum, component) => sum + component.ratio * (component.weight / totalWeight), 0);
  return { strikeRate: sr, average, boundaryPct, raw, components };
}

function buildBowlingRaw(agg: Aggregate, medians: { economy: number; bowlingStrikeRate: number; dotPct: number } | null): RawBowling {
  const econ = economyRate(agg.runsConceded, agg.ballsBowled);
  const strike = bowlingStrikeRate(agg.ballsBowled, agg.wickets);
  const dots = dotPercent(agg.dots, agg.ballsBowled);
  if (!medians) {
    return { economy: econ, strikeRate: strike, dotPct: dots, raw: 0, components: [] };
  }
  const components: DisciplineComponents[] = [];
  const econRatio = econ !== null && medians.economy ? medians.economy / econ : 1;
  components.push({
    label: "Economy",
    value: econ !== null ? round(econ, 2) : 0,
    peerMedian: round(medians.economy, 2),
    weight: strike !== null ? 0.45 : 0.8,
    ratio: round(econRatio, 3),
  });
  if (strike !== null && medians.bowlingStrikeRate) {
    components.push({
      label: "Bowling strike rate",
      value: round(strike, 1),
      peerMedian: round(medians.bowlingStrikeRate, 1),
      weight: 0.35,
      ratio: round(medians.bowlingStrikeRate / strike, 3),
    });
  }
  const dotRatio = dots !== null && medians.dotPct ? dots / medians.dotPct : 1;
  components.push({
    label: "Dot ball %",
    value: dots !== null ? round(dots, 2) : 0,
    peerMedian: round(medians.dotPct, 2),
    weight: 0.2,
    ratio: round(dotRatio, 3),
  });
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0) || 1;
  const raw = components.reduce((sum, component) => sum + component.ratio * (component.weight / totalWeight), 0);
  return { economy: econ, strikeRate: strike, dotPct: dots, raw, components };
}

function fieldingPerMatch(agg: Aggregate): number {
  if (!agg.matches) return 0;
  return (agg.catches + agg.stumpings * 1.5 + agg.runOuts) / agg.matches;
}

export function computeRatings(inputs: RatingInput[], asOfSeason: number): Map<string, RatingResult> {
  const prepared: Prepared[] = [];
  for (const input of inputs) {
    const usable = input.seasons.filter((season) => season.season <= asOfSeason).sort((a, b) => a.season - b.season);
    if (usable.length === 0) continue;
    const career = emptyAggregate();
    for (const season of usable) mergeAggregate(career, season.agg);
    if (career.matches === 0) continue;
    const recent = emptyAggregate();
    for (const season of usable) {
      if (season.season >= asOfSeason - 1) mergeAggregate(recent, season.agg);
    }
    const rawBatting = career.ballsFaced >= MIN_BATTING_BALLS ? buildBattingRaw(career, null) : null;
    const rawBowling = career.ballsBowled >= MIN_BOWLING_BALLS ? buildBowlingRaw(career, null) : null;
    const rawFielding = career.matches >= MIN_FIELDING_MATCHES ? { perMatch: fieldingPerMatch(career), raw: fieldingPerMatch(career) } : null;
    prepared.push({
      input,
      role: input.role,
      career,
      recent,
      seasonsPlayed: new Set(usable.map((season) => season.season)).size,
      firstSeason: usable[0]?.season ?? null,
      lastSeason: usable[usable.length - 1]?.season ?? null,
      rawBatting,
      rawBowling,
      rawFielding,
      recentRawBatting: null,
      recentRawBowling: null,
    });
  }

  const battingPool = prepared.filter((row) => row.career.ballsFaced >= BATTING_POOL_BALLS);
  const bowlingPool = prepared.filter((row) => row.career.ballsBowled >= BOWLING_POOL_BALLS);
  const fieldingPool = prepared.filter((row) => row.career.matches >= FIELDING_POOL_MATCHES);
  const recentBattingPool = prepared.filter((row) => row.recent.ballsFaced >= MIN_RECENT_BALLS);
  const recentBowlingPool = prepared.filter((row) => row.recent.ballsBowled >= MIN_RECENT_BALLS);

  const medians = {
    strikeRate: median(
      battingPool
        .map((row) => battingStrikeRate(row.career.runs, row.career.ballsFaced))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b),
    ),
    average: median(
      battingPool
        .map((row) => battingAverage(row.career.runs, row.career.dismissals))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b),
    ),
    boundaryPct: median(
      battingPool
        .map((row) => boundaryBallPercent(row.career.fours, row.career.sixes, row.career.ballsFaced))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b),
    ),
    economy: median(
      bowlingPool
        .map((row) => economyRate(row.career.runsConceded, row.career.ballsBowled))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b),
    ),
    bowlingStrikeRate: median(
      bowlingPool
        .map((row) => bowlingStrikeRate(row.career.ballsBowled, row.career.wickets))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b),
    ),
    dotPct: median(
      bowlingPool
        .map((row) => dotPercent(row.career.dots, row.career.ballsBowled))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b),
    ),
    fieldingPerMatch: median(
      fieldingPool.map((row) => fieldingPerMatch(row.career)).sort((a, b) => a - b),
    ),
  };

  for (const row of prepared) {
    if (row.career.ballsFaced >= MIN_BATTING_BALLS) {
      row.rawBatting = buildBattingRaw(row.career, medians);
    }
    if (row.career.ballsBowled >= MIN_BOWLING_BALLS) {
      row.rawBowling = buildBowlingRaw(row.career, medians);
    }
    if (row.recent.ballsFaced >= MIN_RECENT_BALLS) {
      row.recentRawBatting = buildBattingRaw(row.recent, medians);
    }
    if (row.recent.ballsBowled >= MIN_RECENT_BALLS) {
      row.recentRawBowling = buildBowlingRaw(row.recent, medians);
    }
  }

  const careerBattingSorted = battingPool
    .map((row) => row.rawBatting?.raw)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  const careerBowlingSorted = bowlingPool
    .map((row) => row.rawBowling?.raw)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  const careerFieldingSorted = fieldingPool
    .map((row) => row.rawFielding?.raw)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  const recentBattingSorted = recentBattingPool
    .map((row) => row.recentRawBatting?.raw)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  const recentBowlingSorted = recentBowlingPool
    .map((row) => row.recentRawBowling?.raw)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);

  const results = new Map<string, RatingResult>();
  for (const row of prepared) {
    const batting = row.rawBatting
      ? buildDiscipline({
          raw: row.rawBatting.raw,
          components: row.rawBatting.components,
          poolSorted: careerBattingSorted,
          reliability: row.career.ballsFaced / (row.career.ballsFaced + 240),
          sample: { matches: row.career.matches, balls: row.career.ballsFaced, dismissals: row.career.dismissals },
          recentMetric: row.recentRawBatting?.raw ?? null,
          recentPoolSorted: recentBattingSorted,
          recentBalls: row.recent.ballsFaced,
          densityDivisor: 120,
        })
      : null;
    const bowling = row.rawBowling
      ? buildDiscipline({
          raw: row.rawBowling.raw,
          components: row.rawBowling.components,
          poolSorted: careerBowlingSorted,
          reliability: row.career.ballsBowled / (row.career.ballsBowled + 240),
          sample: { matches: row.career.matches, balls: row.career.ballsBowled },
          recentMetric: row.recentRawBowling?.raw ?? null,
          recentPoolSorted: recentBowlingSorted,
          recentBalls: row.recent.ballsBowled,
          densityDivisor: 120,
        })
      : null;
    const fielding = row.rawFielding
      ? buildFielding({
          raw: row.rawFielding.raw,
          poolSorted: careerFieldingSorted,
          reliability: row.career.matches / (row.career.matches + 12),
          sample: { matches: row.career.matches, balls: 0 },
          median: medians.fieldingPerMatch,
          career: row.career,
        })
      : null;

    const available = {
      batting: batting?.rating ?? null,
      bowling: bowling?.rating ?? null,
      fielding: fielding?.rating ?? null,
    };
    const resolved = resolveOvrRole(row.role, available.batting, available.bowling);
    const baseWeights = resolved.weights;
    const activeWeight =
      baseWeights.batting * (available.batting !== null ? 1 : 0) +
      baseWeights.bowling * (available.bowling !== null ? 1 : 0) +
      baseWeights.fielding * (available.fielding !== null ? 1 : 0);
    const effectiveWeights = {
      batting: activeWeight ? baseWeights.batting * (available.batting !== null ? 1 : 0) / activeWeight : 0,
      bowling: activeWeight ? baseWeights.bowling * (available.bowling !== null ? 1 : 0) / activeWeight : 0,
      fielding: activeWeight ? baseWeights.fielding * (available.fielding !== null ? 1 : 0) / activeWeight : 0,
    };
    let ovr: number | null = null;
    if (activeWeight > 0) {
      const weighted =
        (available.batting ?? 0) * effectiveWeights.batting +
        (available.bowling ?? 0) * effectiveWeights.bowling +
        (available.fielding ?? 0) * effectiveWeights.fielding;
      ovr = clamp(Math.round(weighted), 25, 99);
    }

    const primaryBalls =
      row.role === "bowler"
        ? row.career.ballsBowled
        : row.role === "batter" || row.role === "wicketkeeper"
          ? row.career.ballsFaced
          : Math.max(row.career.ballsFaced, row.career.ballsBowled);
    const evidenceQuality: RatingResult["evidenceQuality"] =
      primaryBalls >= 600 && row.career.matches >= 25
        ? "strong"
        : primaryBalls >= 200 && row.career.matches >= 8
          ? "moderate"
          : primaryBalls >= 30
            ? "limited"
            : "insufficient";

    const breakdown: RatingBreakdown = {
      formulaVersion: RATING_FORMULA_VERSION,
      asOfSeason,
      role: row.role,
      ovrRole: resolved.role,
      weights: baseWeights,
      effectiveWeights: {
        batting: round(effectiveWeights.batting, 3),
        bowling: round(effectiveWeights.bowling, 3),
        fielding: round(effectiveWeights.fielding, 3),
      },
      batting,
      bowling,
      fielding,
      pools: {
        batting: battingPool.length,
        bowling: bowlingPool.length,
        fielding: fieldingPool.length,
      },
      medians: {
        strikeRate: round(medians.strikeRate, 2),
        battingAverage: round(medians.average, 2),
        boundaryPct: round(medians.boundaryPct, 2),
        economy: round(medians.economy, 2),
        bowlingStrikeRate: round(medians.bowlingStrikeRate, 2),
        dotPct: round(medians.dotPct, 2),
        fieldingPerMatch: round(medians.fieldingPerMatch, 3),
      },
      notes: [
        `Career IPL evidence through the ${asOfSeason} season; no later matches are used.`,
        `Recent-form window: ${asOfSeason - 1}–${asOfSeason}, carrying 15–22% of each discipline grade.`,
        "A listed all-rounder whose two disciplines differ by 10+ points is graded as the specialist he actually is.",
        "Auction base prices and winning bids are not inputs to any rating.",
        `Peer percentiles use players with at least ${BATTING_POOL_BALLS} balls faced (batting), ${BOWLING_POOL_BALLS} balls bowled (bowling) and ${FIELDING_POOL_MATCHES} matches (fielding).`,
        "Small samples are shrunk toward the league median using a reliability factor.",
        "Ratings are a simulator model, not an official ICC/IPL rating.",
      ],
    };

    results.set(row.input.playerId, {
      playerId: row.input.playerId,
      asOfSeason,
      ovr,
      batting: batting?.rating ?? null,
      bowling: bowling?.rating ?? null,
      fielding: fielding?.rating ?? null,
      evidenceQuality,
      breakdown,
      sample: {
        matches: row.career.matches,
        inningsBat: row.career.inningsBat,
        inningsBowl: row.career.inningsBowl,
        ballsFaced: row.career.ballsFaced,
        ballsBowled: row.career.ballsBowled,
        seasons: row.seasonsPlayed,
        firstSeason: row.firstSeason,
        lastSeason: row.lastSeason,
        recentBallsFaced: row.recent.ballsFaced,
        recentBallsBowled: row.recent.ballsBowled,
      },
    });
  }
  return results;
}

function buildDiscipline(args: {
  raw: number;
  components: DisciplineComponents[];
  poolSorted: number[];
  reliability: number;
  sample: { matches: number; balls: number; dismissals?: number };
  recentMetric: number | null;
  recentPoolSorted: number[];
  recentBalls: number;
  densityDivisor: number;
}): DisciplineRating {
  const percentile = percentileRank(args.poolSorted, args.raw);
  const adjusted = 0.5 + (percentile - 0.5) * args.reliability;
  const careerRating = toRating(adjusted);
  let formRating: number | null = null;
  let formWeight = 0;
  if (args.recentMetric !== null && args.recentBalls >= MIN_RECENT_BALLS && args.recentPoolSorted.length >= 5) {
    const recentPercentile = percentileRank(args.recentPoolSorted, args.recentMetric);
    const recentReliability = args.recentBalls / (args.recentBalls + args.densityDivisor);
    formRating = toRating(0.5 + (recentPercentile - 0.5) * recentReliability);
    formWeight = args.recentBalls >= args.densityDivisor * 2 ? 0.22 : args.recentBalls >= args.densityDivisor ? 0.17 : 0.12;
  }
  const rating = formRating !== null
    ? Math.round(careerRating * (1 - formWeight) + formRating * formWeight)
    : careerRating;
  return {
    rating,
    careerRating,
    formRating,
    formWeight,
    percentile: round(percentile, 3),
    adjustedPercentile: round(adjusted, 3),
    reliability: round(args.reliability, 3),
    raw: round(args.raw, 3),
    components: args.components,
    sample: args.sample,
  };
}

function buildFielding(args: {
  raw: number;
  poolSorted: number[];
  reliability: number;
  sample: { matches: number; balls: number };
  median: number;
  career: Aggregate;
}): DisciplineRating {
  const percentile = percentileRank(args.poolSorted, args.raw);
  const adjusted = 0.5 + (percentile - 0.5) * args.reliability;
  const rating = toRating(adjusted);
  return {
    rating,
    careerRating: rating,
    formRating: null,
    formWeight: 0,
    percentile: round(percentile, 3),
    adjustedPercentile: round(adjusted, 3),
    reliability: round(args.reliability, 3),
    raw: round(args.raw, 3),
    components: [
      {
        label: "Dismissals per match",
        value: round(args.raw, 3),
        peerMedian: round(args.median, 3),
        weight: 1,
        ratio: args.median ? round(args.raw / args.median, 3) : 1,
      },
    ],
    sample: args.sample,
  };
}

export function describeEvidence(quality: RatingResult["evidenceQuality"]): string {
  switch (quality) {
    case "strong":
      return "Strong IPL sample";
    case "moderate":
      return "Moderate IPL sample";
    case "limited":
      return "Limited IPL sample";
    default:
      return "Insufficient IPL evidence";
  }
}
