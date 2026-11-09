import { buildDeliveryCommentary } from "./commentary";
import { hashUnit, pickWeighted } from "./random";
import type {
  BattingCard,
  BowlingCard,
  DeliveryRecord,
  InningsState,
  InningsSummary,
  MatchResult,
  MatchSetup,
  MatchState,
  SimPlayer,
  SimTeam,
  SimulateOptions,
  TeamTactics,
} from "./types";

const PHASE_WEIGHTS = {
  powerplay: { dot: 38, single: 30, two: 7, three: 0.7, four: 14, six: 5, wicket: 5 },
  middle: { dot: 34, single: 38, two: 9, three: 0.7, four: 10, six: 4.5, wicket: 5.3 },
  death: { dot: 24, single: 28, two: 9, three: 0.7, four: 14, six: 12, wicket: 8 },
} as const;

const MAX_SUPER_OVERS = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function oversFromBalls(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function teamFor(setup: MatchSetup, teamId: string): SimTeam {
  if (setup.homeTeam.id === teamId) return setup.homeTeam;
  if (setup.awayTeam.id === teamId) return setup.awayTeam;
  throw new Error(`Team ${teamId} is not part of fixture ${setup.fixtureId}`);
}

function otherTeamId(setup: MatchSetup, teamId: string): string {
  return setup.homeTeam.id === teamId ? setup.awayTeam.id : setup.homeTeam.id;
}

function findPlayer(team: SimTeam, playerId: string): SimPlayer {
  const player = team.players.find((entry) => entry.id === playerId);
  if (!player) throw new Error(`Player ${playerId} is not in the ${team.shortName} XI`);
  return player;
}

function battingOrderFor(team: SimTeam): string[] {
  return [...team.players]
    .sort((a, b) => {
      const orderA = a.battingOrder > 0 ? a.battingOrder : 99;
      const orderB = b.battingOrder > 0 ? b.battingOrder : 99;
      if (orderA !== orderB) return orderA - orderB;
      if (b.batting !== a.batting) return b.batting - a.batting;
      return a.name.localeCompare(b.name);
    })
    .map((player) => player.id);
}

function blankBattingCard(playerId: string): BattingCard {
  return {
    playerId,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    out: false,
    dismissal: null,
    bowlerId: null,
    fielderId: null,
  };
}

function blankBowlingCard(playerId: string): BowlingCard {
  return { playerId, balls: 0, runs: 0, wickets: 0, dots: 0, wides: 0, noBalls: 0 };
}

function maxOversFor(innings: InningsState): number {
  return innings.superOver ? 1 : 4;
}

function chooseBowler(state: MatchState, setup: MatchSetup, innings: InningsState, bowlingTeam: SimTeam): string {
  const ballLimit = maxOversFor(innings) * 6;
  const available = bowlingTeam.players.filter((player) => (innings.bowlers[player.id]?.balls ?? 0) < ballLimit);
  let pool = available.filter((player) => player.id !== innings.lastOverBowlerId);
  if (pool.length === 0) pool = available;
  if (pool.length === 0) pool = bowlingTeam.players;

  const entries = pool.map((player) => {
    const bowled = innings.bowlers[player.id]?.balls ?? 0;
    const freshness = 1 + Math.max(0, ballLimit - bowled) / ballLimit;
    const career = player.career;
    const strikeEdge = career?.bowlingStrikeRate
      ? clamp(22 / career.bowlingStrikeRate, 0.82, 1.22)
      : 1;
    const economyEdge = career?.economy ? clamp(8.6 / career.economy, 0.85, 1.16) : 1;
    const skill = Math.max(10, player.bowling);
    return {
      value: player.id,
      weight: Math.pow(skill, 1.55) * freshness * Math.pow(strikeEdge * economyEdge, 0.55),
    };
  });
  return pickWeighted(
    entries,
    hashUnit(state.seed, setup.fixtureId, "bowler", innings.number, innings.deliveryCount, innings.legalBalls),
  );
}

function createInnings(
  state: MatchState,
  setup: MatchSetup,
  number: number,
  battingTeam: SimTeam,
  bowlingTeam: SimTeam,
  target: number | null,
  superOver: boolean,
): InningsState {
  const order = battingOrderFor(battingTeam);
  if (order.length < 2) {
    throw new Error(`${battingTeam.shortName} need at least two players to bat`);
  }
  const innings: InningsState = {
    number,
    battingTeamId: battingTeam.id,
    bowlingTeamId: bowlingTeam.id,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: 0,
    target,
    maxBalls: superOver ? 6 : 120,
    maxWickets: superOver ? 2 : 10,
    superOver,
    strikerId: order[0],
    nonStrikerId: order[1],
    nextBatterIndex: 2,
    battingOrder: order,
    batsmen: {
      [order[0]]: blankBattingCard(order[0]),
      [order[1]]: blankBattingCard(order[1]),
    },
    bowlers: {},
    fallOfWickets: [],
    overNumber: 1,
    ballInOver: 0,
    lastOverBowlerId: null,
    bowlerId: "",
    freeHit: false,
    deliveryCount: 0,
    done: false,
  };
  innings.bowlerId = chooseBowler(state, setup, innings, bowlingTeam);
  innings.bowlers[innings.bowlerId] = blankBowlingCard(innings.bowlerId);
  return innings;
}

const NO_RESULT_CHANCE = 0.012;

function abandonedState(setup: MatchSetup): MatchState {
  const tossWinnerTeamId =
    hashUnit(setup.seed, setup.fixtureId, "toss") < 0.5 ? setup.homeTeamId : setup.awayTeamId;
  const tossDecision = hashUnit(setup.seed, setup.fixtureId, "toss-decision") < 0.68 ? "field" : "bat";
  const firstBattingTeamId = tossDecision === "bat" ? tossWinnerTeamId : otherTeamId(setup, tossWinnerTeamId);
  const secondBattingTeamId = otherTeamId(setup, firstBattingTeamId);
  return {
    version: 1,
    phase: "complete",
    seed: setup.seed,
    venue: setup.venue,
    tossWinnerTeamId,
    tossDecision,
    innings: [],
    completedInnings: [],
    target: null,
    superOver: false,
    result: {
      winnerTeamId: null,
      loserTeamId: null,
      summary: `No result — ${setup.venue ?? "the venue"} was unfit for play. Both franchises take one point.`,
      margin: "no result",
      method: "no-result",
      superOver: false,
      noResult: true,
      playerOfMatchId: null,
    },
    firstBattingTeamId,
    secondBattingTeamId,
  };
}

export function createMatchState(setup: MatchSetup): MatchState {
  if (setup.noResultEligible !== false && hashUnit(setup.seed, setup.fixtureId, "weather") < NO_RESULT_CHANCE) {
    return abandonedState(setup);
  }
  const tossWinnerTeamId =
    hashUnit(setup.seed, setup.fixtureId, "toss") < 0.5 ? setup.homeTeamId : setup.awayTeamId;
  const tossDecision = hashUnit(setup.seed, setup.fixtureId, "toss-decision") < 0.68 ? "field" : "bat";
  const firstBattingTeamId = tossDecision === "bat" ? tossWinnerTeamId : otherTeamId(setup, tossWinnerTeamId);
  const secondBattingTeamId = otherTeamId(setup, firstBattingTeamId);
  const state: MatchState = {
    version: 1,
    phase: "live",
    seed: setup.seed,
    venue: setup.venue,
    tossWinnerTeamId,
    tossDecision,
    innings: [],
    completedInnings: [],
    target: null,
    superOver: false,
    result: null,
    firstBattingTeamId,
    secondBattingTeamId,
  };
  state.innings.push(
    createInnings(state, setup, 1, teamFor(setup, firstBattingTeamId), teamFor(setup, secondBattingTeamId), null, false),
  );
  return state;
}

function currentInnings(state: MatchState): InningsState {
  const innings = state.innings[state.innings.length - 1];
  if (!innings) throw new Error("Match has no innings");
  return innings;
}

function beginNextInnings(state: MatchState, setup: MatchSetup): void {
  const firstTeam = teamFor(setup, state.firstBattingTeamId);
  const secondTeam = teamFor(setup, state.secondBattingTeamId);
  const lastNumber = state.completedInnings.length > 0 ? Math.max(...state.completedInnings) : 0;

  if (lastNumber === 1) {
    const first = state.innings.find((innings) => innings.number === 1);
    if (!first) throw new Error("First innings missing");
    const target = first.runs + 1;
    state.target = target;
    state.innings.push(createInnings(state, setup, 2, secondTeam, firstTeam, target, false));
    state.phase = "live";
    return;
  }

  if (lastNumber === 2 && state.superOver) {
    state.target = null;
    state.innings.push(createInnings(state, setup, 3, secondTeam, firstTeam, null, true));
    state.phase = "live";
    return;
  }

  if (lastNumber >= 3 && lastNumber % 2 === 1) {
    const previous = state.innings.find((innings) => innings.number === lastNumber);
    if (!previous) throw new Error("Super Over innings missing");
    const target = previous.runs + 1;
    state.target = target;
    state.innings.push(
      createInnings(state, setup, lastNumber + 1, teamFor(setup, previous.bowlingTeamId), teamFor(setup, previous.battingTeamId), target, true),
    );
    state.phase = "live";
    return;
  }

  if (lastNumber >= 4 && lastNumber % 2 === 0) {
    const pairIndex = Math.floor((lastNumber - 3) / 2);
    const firstTeamForPair = pairIndex % 2 === 0 ? firstTeam : secondTeam;
    const secondTeamForPair = pairIndex % 2 === 0 ? secondTeam : firstTeam;
    state.target = null;
    state.innings.push(
      createInnings(state, setup, lastNumber + 1, firstTeamForPair, secondTeamForPair, null, true),
    );
    state.phase = "live";
    return;
  }

  throw new Error(`Cannot begin an innings after innings ${lastNumber}`);
}

function pickFielder(
  team: SimTeam,
  state: MatchState,
  setup: MatchSetup,
  innings: InningsState,
  excludeId: string | null,
  label: string,
): SimPlayer {
  const pool = team.players.filter((player) => player.id !== excludeId);
  const entries = (pool.length > 0 ? pool : team.players).map((player) => ({
    value: player,
    weight: Math.pow(Math.max(5, player.fielding), 1.6),
  }));
  return pickWeighted(
    entries,
    hashUnit(state.seed, setup.fixtureId, innings.number, innings.deliveryCount, label),
  );
}

function keeperOf(team: SimTeam): SimPlayer {
  return (
    team.players.find((player) => player.isKeeper) ??
    team.players.find((player) => player.role === "wicketkeeper") ??
    team.players[0]
  );
}

function dismissalText(
  wicketType: string,
  fielder: SimPlayer,
  bowler: SimPlayer,
  keeper: SimPlayer,
): string {
  switch (wicketType) {
    case "caught":
      return `c ${fielder.shortName || fielder.name} b ${bowler.shortName || bowler.name}`;
    case "caught and bowled":
      return `c & b ${bowler.shortName || bowler.name}`;
    case "bowled":
      return `b ${bowler.shortName || bowler.name}`;
    case "lbw":
      return `lbw b ${bowler.shortName || bowler.name}`;
    case "run out":
      return `run out (${fielder.shortName || fielder.name})`;
    case "stumped":
      return `st ${keeper.shortName || keeper.name} b ${bowler.shortName || bowler.name}`;
    default:
      return "out";
  }
}

function outcomeWeights(args: {
  setup: MatchSetup;
  innings: InningsState;
  striker: SimPlayer;
  bowler: SimPlayer;
  battingTeam: SimTeam;
  bowlingTeam: SimTeam;
  overNumber: number;
}) {
  const { setup, innings, striker, bowler, battingTeam, bowlingTeam, overNumber } = args;
  const phase = overNumber <= 6 ? "powerplay" : overNumber <= 15 ? "middle" : "death";
  const base = PHASE_WEIGHTS[phase];
  const battingAtHome = battingTeam.id === setup.homeTeamId;
  const batSkill = striker.batting + (battingAtHome ? 2 : 0);
  const bowlSkill = bowler.bowling + (battingAtHome ? 0 : 2);
  const diff = batSkill - bowlSkill;
  const batAggression = (battingTeam.battingAggression - 50) / 50;
  const bowlAggression = (bowlingTeam.bowlingAggression - 50) / 50;

  let dot = base.dot * clamp(1 + (bowlSkill - batSkill) / 240, 0.75, 1.3);
  const single = base.single;
  const two = base.two;
  const three = base.three;
  let four = base.four * clamp(1 + diff / 260, 0.7, 1.4) * (1 + batAggression * 0.22);
  let six = base.six * clamp(1 + diff / 190, 0.6, 1.5) * (1 + batAggression * 0.35);
  let wicket =
    base.wicket *
    clamp(1 + (bowlSkill - batSkill) / 110, 0.55, 1.7) *
    (1 + batAggression * 0.3) *
    (1 + bowlAggression * 0.2);

  // IPL career record, shrunk by sample size, nudges the raw rating duel. A
  // batter who has faced 900+ career balls or a bowler with 720+ career balls
  // carries the full historical signal; small samples stay near neutral.
  const strikerCareer = striker.career ?? null;
  const bowlerCareer = bowler.career ?? null;
  const batConfidence = strikerCareer ? clamp(strikerCareer.ballsFaced / 900, 0, 1) : 0;
  const bowlConfidence = bowlerCareer ? clamp(bowlerCareer.ballsBowled / 720, 0, 1) : 0;

  if (strikerCareer && batConfidence > 0) {
    const strikeRate = strikerCareer.strikeRate;
    if (strikeRate !== null) {
      const srEdge = clamp(1 + ((strikeRate - 135) / 135) * 0.22 * batConfidence, 0.78, 1.3);
      four *= srEdge;
      six *= clamp(1 + (srEdge - 1) * 1.4, 0.72, 1.4);
      dot *= clamp(1 - (srEdge - 1) * 0.45, 0.88, 1.12);
    }
    const average = strikerCareer.battingAverage;
    if (average !== null) {
      wicket *= clamp(1 - ((average - 28) / 28) * 0.2 * batConfidence, 0.75, 1.25);
    }
  }

  if (bowlerCareer && bowlConfidence > 0) {
    const economy = bowlerCareer.economy;
    if (economy !== null) {
      const economyEdge = clamp(1 + ((8.6 - economy) / 8.6) * 0.22 * bowlConfidence, 0.78, 1.28);
      four *= economyEdge;
      six *= economyEdge;
    }
    const strikeRate = bowlerCareer.bowlingStrikeRate;
    if (strikeRate !== null) {
      wicket *= clamp(1 + ((21 - strikeRate) / 21) * 0.22 * bowlConfidence, 0.75, 1.25);
    }
    const dotPercent = bowlerCareer.dotPercent;
    if (dotPercent !== null) {
      dot *= clamp(1 + ((dotPercent - 38) / 38) * 0.15 * bowlConfidence, 0.88, 1.15);
    }
  }

  if (striker.ovr !== null || bowler.ovr !== null) {
    const ovrEdge = ((striker.ovr ?? 65) - (bowler.ovr ?? 65)) / 100;
    four *= clamp(1 + ovrEdge * 0.12, 0.94, 1.06);
    six *= clamp(1 + ovrEdge * 0.12, 0.94, 1.06);
    wicket *= clamp(1 - ovrEdge * 0.18, 0.9, 1.1);
  }

  const venue = setup.venue ?? "";
  if (/chinnaswamy|wankhede|hyderabad|mullanpur|dharamsala|guwahati/i.test(venue)) {
    four *= 1.06;
    six *= 1.07;
  } else if (/chepauk|chennai|ekana|lucknow|jaipur|kolkata/i.test(venue)) {
    four *= 0.94;
    six *= 0.92;
    dot *= 1.04;
  }

  if (innings.target !== null) {
    const ballsLeft = Math.max(1, innings.maxBalls - innings.legalBalls);
    const needed = innings.target - innings.runs;
    const requiredRate = (needed / ballsLeft) * 6;
    const currentRate = innings.legalBalls > 0 ? (innings.runs / innings.legalBalls) * 6 : 8;
    if (requiredRate > currentRate + 1.5) {
      dot *= 0.92;
      four *= 1.07;
      six *= 1.15;
      wicket *= 1.1;
    } else if (requiredRate < currentRate - 2) {
      dot *= 1.05;
      four *= 0.95;
      six *= 0.9;
      wicket *= 0.92;
    }
  }

  if (innings.superOver) {
    four *= 1.05;
    six *= 1.1;
  }

  if (innings.freeHit) wicket = 0;
  return {
    dot: Math.max(0.1, dot),
    single: Math.max(0.1, single),
    two: Math.max(0.1, two),
    three: Math.max(0.05, three),
    four: Math.max(0.1, four),
    six: Math.max(0.1, six),
    wicket: Math.max(0, wicket),
  };
}

function boundaryCountFor(state: MatchState, teamId: string): number {
  return state.innings
    .filter((innings) => innings.battingTeamId === teamId)
    .reduce((total, innings) => {
      return (
        total +
        Object.values(innings.batsmen).reduce((sum, card) => sum + card.fours + card.sixes, 0)
      );
    }, 0);
}

function impactForPlayer(state: MatchState, playerId: string): number {
  let score = 0;
  for (const innings of state.innings) {
    const batting = innings.batsmen[playerId];
    if (batting) {
      score += batting.runs + batting.fours + batting.sixes * 2;
      if (batting.out && batting.fielderId) {
        const dismissal = batting.dismissal ?? "";
        if (dismissal.startsWith("st")) score += 6;
        else if (dismissal.startsWith("run out")) score += 8;
        else if (dismissal.startsWith("c")) score += 6;
      }
    }
    const bowling = innings.bowlers[playerId];
    if (bowling) {
      score += bowling.wickets * 25 - bowling.runs * 0.3 + bowling.dots * 0.5;
    }
  }
  return score;
}

function pickPlayerOfMatch(state: MatchState, setup: MatchSetup, winnerTeamId: string): string | null {
  const winner = teamFor(setup, winnerTeamId);
  const candidates = winner.players.map((player) => ({
    player,
    impact: impactForPlayer(state, player.id),
  }));
  const max = Math.max(...candidates.map((entry) => entry.impact));
  const top = candidates.filter((entry) => entry.impact === max).sort((a, b) => a.player.id.localeCompare(b.player.id));
  if (top.length === 0) return null;
  const index = Math.floor(hashUnit(state.seed, setup.fixtureId, "player-of-match", top.length) * top.length);
  return top[index].player.id;
}

function finishRegulation(state: MatchState, setup: MatchSetup): void {
  const first = state.innings.find((innings) => innings.number === 1);
  const second = state.innings.find((innings) => innings.number === 2);
  if (!first || !second) throw new Error("Regulation innings are incomplete");

  const secondWon = second.runs > first.runs;
  const winnerTeamId = secondWon ? second.battingTeamId : first.battingTeamId;
  const loserTeamId = secondWon ? first.battingTeamId : second.battingTeamId;
  const winner = teamFor(setup, winnerTeamId);
  let margin: string;
  if (secondWon) {
    const wicketsLeft = second.maxWickets - second.wickets;
    const ballsLeft = second.maxBalls - second.legalBalls;
    margin = `${wicketsLeft} wicket${wicketsLeft === 1 ? "" : "s"}${ballsLeft > 0 ? ` (${ballsLeft} balls remaining)` : ""}`;
  } else {
    margin = `${first.runs - second.runs} run${first.runs - second.runs === 1 ? "" : "s"}`;
  }

  state.result = {
    winnerTeamId,
    loserTeamId,
    summary: `${winner.shortName} won by ${margin}.`,
    margin,
    method: secondWon ? "wickets" : "runs",
    superOver: false,
    noResult: false,
    playerOfMatchId: pickPlayerOfMatch(state, setup, winnerTeamId),
  };
  state.phase = "complete";
}

function finishSuperOver(state: MatchState, setup: MatchSetup): void {
  const soInnings = state.innings.filter((innings) => innings.superOver);
  if (soInnings.length < 2 || soInnings.length % 2 !== 0) return;
  const first = soInnings[soInnings.length - 2];
  const second = soInnings[soInnings.length - 1];
  if (second.runs === first.runs) return;

  const chaseWon = second.runs > first.runs;
  const winnerTeamId = chaseWon ? second.battingTeamId : first.battingTeamId;
  const loserTeamId = chaseWon ? first.battingTeamId : second.battingTeamId;
  const winner = teamFor(setup, winnerTeamId);
  const supervisorCount = Math.floor(soInnings.length / 2);
  const label =
    supervisorCount === 1 ? "the Super Over" : `Super Over ${supervisorCount}`;
  let margin: string;
  if (chaseWon) {
    const wicketsLeft = second.maxWickets - second.wickets;
    margin = `${wicketsLeft} wicket${wicketsLeft === 1 ? "" : "s"}`;
  } else {
    margin = `${first.runs - second.runs} run${first.runs - second.runs === 1 ? "" : "s"}`;
  }

  state.result = {
    winnerTeamId,
    loserTeamId,
    summary: `${winner.shortName} won ${label} by ${margin}.`,
    margin,
    method: "super-over",
    superOver: true,
    noResult: false,
    playerOfMatchId: pickPlayerOfMatch(state, setup, winnerTeamId),
  };
  state.phase = "complete";
}

function finishTieBreak(state: MatchState, setup: MatchSetup): void {
  const first = teamFor(setup, state.firstBattingTeamId);
  const second = teamFor(setup, state.secondBattingTeamId);
  const firstBoundaries = boundaryCountFor(state, first.id);
  const secondBoundaries = boundaryCountFor(state, second.id);
  let winnerTeamId: string;
  let method: MatchResult["method"];
  let summary: string;
  let margin: string;

  if (firstBoundaries !== secondBoundaries) {
    winnerTeamId = firstBoundaries > secondBoundaries ? first.id : second.id;
    method = "boundary-count";
    const winner = teamFor(setup, winnerTeamId);
    margin = `${Math.max(firstBoundaries, secondBoundaries)} boundaries to ${Math.min(firstBoundaries, secondBoundaries)}`;
    summary = `${winner.shortName} won on boundary countback after the Super Overs were tied (${margin}).`;
  } else {
    winnerTeamId =
      hashUnit(state.seed, setup.fixtureId, "tie-break") < 0.5 ? first.id : second.id;
    method = "tie-break";
    const winner = teamFor(setup, winnerTeamId);
    margin = "simulated tie-break";
    summary = `${winner.shortName} won a simulated tie-break after three tied Super Overs.`;
  }

  state.result = {
    winnerTeamId,
    loserTeamId: winnerTeamId === first.id ? second.id : first.id,
    summary,
    margin,
    method,
    superOver: true,
    noResult: false,
    playerOfMatchId: pickPlayerOfMatch(state, setup, winnerTeamId),
  };
  state.phase = "complete";
}

function handleInningsEnd(state: MatchState, setup: MatchSetup, innings: InningsState): void {
  if (!innings.done) return;
  if (!state.completedInnings.includes(innings.number)) {
    state.completedInnings.push(innings.number);
  }

  if (innings.number === 1) {
    state.phase = "innings_break";
    state.target = innings.runs + 1;
    return;
  }

  if (innings.number === 2) {
    const first = state.innings.find((entry) => entry.number === 1);
    if (!first) throw new Error("First innings missing");
    if (innings.runs === first.runs) {
      state.superOver = true;
      state.phase = "innings_break";
      state.target = null;
      return;
    }
    finishRegulation(state, setup);
    return;
  }

  if (innings.number % 2 === 1) {
    state.phase = "innings_break";
    state.target = innings.runs + 1;
    return;
  }

  const previous = state.innings.find((entry) => entry.number === innings.number - 1);
  if (!previous) throw new Error("Previous Super Over innings missing");
  if (innings.runs !== previous.runs) {
    finishSuperOver(state, setup);
    return;
  }
  const completedPairs = Math.floor((innings.number - 2) / 2);
  if (completedPairs >= MAX_SUPER_OVERS) {
    finishTieBreak(state, setup);
    return;
  }
  state.phase = "innings_break";
  state.target = null;
}

function ensureBowlerCard(innings: InningsState, playerId: string): BowlingCard {
  if (!innings.bowlers[playerId]) innings.bowlers[playerId] = blankBowlingCard(playerId);
  return innings.bowlers[playerId];
}

function ensureBatterCard(innings: InningsState, playerId: string): BattingCard {
  if (!innings.batsmen[playerId]) innings.batsmen[playerId] = blankBattingCard(playerId);
  return innings.batsmen[playerId];
}

function swapStrike(innings: InningsState): void {
  const striker = innings.strikerId;
  innings.strikerId = innings.nonStrikerId;
  innings.nonStrikerId = striker;
}

function milestoneFor(card: BattingCard, previousRuns: number, name: string): string | null {
  for (const threshold of [100, 50]) {
    if (previousRuns < threshold && card.runs >= threshold) {
      return `${threshold === 100 ? "HUNDRED" : "FIFTY"} for ${name}!`;
    }
  }
  return null;
}

function chaseEquation(innings: InningsState): string | null {
  if (innings.target === null || innings.done) return null;
  const ballsLeft = innings.maxBalls - innings.legalBalls;
  const needed = innings.target - innings.runs;
  if (needed <= 0 || ballsLeft <= 0) return null;
  if (ballsLeft > 24 && !innings.superOver) return null;
  return `${needed} needed from ${ballsLeft} ball${ballsLeft === 1 ? "" : "s"}.`;
}

export type DeliveryControls = {
  /** Human pick for the bowler of the upcoming over; ignored mid-over or when ineligible. */
  bowlerId?: string | null;
  /** Human pick for the next batter in after a wicket. */
  nextBatterId?: string | null;
};

export function simulateNextDelivery(
  state: MatchState,
  setup: MatchSetup,
  controls: DeliveryControls = {},
): DeliveryRecord {
  if (state.phase === "complete") throw new Error("This match is already complete");
  if (state.phase === "innings_break") beginNextInnings(state, setup);

  const innings = currentInnings(state);
  if (innings.done) throw new Error("Innings is complete but the match has not advanced");
  const battingTeam = teamFor(setup, innings.battingTeamId);
  const bowlingTeam = teamFor(setup, innings.bowlingTeamId);
  const striker = findPlayer(battingTeam, innings.strikerId);
  const nonStriker = findPlayer(battingTeam, innings.nonStrikerId);
  if (controls.bowlerId && innings.ballInOver === 0) {
    const candidate = bowlingTeam.players.find((player) => player.id === controls.bowlerId);
    const bowled = innings.bowlers[controls.bowlerId]?.balls ?? 0;
    if (
      candidate &&
      bowled < maxOversFor(innings) * 6 &&
      controls.bowlerId !== innings.lastOverBowlerId
    ) {
      innings.bowlerId = controls.bowlerId;
    }
  }
  if (!innings.bowlerId || !bowlingTeam.players.some((player) => player.id === innings.bowlerId)) {
    innings.bowlerId = chooseBowler(state, setup, innings, bowlingTeam);
  }
  const bowler = findPlayer(bowlingTeam, innings.bowlerId);
  const strikerCard = ensureBatterCard(innings, striker.id);
  const bowlerCard = ensureBowlerCard(innings, bowler.id);
  const overNumber = Math.floor(innings.legalBalls / 6) + 1;
  const ballInOver = (innings.legalBalls % 6) + 1;
  const deliveryNumber = innings.deliveryCount + 1;
  const deliveryKey = `${setup.fixtureId}:${innings.number}:${deliveryNumber}`;
  const wasFreeHit = innings.freeHit;
  const previousRuns = strikerCard.runs;

  const extraRoll = hashUnit(state.seed, deliveryKey, "extra");
  let extraType: "wide" | "nb" | null = null;
  // Roughly one or two extras a match: about 0.6% of all deliveries.
  if (extraRoll < 0.0032) extraType = "wide";
  else if (extraRoll < 0.0058) extraType = "nb";

  let runsBatter = 0;
  let runsExtras = 0;
  let wicketType: string | null = null;
  let fielder: SimPlayer | null = null;
  let milestone: string | null = null;

  if (extraType) {
    runsExtras = 1;
    bowlerCard.runs += 1;
    if (extraType === "wide") bowlerCard.wides += 1;
    else bowlerCard.noBalls += 1;
    innings.runs += 1;
    innings.extras += 1;
    innings.freeHit = extraType === "nb" ? true : innings.freeHit;
  } else {
    const weights = outcomeWeights({ setup, innings, striker, bowler, battingTeam, bowlingTeam, overNumber });
    const outcome = pickWeighted(
      [
        { value: 0, weight: weights.dot },
        { value: 1, weight: weights.single },
        { value: 2, weight: weights.two },
        { value: 3, weight: weights.three },
        { value: 4, weight: weights.four },
        { value: 6, weight: weights.six },
        { value: -1, weight: weights.wicket },
      ],
      hashUnit(state.seed, deliveryKey, "outcome"),
    );

    if (outcome === -1) {
      wicketType = pickWeighted(
        [
          { value: "caught", weight: 50 },
          { value: "bowled", weight: 20 },
          { value: "lbw", weight: 12 },
          { value: "run out", weight: 5 },
          { value: "stumped", weight: 5 },
          { value: "caught and bowled", weight: 6 },
        ],
        hashUnit(state.seed, deliveryKey, "wicket-type"),
      );
      const wicketTypeValue = wicketType;
      const keeper = keeperOf(bowlingTeam);
      if (wicketTypeValue === "caught and bowled") fielder = bowler;
      else if (wicketTypeValue === "stumped") fielder = keeper;
      else if (wicketTypeValue === "run out") fielder = pickFielder(bowlingTeam, state, setup, innings, null, "run-out-fielder");
      else if (wicketTypeValue === "caught") fielder = pickFielder(bowlingTeam, state, setup, innings, null, "catch-fielder");

      strikerCard.out = true;
      strikerCard.dismissal = dismissalText(wicketTypeValue, fielder ?? keeper, bowler, keeper);
      strikerCard.bowlerId = wicketTypeValue === "run out" ? null : bowler.id;
      strikerCard.fielderId = fielder?.id ?? null;
      strikerCard.balls += 1;

      innings.wickets += 1;
      innings.fallOfWickets.push({
        wicket: innings.wickets,
        runs: innings.runs,
        legalBalls: innings.legalBalls + 1,
        playerId: striker.id,
      });
      if (wicketTypeValue !== "run out") bowlerCard.wickets += 1;

      if (innings.wickets < innings.maxWickets && innings.nextBatterIndex < innings.battingOrder.length) {
        const pickedIndex = controls.nextBatterId
          ? innings.battingOrder.findIndex(
              (id, index) => id === controls.nextBatterId && index >= innings.nextBatterIndex,
            )
          : -1;
        let nextBatterId: string;
        if (pickedIndex >= 0) {
          nextBatterId = innings.battingOrder[pickedIndex];
          innings.battingOrder.splice(pickedIndex, 1);
          innings.battingOrder.splice(innings.nextBatterIndex, 0, nextBatterId);
        } else {
          nextBatterId = innings.battingOrder[innings.nextBatterIndex];
        }
        innings.nextBatterIndex += 1;
        innings.strikerId = nextBatterId;
        ensureBatterCard(innings, nextBatterId);
      }
    } else {
      runsBatter = outcome;
      strikerCard.runs += outcome;
      strikerCard.balls += 1;
      if (outcome === 4) strikerCard.fours += 1;
      if (outcome === 6) strikerCard.sixes += 1;
      innings.runs += outcome;
      if (outcome === 0) bowlerCard.dots += 1;
      if (outcome % 2 === 1) swapStrike(innings);
      milestone = milestoneFor(strikerCard, previousRuns, striker.shortName || striker.name);
    }
    bowlerCard.balls += 1;
    bowlerCard.runs += runsBatter;
    innings.legalBalls += 1;
    innings.freeHit = extraType === "nb" ? true : false;
  }

  const runsTotal = runsBatter + runsExtras;
  const target = innings.target;
  innings.done =
    (target !== null && innings.runs >= target) ||
    innings.wickets >= innings.maxWickets ||
    innings.legalBalls >= innings.maxBalls ||
    innings.deliveryCount >= 600;

  if (!innings.done && innings.legalBalls % 6 === 0 && innings.legalBalls > 0) {
    swapStrike(innings);
    innings.lastOverBowlerId = innings.bowlerId;
    innings.bowlerId = chooseBowler(state, setup, innings, bowlingTeam);
    ensureBowlerCard(innings, innings.bowlerId);
  }
  innings.deliveryCount += 1;
  innings.overNumber = Math.min(Math.floor(innings.legalBalls / 6) + 1, Math.ceil(innings.maxBalls / 6));
  innings.ballInOver = innings.legalBalls % 6;

  const equation = chaseEquation(innings);
  const commentary = buildDeliveryCommentary({
    seed: state.seed,
    key: deliveryKey,
    overLabel: `${overNumber}.${ballInOver}`,
    batter: striker.shortName || striker.name,
    bowler: bowler.shortName || bowler.name,
    fielder: fielder ? fielder.shortName || fielder.name : null,
    runs: runsBatter,
    extraType,
    wicketType,
    freeHit: wasFreeHit,
    milestone,
    equation,
  });

  const record: DeliveryRecord = {
    inningsNumber: innings.number,
    deliveryNumber,
    overNumber,
    ballInOver,
    batterId: striker.id,
    bowlerId: bowler.id,
    nonStrikerId: nonStriker.id,
    runsBatter,
    runsExtras,
    runsTotal,
    extraType,
    wicketType,
    playerOutId: wicketType ? striker.id : null,
    fielderId: fielder?.id ?? null,
    isLegal: extraType === null,
    freeHit: wasFreeHit,
    scoreRuns: innings.runs,
    scoreWickets: innings.wickets,
    commentary,
  };

  handleInningsEnd(state, setup, innings);
  return record;
}

export function simulateMatch(
  state: MatchState,
  setup: MatchSetup,
  options: SimulateOptions = {},
): { deliveries: DeliveryRecord[]; done: boolean } {
  const deliveries: DeliveryRecord[] = [];
  const limit = Math.max(1, Math.min(options.maxDeliveries ?? 1000, 2000));
  while (state.phase !== "complete" && deliveries.length < limit) {
    if (options.stopAtInningsBreak && deliveries.length > 0 && state.phase === "innings_break") break;
    deliveries.push(simulateNextDelivery(state, setup));
  }
  return { deliveries, done: state.phase === "complete" };
}

export function summariseInnings(innings: InningsState, setup: MatchSetup): InningsSummary {
  const battingTeam = teamFor(setup, innings.battingTeamId);
  const bowlingTeam = teamFor(setup, innings.bowlingTeamId);
  const batting = innings.battingOrder
    .map((playerId, index) => {
      const card = innings.batsmen[playerId];
      if (!card) return null;
      const player = findPlayer(battingTeam, playerId);
      return { ...card, name: player.shortName || player.name, order: index + 1 };
    })
    .filter((entry): entry is BattingCard & { name: string; order: number } => entry !== null);

  const bowling = Object.values(innings.bowlers)
    .filter((card) => card.balls > 0 || card.wides > 0 || card.noBalls > 0)
    .sort((a, b) => b.balls - a.balls || b.wickets - a.wickets)
    .map((card) => {
      const player = findPlayer(bowlingTeam, card.playerId);
      return { ...card, name: player.shortName || player.name };
    });

  return {
    number: innings.number,
    battingTeamId: innings.battingTeamId,
    bowlingTeamId: innings.bowlingTeamId,
    runs: innings.runs,
    wickets: innings.wickets,
    legalBalls: innings.legalBalls,
    extras: innings.extras,
    superOver: innings.superOver,
    batting,
    bowling,
    fallOfWickets: innings.fallOfWickets,
  };
}

export function scoreLine(innings: InningsState): string {
  return `${innings.runs}/${innings.wickets} (${oversFromBalls(innings.legalBalls)})`;
}

export function tacticsFor(tactics: TeamTactics): { battingAggression: number; bowlingAggression: number } {
  switch (tactics) {
    case "attack":
      return { battingAggression: 72, bowlingAggression: 68 };
    case "defend":
      return { battingAggression: 34, bowlingAggression: 42 };
    default:
      return { battingAggression: 50, bowlingAggression: 50 };
  }
}
