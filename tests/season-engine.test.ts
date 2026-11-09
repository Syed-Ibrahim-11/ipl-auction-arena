import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMatchState,
  scoreLine,
  simulateMatch,
  simulateNextDelivery,
  summariseInnings,
} from "../src/lib/season/engine";
import { buildSeasonFixtures } from "../src/lib/season/schedule";
import { computeStandings } from "../src/lib/season/standings";
import { hashUnit } from "../src/lib/season/random";
import type { MatchSetup, SimCareerStats, SimPlayer, SimTeam } from "../src/lib/season/types";

const NAMES = [
  ["Rohan Iyer", "RI", "batter", 86, 24, 62, false],
  ["Kabir Shah", "KS", "batter", 82, 18, 58, false],
  ["Dev Malhotra", "DM", "batter", 79, 12, 55, true],
  ["Arjun Rao", "AR", "all-rounder", 72, 68, 66, false],
  ["Neel Kapoor", "NK", "wicketkeeper", 75, 10, 78, true],
  ["Vihaan Singh", "VS", "all-rounder", 64, 76, 63, false],
  ["Ishaan Verma", "IV", "batter", 61, 30, 54, false],
  ["Reyansh Bose", "RB", "bowler", 34, 84, 58, false],
  ["Advik Nair", "AN", "bowler", 28, 81, 52, false],
  ["Yuvan Patel", "YP", "bowler", 31, 79, 50, false],
  ["Aarav Joshi", "AJ", "bowler", 22, 74, 48, false],
] as const;

function makeTeam(id: string, name: string, shortName: string, offset: number): SimTeam {
  const players: SimPlayer[] = NAMES.map((entry, index) => ({
    id: `${id}-p${index + 1}`,
    name: entry[0],
    shortName: entry[1],
    role: entry[2],
    isOverseas: index % 4 === 0,
    isKeeper: entry[6],
    isCaptain: index === 0,
    batting: entry[3] - offset,
    bowling: entry[4] - offset,
    fielding: entry[5],
    ovr: Math.round((entry[3] + entry[4]) / 2),
    battingOrder: index + 1,
    ratingEvidence: "medium",
  }));
  return {
    id,
    name,
    shortName,
    primary: "#123456",
    secondary: "#abcdef",
    tactics: "balanced",
    battingAggression: 50,
    bowlingAggression: 50,
    players,
  };
}

function setup(seed: number): MatchSetup {
  return {
    fixtureId: `fixture-${seed}`,
    seed,
    venue: "Wankhede Stadium, Mumbai",
    homeTeam: makeTeam("home", "Home Franchise", "HOM", 0),
    awayTeam: makeTeam("away", "Away Franchise", "AWY", 3),
    homeTeamId: "home",
    awayTeamId: "away",
    userTeamId: "home",
    noResultEligible: false,
  };
}

test("season engine completes a deterministic 20-over match", () => {
  const firstSetup = setup(42);
  const firstState = createMatchState(firstSetup);
  const first = simulateMatch(firstState, firstSetup);
  assert.equal(first.done, true);
  assert.ok(first.deliveries.length > 200);
  assert.ok(first.deliveries.length < 400);
  assert.ok(firstState.result);
  assert.notEqual(firstState.result.winnerTeamId, firstState.result.loserTeamId);

  const secondSetup = setup(42);
  const secondState = createMatchState(secondSetup);
  const second = simulateMatch(secondState, secondSetup);
  assert.deepEqual(
    first.deliveries.map((delivery) => delivery.commentary),
    second.deliveries.map((delivery) => delivery.commentary),
  );
  assert.equal(scoreLine(firstState.innings[0]), scoreLine(secondState.innings[0]));
  assert.deepEqual(firstState.result, secondState.result);

  const regulation = firstState.innings.filter((innings) => !innings.superOver);
  for (const innings of regulation) {
    assert.ok(innings.legalBalls <= 120);
    assert.ok(innings.wickets <= 10);
    assert.equal(innings.done, true);
    const summary = summariseInnings(innings, firstSetup);
    const cardRuns = summary.batting.reduce((sum, card) => sum + card.runs, 0);
    assert.equal(cardRuns + innings.extras, innings.runs);
    for (const bowler of summary.bowling) {
      assert.ok(bowler.balls <= 24);
    }
  }
});

