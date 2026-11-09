export type PhaseBat = {
  runs: number;
  balls: number;
  dismissals: number;
  fours: number;
  sixes: number;
};

export type PhaseBowl = {
  balls: number;
  runs: number;
  wickets: number;
  dots: number;
};

export type Aggregate = {
  matches: number;
  inningsBat: number;
  runs: number;
  ballsFaced: number;
  dismissals: number;
  notOuts: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  highScore: number;
  highScoreNotOut: boolean;
  twentyPlus: number;
  inningsBowl: number;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  bestBowlingWickets: number | null;
  bestBowlingRuns: number | null;
  dots: number;
  catches: number;
  runOuts: number;
  stumpings: number;
  ppBat: PhaseBat;
  midBat: PhaseBat;
  deathBat: PhaseBat;
  ppBowl: PhaseBowl;
  midBowl: PhaseBowl;
  deathBowl: PhaseBowl;
};

export function emptyPhaseBat(): PhaseBat {
  return { runs: 0, balls: 0, dismissals: 0, fours: 0, sixes: 0 };
}

export function emptyPhaseBowl(): PhaseBowl {
  return { balls: 0, runs: 0, wickets: 0, dots: 0 };
}

export function emptyAggregate(): Aggregate {
  return {
    matches: 0,
    inningsBat: 0,
    runs: 0,
    ballsFaced: 0,
    dismissals: 0,
    notOuts: 0,
    fours: 0,
    sixes: 0,
    fifties: 0,
    hundreds: 0,
    highScore: 0,
    highScoreNotOut: false,
    twentyPlus: 0,
    inningsBowl: 0,
    ballsBowled: 0,
    runsConceded: 0,
    wickets: 0,
    bestBowlingWickets: null,
    bestBowlingRuns: null,
    dots: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    ppBat: emptyPhaseBat(),
    midBat: emptyPhaseBat(),
    deathBat: emptyPhaseBat(),
    ppBowl: emptyPhaseBowl(),
    midBowl: emptyPhaseBowl(),
    deathBowl: emptyPhaseBowl(),
  };
}

export function cloneAggregate(source: Aggregate): Aggregate {
  return {
    ...source,
    ppBat: { ...source.ppBat },
    midBat: { ...source.midBat },
    deathBat: { ...source.deathBat },
    ppBowl: { ...source.ppBowl },
    midBowl: { ...source.midBowl },
    deathBowl: { ...source.deathBowl },
  };
}

export function mergeAggregate(target: Aggregate, source: Aggregate): Aggregate {
  target.matches += source.matches;
  target.inningsBat += source.inningsBat;
  target.runs += source.runs;
  target.ballsFaced += source.ballsFaced;
  target.dismissals += source.dismissals;
  target.notOuts += source.notOuts;
  target.fours += source.fours;
  target.sixes += source.sixes;
  target.fifties += source.fifties;
  target.hundreds += source.hundreds;
  if (
    source.highScore > target.highScore ||
    (source.highScore === target.highScore && source.highScoreNotOut && !target.highScoreNotOut)
  ) {
    target.highScore = source.highScore;
    target.highScoreNotOut = source.highScoreNotOut;
  }
  target.twentyPlus += source.twentyPlus;
  target.inningsBowl += source.inningsBowl;
  target.ballsBowled += source.ballsBowled;
  target.runsConceded += source.runsConceded;
  target.wickets += source.wickets;
  if (
    source.bestBowlingWickets !== null &&
    (target.bestBowlingWickets === null ||
      source.bestBowlingWickets > target.bestBowlingWickets ||
      (source.bestBowlingWickets === target.bestBowlingWickets &&
        (source.bestBowlingRuns ?? 0) < (target.bestBowlingRuns ?? Infinity)))
  ) {
    target.bestBowlingWickets = source.bestBowlingWickets;
    target.bestBowlingRuns = source.bestBowlingRuns;
  }
  target.dots += source.dots;
  target.catches += source.catches;
  target.runOuts += source.runOuts;
  target.stumpings += source.stumpings;

  addPhaseBat(target.ppBat, source.ppBat);
  addPhaseBat(target.midBat, source.midBat);
  addPhaseBat(target.deathBat, source.deathBat);
  addPhaseBowl(target.ppBowl, source.ppBowl);
  addPhaseBowl(target.midBowl, source.midBowl);
  addPhaseBowl(target.deathBowl, source.deathBowl);
  return target;
}

export function addPhaseBat(target: PhaseBat, source: PhaseBat): void {
  target.runs += source.runs;
  target.balls += source.balls;
  target.dismissals += source.dismissals;
  target.fours += source.fours;
  target.sixes += source.sixes;
}

export function addPhaseBowl(target: PhaseBowl, source: PhaseBowl): void {
  target.balls += source.balls;
  target.runs += source.runs;
  target.wickets += source.wickets;
  target.dots += source.dots;
}

export type PhaseKey = "pp" | "mid" | "death";

export function phaseForOver(over: number): PhaseKey {
  if (over < 6) return "pp";
  if (over >= 15) return "death";
  return "mid";
}

export function battingStrikeRate(runs: number, ballsFaced: number): number | null {
  if (!ballsFaced) return null;
  return (runs / ballsFaced) * 100;
}

export function battingAverage(runs: number, dismissals: number): number | null {
  if (!dismissals) return null;
  return runs / dismissals;
}

export function boundaryRunPercent(fours: number, sixes: number, runs: number): number | null {
  if (!runs) return null;
  return ((fours * 4 + sixes * 6) / runs) * 100;
}

export function boundaryBallPercent(fours: number, sixes: number, ballsFaced: number): number | null {
  if (!ballsFaced) return null;
  return ((fours + sixes) / ballsFaced) * 100;
}

export function economyRate(runsConceded: number, ballsBowled: number): number | null {
  if (!ballsBowled) return null;
  return runsConceded / (ballsBowled / 6);
}

export function bowlingAverage(runsConceded: number, wickets: number): number | null {
  if (!wickets) return null;
  return runsConceded / wickets;
}

export function bowlingStrikeRate(ballsBowled: number, wickets: number): number | null {
  if (!wickets) return null;
  return ballsBowled / wickets;
}

export function dotPercent(dots: number, ballsBowled: number): number | null {
  if (!ballsBowled) return null;
  return (dots / ballsBowled) * 100;
}

export function oversText(balls: number): string {
  const overs = Math.floor(balls / 6);
  const remainder = balls % 6;
  return `${overs}.${remainder}`;
}

export function wicketsPerMatch(wickets: number, matches: number): number | null {
  if (!matches) return null;
  return wickets / matches;
}

export function fieldingDismissals(catches: number, runOuts: number, stumpings: number): number {
  return catches + runOuts + stumpings;
}
