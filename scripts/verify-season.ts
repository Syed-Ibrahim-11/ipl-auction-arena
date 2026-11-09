import { getDb } from "@/db";
import { actOnSession, createSession } from "@/lib/auction/service";
import type { AuctionSnapshot } from "@/lib/auction/types";
import { applySeasonAction, startSeason } from "@/lib/season/service";
import { getMatchScorecard } from "@/lib/season/snapshot";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function autoBid(snapshot: AuctionSnapshot): AuctionSnapshot | null {
  const lot = snapshot.currentLot;
  if (!lot || lot.status !== "live" || lot.userBidBlockedReason !== null || lot.nextBidLakh === null) {
    return null;
  }
  const squadSize = snapshot.userSquad.length;
  if (squadSize >= 25) return null;
  return actOnSession(snapshot.session.id, { type: "bid", amountLakh: lot.nextBidLakh });
}

let snapshot = createSession({ modeId: "mini-2026", userTeamId: "mumbai-indians" });
console.log(`auction ${snapshot.session.id} · ${snapshot.session.totalLots} lots`);
let ticks = 0;
for (; ticks < 4000 && !snapshot.finished; ticks += 1) {
  const afterBid = autoBid(snapshot);
  if (afterBid) {
    snapshot = afterBid;
    if (snapshot.finished) break;
  }
  snapshot = actOnSession(snapshot.session.id, { type: "tick" });
}
assert(snapshot.finished, "auction should finish");
console.log(`auction finished in ${ticks} ticks · status ${snapshot.session.status}`);

const squads = getDb()
  .prepare("SELECT team_id, COUNT(*) AS count FROM session_squads WHERE session_id = ? GROUP BY team_id")
  .all(snapshot.session.id) as Array<{ team_id: string; count: number }>;
console.log("squads", squads.map((row) => `${row.team_id}:${row.count}`).join(" "));
assert(squads.length === 10, "all ten teams must have players");
for (const squad of squads) {
  assert(squad.count >= 11, `${squad.team_id} must own at least 11 players for a tournament XI, got ${squad.count}`);
}

const season = startSeason(snapshot.session.id);
console.log(`season ${season.season.id} started · ${season.progress.totalMatches} fixtures`);
const callups = getDb()
  .prepare("SELECT COUNT(*) AS count FROM season_callups WHERE season_id = ?")
  .get(season.season.id) as { count: number };
assert(callups.count === 0, "a tournament must use bought squads only, with no call-ups");

const league = season.fixtures.filter((fixture) => fixture.stage === "league");
assert(league.length === 70, `expected 70 league fixtures, got ${league.length}`);
assert(season.fixtures.length === 74, `expected 74 fixtures, got ${season.fixtures.length}`);
const perTeam = new Map<string, { total: number; home: number; away: number }>();
for (const fixture of league) {
  for (const [teamId, side] of [
    [fixture.homeTeamId, "home"],
    [fixture.awayTeamId, "away"],
  ] as const) {
    if (!teamId) continue;
    const entry = perTeam.get(teamId) ?? { total: 0, home: 0, away: 0 };
    entry.total += 1;
    entry[side] += 1;
    perTeam.set(teamId, entry);
  }
}
assert(perTeam.size === 10, `expected 10 teams in league, got ${perTeam.size}`);
for (const [teamId, counts] of perTeam) {
  assert(counts.total === 14, `${teamId} should play 14 league matches, got ${counts.total}`);
  assert(counts.home + counts.away === counts.total, `${teamId} home/away split does not add up`);
}
const pairCounts = new Map<string, number>();
for (const fixture of league) {
  const key = [fixture.homeTeamId, fixture.awayTeamId].sort().join("|");
  pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
}
assert(pairCounts.size === 45, `expected 45 unique pairings, got ${pairCounts.size}`);
for (const [pair, count] of pairCounts) {
  assert(count >= 1 && count <= 2, `pair ${pair} should meet once or twice, got ${count}`);
}
const doubleMeetings = [...pairCounts.values()].filter((count) => count === 2).length;
const singleMeetings = [...pairCounts.values()].filter((count) => count === 1).length;
assert(doubleMeetings + singleMeetings === 45, "every pairing should be present");
console.log(
  `schedule assertions passed: 70 league · 14 per team · 45 pairings (${doubleMeetings} home-and-away, ${singleMeetings} single)`,
  `· home split ${[...perTeam.values()].map((entry) => entry.home).join("/")}`,
);

const advanced = applySeasonAction(snapshot.session.id, { type: "advance", scope: "season" });
assert(advanced.progress.totalPlayed === 74, `expected 74 completed games, got ${advanced.progress.totalPlayed}`);
assert(advanced.season.status === "completed", `season should be completed, got ${advanced.season.status}`);
assert(advanced.champion !== null, "champion should be crowned");
assert(advanced.awards.length > 0, "awards should be computed");
console.log(
  `season completed · champion ${advanced.champion?.name ?? advanced.season.championTeamId} · awards ${advanced.awards.length}`,
);
console.log(
  "playoffs",
  advanced.fixtures
    .filter((fixture) => fixture.stage !== "league")
    .map((fixture) => `${fixture.stage}:${fixture.winnerTeamId ?? fixture.status}`)
    .join(" · "),
);
console.log(
  "awards",
  advanced.awards.map((award) => `${award.label}: ${award.playerName || award.teamShort || "—"}`).join(" · "),
);

const standingsB = advanced.standings[1];
assert(standingsB, "standings should have at least two rows");
const sample = advanced.fixtures.find(
  (fixture) => fixture.stage === "league" && fixture.status === "completed" && fixture.homeScore !== null,
);
assert(sample, "at least one league fixture should have a played scorecard");
const abandoned = advanced.fixtures.filter(
  (fixture) => fixture.stage === "league" && fixture.resultSummary?.startsWith("No result"),
);
console.log(`no-result fixtures ${abandoned.length}`);
const card = getMatchScorecard(snapshot.session.id, sample.id);
assert(card, "match scorecard should exist");
assert(card.innings.length === 2, `expected 2 innings, got ${card.innings.length}`);
for (const innings of card.innings) {
  assert(innings.legalBalls > 0 && innings.legalBalls <= 120, `innings balls out of range: ${innings.legalBalls}`);
  assert(innings.batting.length > 0, "innings should have batting cards");
  assert(innings.bowling.length > 0, "innings should have bowling cards");
}
assert(advanced.nextFixture === null || advanced.season.status === "completed", "no next fixture after completion");

console.log(
  `scorecard sample ${sample.homeTeamName ?? sample.homeTeamId} vs ${sample.awayTeamName ?? sample.awayTeamId}:`,
  card.innings
    .map(
      (innings) =>
        `${innings.battingTeamId} ${innings.runs}/${innings.wickets} (${(innings.legalBalls / 6).toFixed(1)} ov)`,
    )
    .join(" · "),
);
console.log("season verification passed");