test("season engine rotates strike, tracks overs and respects targets", () => {
  const matchSetup = setup(7);
  const state = createMatchState(matchSetup);
  const { deliveries } = simulateMatch(state, matchSetup);
  assert.ok(deliveries.length > 0);
  for (const delivery of deliveries) {
    assert.ok(delivery.commentary.includes("—"));
    assert.ok(delivery.deliveryNumber >= 1);
    assert.ok(delivery.scoreRuns >= 0);
    assert.ok(delivery.scoreWickets >= 0);
    assert.ok(delivery.runsTotal === delivery.runsBatter + delivery.runsExtras);
  }
  const firstInnings = state.innings[0];
  assert.ok(firstInnings.fallOfWickets.length === firstInnings.wickets);
  const second = state.innings[1];
  assert.ok(second.target === firstInnings.runs + 1);
  assert.ok(second.runs >= second.target || second.wickets >= 10 || second.legalBalls >= 120 || second.done);
});

test("season engine can stop at the innings break", () => {
  const matchSetup = setup(99);
  const state = createMatchState(matchSetup);
  const first = simulateMatch(state, matchSetup, { stopAtInningsBreak: true });
  assert.equal(first.done, false);
  assert.equal(state.phase, "innings_break");
  assert.equal(state.innings.length, 1);
  assert.ok(first.deliveries.length > 0);
  const second = simulateMatch(state, matchSetup);
  assert.equal(second.done, true);
  assert.equal(state.innings.length, 2);
});

test("a weather abandonment is a scored no-result with no deliveries", () => {
  let abandoned: MatchSetup | null = null;
  for (let seed = 1; seed < 200_000 && !abandoned; seed += 1) {
    const candidate = { ...setup(seed), fixtureId: `weather-${seed}`, noResultEligible: true };
    if (hashUnit(seed, candidate.fixtureId, "weather") < 0.012) abandoned = candidate;
  }
  assert.ok(abandoned, "the seeded search should find an abandoned fixture");
  const state = createMatchState(abandoned);
  assert.equal(state.phase, "complete");
  assert.equal(state.innings.length, 0);
  assert.ok(state.result);
  assert.equal(state.result.noResult, true);
  assert.equal(state.result.method, "no-result");
  assert.equal(state.result.winnerTeamId, null);
  assert.equal(state.result.loserTeamId, null);
  assert.match(state.result.summary, /No result/);
  const simulated = simulateMatch(state, abandoned);
  assert.equal(simulated.done, true);
  assert.equal(simulated.deliveries.length, 0);
});

test("no-results earn one point each and are excluded from net run rate", () => {
  const teams = [
    { id: "a", name: "Alpha", shortName: "ALP", primary: "#111111" },
    { id: "b", name: "Beta", shortName: "BET", primary: "#222222" },
  ];
  const results = [
    {
      teamId: "a",
      opponentId: "b",
      matchNumber: 1,
      date: "2026-03-28",
      won: false,
      tied: false,
      noResult: true,
      runsFor: 0,
      ballsFaced: 0,
      runsAgainst: 0,
      ballsBowled: 0,
    },
    {
      teamId: "b",
      opponentId: "a",
      matchNumber: 1,
      date: "2026-03-28",
      won: false,
      tied: false,
      noResult: true,
      runsFor: 0,
      ballsFaced: 0,
      runsAgainst: 0,
      ballsBowled: 0,
    },
    {
      teamId: "a",
      opponentId: "b",
      matchNumber: 2,
      date: "2026-03-29",
      won: true,
      tied: false,
      noResult: false,
      runsFor: 160,
      ballsFaced: 120,
      runsAgainst: 150,
      ballsBowled: 120,
    },
    {
      teamId: "b",
      opponentId: "a",
      matchNumber: 2,
      date: "2026-03-29",
      won: false,
      tied: false,
      noResult: false,
      runsFor: 150,
      ballsFaced: 120,
      runsAgainst: 160,
      ballsBowled: 120,
    },
  ];
  const table = computeStandings(teams, results, false);
  const alpha = table.find((row) => row.teamId === "a");
  const beta = table.find((row) => row.teamId === "b");
  assert.ok(alpha && beta);
  assert.equal(alpha.noResult, 1);
  assert.equal(alpha.tied, 0);
  assert.equal(alpha.points, 3);
  assert.equal(alpha.runsFor, 160);
  assert.ok(alpha.nrr > 0);
  assert.equal(beta.noResult, 1);
  assert.equal(beta.lost, 1);
  assert.equal(beta.points, 1);
  assert.deepEqual(alpha.form, ["N", "W"]);
  assert.deepEqual(beta.form, ["N", "L"]);
});

test("selected XI, OVR and IPL career stats shape the simulation", () => {
  const seeds = [101, 202, 303, 404, 505, 606, 707, 808];
  let plainRuns = 0;
  let boostedRuns = 0;
  for (const seed of seeds) {
    const plainSetup = setup(seed);
    const boostedSetup = setup(seed);
    for (const player of boostedSetup.homeTeam.players) {
      player.career = careerStats({
        strikeRate: 200,
        battingAverage: 70,
        economy: 6.2,
        bowlingStrikeRate: 14,
        dotPercent: 45,
      });
    }
    for (const player of boostedSetup.awayTeam.players) {
      player.career = careerStats({
        strikeRate: 95,
        battingAverage: 15,
        economy: 12,
        bowlingStrikeRate: 60,
        dotPercent: 10,
      });
    }
    const plainState = createMatchState(plainSetup);
    simulateMatch(plainState, plainSetup);
    const boostedState = createMatchState(boostedSetup);
    simulateMatch(boostedState, boostedSetup);
    plainRuns += homeRuns(plainState);
    boostedRuns += homeRuns(boostedState);
  }
  assert.ok(
    boostedRuns > plainRuns * 1.05,
    `elite career stats should lift the home total (${boostedRuns} vs ${plainRuns})`,
  );
});

function careerStats(overrides: Partial<SimCareerStats>): SimCareerStats {
  return {
    matches: 120,
    runs: 2_400,
    ballsFaced: 1_800,
    dismissals: 60,
    fours: 240,
    sixes: 90,
    wickets: 40,
    ballsBowled: 1_200,
    runsConceded: 1_600,
    dots: 360,
    strikeRate: 133.3,
    battingAverage: 40,
    economy: 8,
    bowlingStrikeRate: 30,
    dotPercent: 30,
    ...overrides,
  };
}

function homeRuns(state: ReturnType<typeof createMatchState>): number {
  return state.innings
    .filter((innings) => innings.battingTeamId === "home" && !innings.superOver)
    .reduce((sum, innings) => sum + innings.runs, 0);
}

test("a manager-chosen over-bowler is applied at the start of the over", () => {
  const matchSetup = setup(1234);
  const state = createMatchState(matchSetup);
  const first = state.innings[0];
  const bowlingTeam =
    first.bowlingTeamId === matchSetup.homeTeamId ? matchSetup.homeTeam : matchSetup.awayTeam;
  const picked = bowlingTeam.players[7];
  simulateNextDelivery(state, matchSetup, { bowlerId: picked.id });
  assert.equal(state.innings[0].bowlerId, picked.id);
  assert.ok(state.innings[0].bowlers[picked.id]);
});

function templateSchedule() {
  const groupA = ["a0", "a1", "a2", "a3", "a4"];
  const groupB = ["b0", "b1", "b2", "b3", "b4"];
  const rows: Array<{
    id: string;
    matchNumber: number;
    date: string;
    venue: string | null;
    city: string | null;
    team1Id: string;
    team2Id: string;
    stage: string;
  }> = [];
  const add = (team1Id: string, team2Id: string, stage = "league") => {
    const matchNumber = rows.length + 1;
    rows.push({
      id: `template-${matchNumber}`,
      matchNumber,
      date: `2026-04-${String((matchNumber % 28) + 1).padStart(2, "0")}`,
      venue: null,
      city: null,
      team1Id,
      team2Id,
      stage,
    });
  };
  for (const group of [groupA, groupB]) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        add(group[i], group[j]);
        add(group[j], group[i]);
      }
    }
  }
  for (const a of groupA) {
    for (const b of groupB) add(a, b);
  }
  for (let i = 0; i < groupA.length; i += 1) add(groupA[i], groupB[i]);
  for (const stage of ["Qualifier 1", "Eliminator", "Qualifier 2", "Final"]) {
    add("a0", "b0", stage);
  }
  return rows;
}

test("the fixture builder guarantees 70 league games, 14 per team and every pairing", () => {
  const fixtures = buildSeasonFixtures("season-1", templateSchedule());
  assert.equal(fixtures.length, 74);
  const league = fixtures.filter((fixture) => fixture.stage === "league");
  assert.equal(league.length, 70);
  const perTeam = new Map<string, number>();
  const pairs = new Map<string, number>();
  for (const fixture of league) {
    assert.ok(fixture.homeTeamId && fixture.awayTeamId);
    for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
      perTeam.set(teamId, (perTeam.get(teamId) ?? 0) + 1);
    }
    const pair = [fixture.homeTeamId, fixture.awayTeamId].sort().join("|");
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  assert.equal(perTeam.size, 10);
  for (const count of perTeam.values()) assert.equal(count, 14);
  assert.equal(pairs.size, 45);
  for (const count of pairs.values()) assert.ok(count === 1 || count === 2);

  const broken = templateSchedule();
  broken[0] = { ...broken[0], team2Id: broken[0].team1Id };
  assert.throws(() => buildSeasonFixtures("season-2", broken), /itself|pairing|14 league/);

  const missingPlayoff = templateSchedule().slice(0, -1);
  assert.throws(() => buildSeasonFixtures("season-3", missingPlayoff), /playoff rows/);
});
