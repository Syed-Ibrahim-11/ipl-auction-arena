import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { hashUnit } from "./random";
import {
  buildSeasonFixtures,
  scheduleNote,
  scheduleSource,
  type ScheduleTemplateMatch,
  type SeasonFixtureSeed,
} from "./schedule";
import { autoSelectXi, validateLineup, type AutoXiCandidate } from "./lineup";
import {
  buildMatchSetup,
  computeStandingsForSeason,
  fallbackBatting,
  fallbackBowling,
  humanTeamIds,
  leagueComplete,
  loadFixture,
  loadFixtures,
  loadSeasonBySession,
  loadSession,
  loadTeamSquad,
  loadLineupRows,
  resolveViewerTeamId,
  seasonSquadIssues,
  nowIso,
  parseJson,
  type Db,
  type FixtureRow,
  type SeasonRow,
  type SquadPlayer,
} from "./internal";
import { buildSeasonSnapshot, getSeasonLaunchInfo, getSeasonSnapshot } from "./snapshot";
import { createMatchState, simulateMatch, simulateNextDelivery, scoreLine, tacticsFor } from "./engine";
import type {
  DeliveryRecord,
  LineupInput,
  MatchSetup,
  MatchState,
  SeasonSnapshot,
  TeamTactics,
} from "./types";
import { SeasonError } from "./types";

export { getSeasonLaunchInfo, getMatchScorecard, getSeasonSnapshotForSession } from "./snapshot";
export { getSeasonSnapshot } from "./snapshot";

export type SeasonAction =
  | { type: "start-match"; fixtureId: string }
  | { type: "ready-check"; fixtureId: string }
  | {
      type: "simulate";
      fixtureId: string;
      amount: "ball" | "over" | "innings" | "match";
      bowlerId?: string | null;
      nextBatterId?: string | null;
    }
  | { type: "advance"; scope: "other" | "matchday" | "league" | "season" }
  | { type: "set-lineup"; lineup: LineupInput }
  | { type: "auto-lineup" }
  | {
      type: "set-tactics";
      tactics: TeamTactics;
      battingAggression?: number;
      bowlingAggression?: number;
    };

interface SessionTeamSeedRow {
  team_id: string;
  is_human: number;
  ai_profile: string;
}

function teamTactics(profile: string, isUser: boolean): { tactics: TeamTactics; batting: number; bowling: number } {
  if (isUser) return { tactics: "balanced", batting: 50, bowling: 50 };
  switch (profile) {
    case "aggressive": {
      const preset = tacticsFor("attack");
      return { tactics: "attack", batting: preset.battingAggression, bowling: preset.bowlingAggression };
    }
    case "maverick":
      return { tactics: "attack", batting: 78, bowling: 66 };
    case "conservative": {
      const preset = tacticsFor("defend");
      return { tactics: "defend", batting: preset.battingAggression, bowling: preset.bowlingAggression };
    }
    case "analytical":
      return { tactics: "balanced", batting: 55, bowling: 55 };
    default:
      return { tactics: "balanced", batting: 50, bowling: 50 };
  }
}

function candidateFor(player: SquadPlayer): AutoXiCandidate {
  return {
    id: player.playerId,
    name: player.name,
    role: player.role,
    isOverseas: player.isOverseas,
    isKeeper: player.role === "wicketkeeper",
    batting: player.batting ?? fallbackBatting(player.role),
    bowling: player.bowling ?? fallbackBowling(player.role),
    fielding: player.fielding ?? 50,
    score:
      player.ovr ??
      Math.round(
        (player.batting ?? fallbackBatting(player.role)) * 0.55 +
          (player.bowling ?? fallbackBowling(player.role)) * 0.3 +
          (player.fielding ?? 50) * 0.15,
      ),
  };
}

export function startSeason(sessionId: string): SeasonSnapshot {
  const db = getDb();
  const launch = getSeasonLaunchInfo(sessionId);
  if (launch.seasonId) return getSeasonSnapshot(launch.seasonId);
  if (!launch.canStart) {
    throw new SeasonError("SEASON_BLOCKED", launch.blockedReason ?? "The season cannot begin yet.", 400);
  }

  const session = loadSession(db, sessionId);
  if (session.status !== "completed") {
    throw new SeasonError("AUCTION_INCOMPLETE", "Complete the auction before starting the season.", 400);
  }
  const squadIssues = seasonSquadIssues(db, sessionId);
  if (squadIssues.length > 0) {
    throw new SeasonError(
      "SQUADS_TOO_SHORT",
      `The tournament uses the bought squads only. ${squadIssues
        .map((issue) => `${issue.teamName} ${issue.reason}`)
        .join("; ")}.`,
      409,
    );
  }
  const config = parseJson<{ asOfSeason?: number }>(session.config_json, {});
  const asOfSeason = Number.isInteger(config.asOfSeason) ? Number(config.asOfSeason) : session.season - 1;
  const seasonId = randomUUID();
  const seasonSeed = Math.floor(hashUnit(sessionId, "season") * 2_000_000_000) + 1;

  // The auction mode's season label (2025, 2027, …) is not necessarily an archived
  // fixture year, so try the mode's reference season first, then every archive newest
  // to oldest, and use the newest one that actually forms a legal 70-match template.
  const archivedSeasons = (
    db
      .prepare(`SELECT DISTINCT season FROM matches WHERE match_number IS NOT NULL ORDER BY season DESC`)
      .all() as Array<{ season: number }>
  ).map((row) => row.season);
  const candidateSeasons: number[] = [];
  for (const season of [asOfSeason, session.season, ...archivedSeasons]) {
    if (Number.isInteger(season) && !candidateSeasons.includes(season)) candidateSeasons.push(season);
  }

  const templateQuery = db.prepare(
    `SELECT id, match_number, date, venue, city, team1_id, team2_id, stage
     FROM matches WHERE season = ? AND match_number IS NOT NULL ORDER BY match_number`,
  );
  let fixtures: SeasonFixtureSeed[] | null = null;
  let archiveSeason: number | null = null;
  let lastError: Error | null = null;
  for (const candidate of candidateSeasons) {
    const rows = templateQuery.all(candidate) as Array<{
      id: string;
      match_number: number;
      date: string;
      venue: string | null;
      city: string | null;
      team1_id: string;
      team2_id: string;
      stage: string | null;
    }>;
    if (rows.length === 0) continue;
    const scheduleTemplates: ScheduleTemplateMatch[] = rows.map((row) => ({
      id: row.id,
      matchNumber: row.match_number,
      date: row.date,
      venue: row.venue,
      city: row.city,
      team1Id: row.team1_id,
      team2Id: row.team2_id,
      stage: row.stage ?? "",
    }));
    try {
      fixtures = buildSeasonFixtures(seasonId, scheduleTemplates);
      archiveSeason = candidate;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : null;
    }
  }
  if (!fixtures || archiveSeason === null) {
    throw new SeasonError(
      "SCHEDULE_UNAVAILABLE",
      lastError?.message ??
        `No archived IPL season provides a valid schedule template: 70 league matches, 10 teams, 14 per team and four playoffs are required.`,
      500,
    );
  }
  const builtFixtures: SeasonFixtureSeed[] = fixtures;
  const templateSeason: number = archiveSeason;

  const sessionTeams = db
    .prepare(
      `SELECT st.team_id, st.is_human, st.ai_profile
       FROM session_teams st WHERE st.session_id = ? ORDER BY st.team_id`,
    )
    .all(sessionId) as SessionTeamSeedRow[];
  if (sessionTeams.length !== 10) {
    throw new SeasonError("TEAMS_INCOMPLETE", "A season requires all ten franchises in the auction session.", 400);
  }
  const teamIds = new Set(sessionTeams.map((team) => team.team_id));
  for (const fixture of builtFixtures) {
    if (fixture.stage === "league") {
      if (
        !fixture.homeTeamId ||
        !fixture.awayTeamId ||
        !teamIds.has(fixture.homeTeamId) ||
        !teamIds.has(fixture.awayTeamId)
      ) {
        throw new SeasonError(
          "SCHEDULE_TEAM_MISMATCH",
          `The ${templateSeason} schedule includes a franchise that is not part of this auction.`,
          500,
        );
      }
    }
  }

  const created = nowIso();
  const squads = new Map<string, SquadPlayer[]>();
  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO seasons (
         id, session_id, status, season_year, as_of_season, user_team_id, schedule_source,
         schedule_note, seed, champion_team_id, runner_up_team_id, started_at, completed_at,
         result_json, updated_at
       ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, ?)`,
    ).run(
      seasonId,
      sessionId,
      session.season,
      asOfSeason,
      session.user_team_id,
      scheduleSource(templateSeason),
      scheduleNote(templateSeason),
      seasonSeed,
      created,
      created,
    );

    const insertTeam = db.prepare(
      `INSERT INTO season_teams (
         season_id, team_id, is_user_controlled, tactics, batting_aggression,
         bowling_aggression, lineup_locked
       ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
    );
    for (const team of sessionTeams) {
      const isUser = team.team_id === session.user_team_id;
      const tactics = teamTactics(team.ai_profile, isUser);
      insertTeam.run(
        seasonId,
        team.team_id,
        team.is_human === 1 ? 1 : 0,
        tactics.tactics,
        tactics.batting,
        tactics.bowling,
      );
      squads.set(
        team.team_id,
        loadTeamSquad(db, seasonId, sessionId, team.team_id, asOfSeason),
      );
    }

    const insertFixture = db.prepare(
      `INSERT INTO season_fixtures (
         id, season_id, match_number, stage, round, match_date, venue, city,
         home_team_id, away_team_id, template_match_id, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
    );
    for (const fixture of builtFixtures) {
      insertFixture.run(
        fixture.id,
        seasonId,
        fixture.matchNumber,
        fixture.stage,
        fixture.round,
        fixture.date,
        fixture.venue,
        fixture.city,
        fixture.homeTeamId,
        fixture.awayTeamId,
        fixture.templateMatchId,
      );
    }

    const insertLineup = db.prepare(
      `INSERT INTO season_lineups (
         season_id, team_id, player_id, batting_order, is_captain, is_keeper, is_playing
       ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
    );
    for (const team of sessionTeams) {
      const candidates = (squads.get(team.team_id) ?? []).map(candidateFor);
      let xi;
      try {
        xi = autoSelectXi(candidates, 4);
      } catch {
        throw new SeasonError(
          "SQUADS_TOO_SHORT",
          `${team.team_id} cannot name a legal XI under the four-overseas limit. No fictional players were created.`,
          409,
        );
      }
      xi.battingOrder.forEach((playerId, index) => {
        insertLineup.run(
          seasonId,
          team.team_id,
          playerId,
          index + 1,
          playerId === xi.captainId ? 1 : 0,
          playerId === xi.keeperId ? 1 : 0,
        );
      });
    }
  });

  transaction();
  const season = loadSeasonBySession(db, sessionId);
  if (!season) throw new SeasonError("SEASON_NOT_FOUND", "The season could not be created.", 500);
  return buildSeasonSnapshot(db, season);
}

function assertSeasonActive(season: SeasonRow): void {
  if (season.status !== "active") {
    throw new SeasonError("SEASON_COMPLETE", "This season is already complete.", 400);
  }
}

function fixtureSetup(db: Db, season: SeasonRow, fixture: FixtureRow): MatchSetup {
  try {
    return buildMatchSetup(db, season, fixture);
  } catch (error) {
    throw new SeasonError(
      "MATCH_SETUP_FAILED",
      error instanceof Error ? error.message : "The match could not be prepared.",
      409,
    );
  }
}

function upsertInnings(db: Db, fixtureId: string, state: MatchState): void {
  const statement = db.prepare(
    `INSERT INTO season_innings (
       fixture_id, innings_number, batting_team_id, bowling_team_id, runs, wickets,
       legal_balls, extras, target, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(fixture_id, innings_number) DO UPDATE SET
       runs = excluded.runs, wickets = excluded.wickets, legal_balls = excluded.legal_balls,
       extras = excluded.extras, target = excluded.target, status = excluded.status`,
  );
  for (const innings of state.innings) {
    statement.run(
      fixtureId,
      innings.number,
      innings.battingTeamId,
      innings.bowlingTeamId,
      innings.runs,
      innings.wickets,
      innings.legalBalls,
      innings.extras,
      innings.target,
      innings.done ? "complete" : "live",
    );
  }
}

function liveScores(state: MatchState, fixture: FixtureRow): { home: string | null; away: string | null } {
  const latestFor = (teamId: string | null) => {
    if (!teamId) return null;
    const innings = [...state.innings].reverse().find((entry) => entry.battingTeamId === teamId);
    return innings ? scoreLine(innings) : null;
  };
  return { home: latestFor(fixture.home_team_id), away: latestFor(fixture.away_team_id) };
}

function insertDeliveries(db: Db, fixtureId: string, records: DeliveryRecord[]): void {
  if (records.length === 0) return;
  const statement = db.prepare(
    `INSERT INTO season_deliveries (
       fixture_id, innings_number, delivery_number, over_number, ball_in_over, batter_id,
       bowler_id, non_striker_id, runs_batter, runs_extras, runs_total, extra_type,
       wicket_type, player_out_id, fielder_id, is_legal, free_hit, score_runs, score_wickets,
       commentary, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const createdAt = nowIso();
  for (const record of records) {
    statement.run(
      fixtureId,
      record.inningsNumber,
      record.deliveryNumber,
      record.overNumber,
      record.ballInOver,
      record.batterId,
      record.bowlerId,
      record.nonStrikerId,
      record.runsBatter,
      record.runsExtras,
      record.runsTotal,
      record.extraType,
      record.wicketType,
      record.playerOutId,
      record.fielderId,
      record.isLegal ? 1 : 0,
      record.freeHit ? 1 : 0,
      record.scoreRuns,
      record.scoreWickets,
      record.commentary,
      createdAt,
    );
  }
}

function refreshBracket(db: Db, season: SeasonRow): void {
  if (!leagueComplete(db, season.id)) return;
  const { standings } = computeStandingsForSeason(db, season);
  if (standings.length < 4) return;
  const fixtures = loadFixtures(db, season.id);
  const q1 = fixtures.find((fixture) => fixture.stage === "Qualifier 1");
  const eliminator = fixtures.find((fixture) => fixture.stage === "Eliminator");
  const q2 = fixtures.find((fixture) => fixture.stage === "Qualifier 2");
  const final = fixtures.find((fixture) => fixture.stage === "Final");
  if (!q1 || !eliminator || !q2 || !final) return;

  const updateScheduled = db.prepare(
    `UPDATE season_fixtures SET home_team_id = ?, away_team_id = ?
     WHERE id = ? AND status = 'scheduled'`,
  );
  if (q1.status === "scheduled") {
    updateScheduled.run(standings[0].teamId, standings[1].teamId, q1.id);
  }
  if (eliminator.status === "scheduled") {
    updateScheduled.run(standings[2].teamId, standings[3].teamId, eliminator.id);
  }
  if (q1.status === "completed" && q1.winner_team_id) {
    const q1Loser = q1.winner_team_id === q1.home_team_id ? q1.away_team_id : q1.home_team_id;
    if (q1Loser && q2.status === "scheduled" && q2.home_team_id !== q1Loser) {
      db.prepare(
        `UPDATE season_fixtures SET home_team_id = ? WHERE id = ? AND status = 'scheduled'`,
      ).run(q1Loser, q2.id);
    }
    if (final.status === "scheduled" && final.home_team_id !== q1.winner_team_id) {
      db.prepare(
        `UPDATE season_fixtures SET home_team_id = ? WHERE id = ? AND status = 'scheduled'`,
      ).run(q1.winner_team_id, final.id);
    }
  }
  if (eliminator.status === "completed" && eliminator.winner_team_id) {
    if (q2.status === "scheduled" && q2.away_team_id !== eliminator.winner_team_id) {
      db.prepare(
        `UPDATE season_fixtures SET away_team_id = ? WHERE id = ? AND status = 'scheduled'`,
      ).run(eliminator.winner_team_id, q2.id);
    }
  }
  if (q2.status === "completed" && q2.winner_team_id) {
    if (final.status === "scheduled" && final.away_team_id !== q2.winner_team_id) {
      db.prepare(
        `UPDATE season_fixtures SET away_team_id = ? WHERE id = ? AND status = 'scheduled'`,
      ).run(q2.winner_team_id, final.id);
    }
  }
}

function finalizeFixture(db: Db, season: SeasonRow, fixture: FixtureRow, state: MatchState): void {
  if (!state.result) return;
  db.prepare(
    "UPDATE season_fixtures SET home_ready = 0, away_ready = 0, ready_deadline_at = NULL WHERE id = ?",
  ).run(fixture.id);
  if (state.result.noResult) {
    const completedAt = nowIso();
    db.prepare(
      `UPDATE season_fixtures SET
         status = 'completed', winner_team_id = NULL, result_summary = ?,
         home_score = NULL, away_score = NULL,
         home_runs = NULL, home_wickets = NULL, home_balls = NULL,
         away_runs = NULL, away_wickets = NULL, away_balls = NULL,
         player_of_match_id = NULL, completed_at = ?
       WHERE id = ?`,
    ).run(state.result.summary, completedAt, fixture.id);
    db.prepare(
      `UPDATE season_teams SET lineup_locked = 0
       WHERE season_id = ? AND team_id IN (?, ?)`,
    ).run(season.id, fixture.home_team_id, fixture.away_team_id);
    db.prepare("UPDATE seasons SET updated_at = ? WHERE id = ?").run(completedAt, season.id);
    return;
  }
  const regulation = state.innings.filter((innings) => !innings.superOver);
  const homeInnings = regulation.find((innings) => innings.battingTeamId === fixture.home_team_id);
  const awayInnings = regulation.find((innings) => innings.battingTeamId === fixture.away_team_id);
  if (!homeInnings || !awayInnings) {
    throw new SeasonError("SCORECARD_INVALID", "The match is missing a regulation innings.", 500);
  }
  const completedAt = nowIso();
  db.prepare(
    `UPDATE season_fixtures SET
       status = 'completed', winner_team_id = ?, result_summary = ?,
       home_score = ?, away_score = ?,
       home_runs = ?, home_wickets = ?, home_balls = ?,
       away_runs = ?, away_wickets = ?, away_balls = ?,
       player_of_match_id = ?, completed_at = ?
     WHERE id = ?`,
  ).run(
    state.result.winnerTeamId,
    state.result.summary,
    scoreLine(homeInnings),
    scoreLine(awayInnings),
    homeInnings.runs,
    homeInnings.wickets,
    homeInnings.legalBalls,
    awayInnings.runs,
    awayInnings.wickets,
    awayInnings.legalBalls,
    state.result.playerOfMatchId,
    completedAt,
    fixture.id,
  );
  db.prepare(
    `UPDATE season_teams SET lineup_locked = 0
     WHERE season_id = ? AND team_id IN (?, ?)`,
  ).run(season.id, fixture.home_team_id, fixture.away_team_id);
  db.prepare("UPDATE seasons SET updated_at = ? WHERE id = ?").run(completedAt, season.id);
  refreshBracket(db, season);

  if (fixture.stage === "Final" && state.result.winnerTeamId) {
    const winner = state.result.winnerTeamId;
    const loser =
      winner === fixture.home_team_id ? fixture.away_team_id : fixture.home_team_id;
    db.prepare(
      `UPDATE seasons SET status = 'completed', champion_team_id = ?, runner_up_team_id = ?,
         completed_at = ?, updated_at = ?, result_json = ?
       WHERE id = ?`,
    ).run(
      winner,
      loser,
      completedAt,
      completedAt,
      JSON.stringify({
        championTeamId: winner,
        runnerUpTeamId: loser,
        finalResult: state.result,
        completedAt,
      }),
      season.id,
    );
    db.prepare("UPDATE season_teams SET lineup_locked = 0 WHERE season_id = ?").run(season.id);
  }
}

function persistMatchState(
  db: Db,
  season: SeasonRow,
  fixture: FixtureRow,
  state: MatchState,
  records: DeliveryRecord[],
): void {
  const transaction = db.transaction(() => {
    insertDeliveries(db, fixture.id, records);
    const scores = liveScores(state, fixture);
    const completed = state.phase === "complete";
    db.prepare(
      `UPDATE season_fixtures SET state_json = ?, status = ?, toss_winner_id = ?, toss_decision = ?,
         home_score = ?, away_score = ?
       WHERE id = ?`,
    ).run(
      JSON.stringify(state),
      completed ? "completed" : "live",
      state.tossWinnerTeamId,
      state.tossDecision,
      scores.home,
      scores.away,
      fixture.id,
    );
    upsertInnings(db, fixture.id, state);
    db.prepare("UPDATE seasons SET updated_at = ? WHERE id = ?").run(nowIso(), season.id);
    if (completed) {
      const fresh = loadFixture(db, season.id, fixture.id);
      finalizeFixture(db, season, fresh, state);
    }
  });
  transaction();
}

const AUTO_READY_MS = 100_000;

function bothHuman(
  db: Db,
  season: SeasonRow,
  fixture: FixtureRow,
): boolean {
  if (!fixture.home_team_id || !fixture.away_team_id) return false;
  const humans = humanTeamIds(db, season);
  return humans.has(fixture.home_team_id) && humans.has(fixture.away_team_id);
}

function armReadyDeadline(db: Db, fixture: FixtureRow): void {
  if (fixture.ready_deadline_at) return;
  db.prepare(
    "UPDATE season_fixtures SET ready_deadline_at = ? WHERE id = ? AND ready_deadline_at IS NULL",
  ).run(new Date(Date.now() + AUTO_READY_MS).toISOString(), fixture.id);
}

function readyDeadlinePassed(fixture: FixtureRow): boolean {
  if (!fixture.ready_deadline_at) return false;
  const at = Date.parse(fixture.ready_deadline_at);
  return Number.isFinite(at) && Date.now() >= at;
}

/**
 * An absent or unready manager is covered by the franchise AI: its tactics
 * switch to the profile's wiring before the toss is generated.
 */
function autoPilotSide(db: Db, season: SeasonRow, fixture: FixtureRow, teamId: string | null): void {
  if (!teamId) return;
  const row = db
    .prepare("SELECT ai_profile FROM session_teams WHERE session_id = ? AND team_id = ?")
    .get(season.session_id, teamId) as { ai_profile: string | null } | undefined;
  const wiring = teamTactics(row?.ai_profile ?? "", false);
  db.prepare(
    `UPDATE season_teams SET tactics = ?, batting_aggression = ?, bowling_aggression = ?
     WHERE season_id = ? AND team_id = ?`,
  ).run(wiring.tactics, wiring.batting, wiring.bowling, season.id, teamId);
}

function beginUserMatch(db: Db, season: SeasonRow, fixture: FixtureRow): void {
  const setup = fixtureSetup(db, season, fixture);
  const state = createMatchState(setup);
  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE season_fixtures SET state_json = ?, status = 'live', toss_winner_id = ?, toss_decision = ?,
         ready_deadline_at = NULL
       WHERE id = ? AND status = 'scheduled'`,
    ).run(JSON.stringify(state), state.tossWinnerTeamId, state.tossDecision, fixture.id);
    db.prepare(
      `UPDATE season_teams SET lineup_locked = 1 WHERE season_id = ? AND team_id IN (?, ?)`,
    ).run(season.id, fixture.home_team_id, fixture.away_team_id);
    upsertInnings(db, fixture.id, state);
    db.prepare("UPDATE seasons SET updated_at = ? WHERE id = ?").run(nowIso(), season.id);
  });
  transaction();
}

function startUserMatch(
  db: Db,
  season: SeasonRow,
  fixtureId: string,
  viewerTeamId: string | null,
): void {
  assertSeasonActive(season);
  const fixture = loadFixture(db, season.id, fixtureId);
  const inFixture =
    viewerTeamId !== null &&
    (fixture.home_team_id === viewerTeamId || fixture.away_team_id === viewerTeamId);
  if (!inFixture) {
    throw new SeasonError("NOT_YOUR_MATCH", "You can only take charge of your own franchise's matches.", 403);
  }
  if (fixture.status === "completed") {
    throw new SeasonError("MATCH_COMPLETE", "This match is already complete.", 400);
  }
  if (fixture.status === "live") return;
  const otherLive = db
    .prepare(
      `SELECT id FROM season_fixtures
       WHERE season_id = ? AND status = 'live' AND id != ?
         AND (home_team_id = ? OR away_team_id = ?)
       LIMIT 1`,
    )
    .get(season.id, fixture.id, viewerTeamId, viewerTeamId) as { id: string } | undefined;
  if (otherLive) {
    throw new SeasonError("MATCH_ALREADY_LIVE", "Finish your live match before starting another.", 409);
  }
  if (!fixture.home_team_id || !fixture.away_team_id) {
    throw new SeasonError("TEAMS_PENDING", "This playoff fixture is waiting for its teams.", 409);
  }

  const humanMatch = bothHuman(db, season, fixture);

  // Two managers must both mark ready before the toss is made. Each ready flag
  // can only be set by the manager who owns that side of the fixture. The
  // 100-second clock starts when the first manager opens the ready check; when
  // it runs out the AI covers every side that has not confirmed.
  if (humanMatch) {
    if (fixture.home_team_id === viewerTeamId) {
      db.prepare("UPDATE season_fixtures SET home_ready = 1 WHERE id = ?").run(fixture.id);
    } else {
      db.prepare("UPDATE season_fixtures SET away_ready = 1 WHERE id = ?").run(fixture.id);
    }
    armReadyDeadline(db, loadFixture(db, season.id, fixture.id));
    const ready = loadFixture(db, season.id, fixture.id);
    if (!(ready.home_ready === 1 && ready.away_ready === 1)) {
      if (!readyDeadlinePassed(ready)) return;
      if (ready.home_ready !== 1) autoPilotSide(db, season, ready, ready.home_team_id);
      if (ready.away_ready !== 1) autoPilotSide(db, season, ready, ready.away_team_id);
      db.prepare("UPDATE season_fixtures SET home_ready = 1, away_ready = 1 WHERE id = ?").run(
        fixture.id,
      );
    }
  }

  beginUserMatch(db, season, loadFixture(db, season.id, fixture.id));
}

/**
 * Called when a manager opens the match page. It arms the shared countdown and
 * starts the match without that manager having to press ready once the clock
 * has expired.
 */
function armReadyCheck(
  db: Db,
  season: SeasonRow,
  fixtureId: string,
  viewerTeamId: string | null,
): void {
  assertSeasonActive(season);
  const fixture = loadFixture(db, season.id, fixtureId);
  if (fixture.status !== "scheduled") return;
  if (
    viewerTeamId === null ||
    (fixture.home_team_id !== viewerTeamId && fixture.away_team_id !== viewerTeamId)
  ) {
    return;
  }
  if (!bothHuman(db, season, fixture)) return;
  armReadyDeadline(db, fixture);
  const fresh = loadFixture(db, season.id, fixtureId);
  if (!readyDeadlinePassed(fresh)) return;
  if (fresh.home_ready === 1 && fresh.away_ready === 1) return;
  if (fresh.home_ready !== 1) autoPilotSide(db, season, fresh, fresh.home_team_id);
  if (fresh.away_ready !== 1) autoPilotSide(db, season, fresh, fresh.away_team_id);
  db.prepare("UPDATE season_fixtures SET home_ready = 1, away_ready = 1 WHERE id = ?").run(fresh.id);
  beginUserMatch(db, season, loadFixture(db, season.id, fixtureId));
}

function simulateOver(
  state: MatchState,
  setup: MatchSetup,
  controls: { bowlerId?: string | null; nextBatterId?: string | null } = {},
): DeliveryRecord[] {
  const records: DeliveryRecord[] = [];
  let guard = 0;
  while (state.phase !== "complete" && guard < 18) {
    records.push(simulateNextDelivery(state, setup, controls));
    guard += 1;
    if (state.phase !== "live") break;
    const innings = state.innings[state.innings.length - 1];
    if (innings.legalBalls > 0 && innings.legalBalls % 6 === 0) break;
  }
  return records;
}

function simulateUserMatch(
  db: Db,
  season: SeasonRow,
  fixtureId: string,
  amount: "ball" | "over" | "innings" | "match",
  controls: { bowlerId?: string | null; nextBatterId?: string | null } = {},
  viewerTeamId: string | null = null,
): void {
  assertSeasonActive(season);
  let fixture = loadFixture(db, season.id, fixtureId);
  const inFixture =
    viewerTeamId !== null &&
    (fixture.home_team_id === viewerTeamId || fixture.away_team_id === viewerTeamId);
  if (!inFixture) {
    throw new SeasonError("NOT_YOUR_MATCH", "You can only control your own franchise's matches.", 403);
  }
  if (fixture.status === "completed") return;

  const humans = humanTeamIds(db, season);
  const humanMatch =
    fixture.home_team_id !== null &&
    fixture.away_team_id !== null &&
    humans.has(fixture.home_team_id) &&
    humans.has(fixture.away_team_id);

  if (fixture.status === "scheduled") {
    startUserMatch(db, season, fixtureId, viewerTeamId);
    fixture = loadFixture(db, season.id, fixtureId);
    if (fixture.status !== "live") {
      throw new SeasonError(
        "WAITING_FOR_READY",
        "This is a head-to-head match. Both managers must mark ready before the first ball.",
        409,
      );
    }
  }
  const state = parseJson<MatchState | null>(fixture.state_json, null);
  if (!state) throw new SeasonError("MATCH_NOT_READY", "This match has no saved state.", 500);
  const setup = fixtureSetup(db, season, fixture);

  if (humanMatch) {
    // Head-to-head matches advance over by over. Each manager may only name
    // their own batter or their own bowler, never both sides of the game.
    if (amount !== "over") {
      throw new SeasonError(
        "OVER_ONLY",
        "Head-to-head matches advance one over at a time. Ball-by-ball and instant finishes are disabled.",
        400,
      );
    }
    const upcoming = state.phase === "innings_break";
    const lastInnings = state.innings[state.innings.length - 1];
    const battingTeamId = upcoming ? state.secondBattingTeamId : lastInnings?.battingTeamId ?? null;
    const bowlingTeamId = upcoming ? state.firstBattingTeamId : lastInnings?.bowlingTeamId ?? null;
    const teamInSetup = (teamId: string | null) =>
      teamId === setup.homeTeam.id ? setup.homeTeam : teamId === setup.awayTeam.id ? setup.awayTeam : null;

    if (controls.bowlerId) {
      const bowlingTeam = teamInSetup(bowlingTeamId);
      if (
        viewerTeamId !== bowlingTeamId ||
        !bowlingTeam?.players.some((player) => player.id === controls.bowlerId)
      ) {
        throw new SeasonError(
          "NOT_YOUR_TEAM",
          "You can only choose the bowler for your own team's overs.",
          403,
        );
      }
    }
    if (controls.nextBatterId) {
      const battingTeam = teamInSetup(battingTeamId);
      if (
        viewerTeamId !== battingTeamId ||
        !battingTeam?.players.some((player) => player.id === controls.nextBatterId)
      ) {
        throw new SeasonError(
          "NOT_YOUR_TEAM",
          "You can only choose the next batter for your own team.",
          403,
        );
      }
    }
  }

  let records: DeliveryRecord[] = [];
  if (amount === "ball") {
    records = [simulateNextDelivery(state, setup, controls)];
  } else if (amount === "over") {
    records = simulateOver(state, setup, controls);
  } else if (amount === "innings") {
    records = simulateMatch(state, setup, { maxDeliveries: 400, stopAtInningsBreak: true }).deliveries;
  } else {
    records = simulateMatch(state, setup, { maxDeliveries: 1000 }).deliveries;
  }
  persistMatchState(db, season, fixture, state, records);
}

function simulateFixtureToCompletion(db: Db, season: SeasonRow, fixture: FixtureRow): boolean {
  if (fixture.status === "completed") return false;
  if (!fixture.home_team_id || !fixture.away_team_id) return false;
  if (fixture.status === "scheduled") {
    const setup = fixtureSetup(db, season, fixture);
    const state = createMatchState(setup);
    const records = simulateMatch(state, setup, { maxDeliveries: 1000 }).deliveries;
    persistMatchState(db, season, fixture, state, records);
    return true;
  }
  if (fixture.status === "live") {
    const state = parseJson<MatchState | null>(fixture.state_json, null);
    if (!state) throw new SeasonError("MATCH_NOT_READY", "The live match has no saved state.", 500);
    const setup = fixtureSetup(db, season, fixture);
    const records = simulateMatch(state, setup, { maxDeliveries: 1000 }).deliveries;
    persistMatchState(db, season, fixture, state, records);
    return true;
  }
  return false;
}

function advanceSeason(db: Db, season: SeasonRow, scope: "other" | "matchday" | "league" | "season"): void {
  assertSeasonActive(season);
  refreshBracket(db, season);
  const humans = humanTeamIds(db, season);
  const involvesHuman = (fixture: FixtureRow) =>
    (fixture.home_team_id !== null && humans.has(fixture.home_team_id)) ||
    (fixture.away_team_id !== null && humans.has(fixture.away_team_id));
  let simulated = 0;
  // Matchdays run in date order. A matchday that still contains a human fixture
  // is a hard stop: those managers play theirs before the calendar moves on.
  while (simulated < 90) {
    const fixtures = loadFixtures(db, season.id)
      .filter(
        (fixture) =>
          fixture.status !== "completed" &&
          fixture.home_team_id !== null &&
          fixture.away_team_id !== null &&
          (scope !== "league" || fixture.stage === "league"),
      )
      .sort((a, b) => a.match_date.localeCompare(b.match_date) || a.match_number - b.match_number);
    const first = fixtures[0];
    if (!first) break;
    const matchday = fixtures.filter((fixture) => fixture.match_date === first.match_date);
    // Human-controlled fixtures are never auto-simulated: their managers must
    // ready up and play them over by over.
    let progressed = false;
    for (const fixture of matchday) {
      if (involvesHuman(fixture)) continue;
      if (simulateFixtureToCompletion(db, season, fixture)) {
        simulated += 1;
        progressed = true;
      }
    }
    if (!progressed) break;
    if (scope === "matchday") break;
    // AI games can be simulated up to the next human match, never past it.
    if (matchday.some(involvesHuman)) break;
  }
  refreshBracket(db, season);
  db.prepare("UPDATE seasons SET updated_at = ? WHERE id = ?").run(nowIso(), season.id);
}

function clearAdvanceVotes(db: Db, seasonId: string): void {
  db.prepare("DELETE FROM season_sim_votes WHERE season_id = ?").run(seasonId);
}

/**
 * League and season-wide simulation change every manager's table, so the whole
 * room has to agree. Each seat votes once; the last approval runs the sweep.
 */
function voteAdvance(
  db: Db,
  season: SeasonRow,
  scope: "league" | "season",
  viewerTeamId: string,
): void {
  assertSeasonActive(season);
  const humans = humanTeamIds(db, season);
  if (!humans.has(viewerTeamId)) {
    throw new SeasonError("SEAT_REQUIRED", "Take a seat in this room to vote on the simulation.", 401);
  }
  if (humans.size <= 1) {
    clearAdvanceVotes(db, season.id);
    advanceSeason(db, season, scope);
    return;
  }
  // The final approval and the reset of the tally have to land together so a
  // room can never run the same sweep twice.
  const claimed = db.transaction(() => {
    db.prepare(
      "INSERT OR IGNORE INTO season_sim_votes (season_id, team_id, scope, created_at) VALUES (?, ?, ?, ?)",
    ).run(season.id, viewerTeamId, scope, nowIso());
    const approvals = db
      .prepare("SELECT team_id FROM season_sim_votes WHERE season_id = ? AND scope = ?")
      .all(season.id, scope) as Array<{ team_id: string }>;
    const unanimous = [...humans].every((teamId) => approvals.some((row) => row.team_id === teamId));
    if (!unanimous) return false;
    clearAdvanceVotes(db, season.id);
    return true;
  })();
  if (claimed) advanceSeason(db, season, scope);
}

function setUserLineup(
  db: Db,
  season: SeasonRow,
  input: LineupInput,
  viewerTeamId: string | null,
): void {
  assertSeasonActive(season);
  if (!viewerTeamId) {
    throw new SeasonError("SEAT_REQUIRED", "Take a seat in this room to manage an XI.", 401);
  }
  const live = db
    .prepare("SELECT id FROM season_fixtures WHERE season_id = ? AND status = 'live' LIMIT 1")
    .get(season.id) as { id: string } | undefined;
  if (live) {
    throw new SeasonError(
      "LINEUP_LOCKED",
      "Your XI is locked while a match is live. Finish the match before changing the lineup.",
      409,
    );
  }
  const squad = loadTeamSquad(db, season.id, season.session_id, viewerTeamId, season.as_of_season);
  const candidates = squad.map(candidateFor);
  const error = validateLineup(input, candidates, 4);
  if (error) throw new SeasonError("LINEUP_INVALID", error, 400);

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM season_lineups WHERE season_id = ? AND team_id = ?").run(
      season.id,
      viewerTeamId,
    );
    const insert = db.prepare(
      `INSERT INTO season_lineups (
         season_id, team_id, player_id, batting_order, is_captain, is_keeper, is_playing
       ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
    );
    input.battingOrder.forEach((playerId, index) => {
      insert.run(
        season.id,
        viewerTeamId,
        playerId,
        index + 1,
        playerId === input.captainId ? 1 : 0,
        playerId === input.keeperId ? 1 : 0,
      );
    });
    db.prepare("UPDATE seasons SET updated_at = ? WHERE id = ?").run(nowIso(), season.id);
  });
  transaction();
}

function setUserTactics(
  db: Db,
  season: SeasonRow,
  tactics: TeamTactics,
  battingAggression: number | undefined,
  bowlingAggression: number | undefined,
  viewerTeamId: string | null,
): void {
  assertSeasonActive(season);
  if (!viewerTeamId) {
    throw new SeasonError("SEAT_REQUIRED", "Take a seat in this room to set tactics.", 401);
  }
  if (tactics !== "attack" && tactics !== "balanced" && tactics !== "defend") {
    throw new SeasonError("TACTICS_INVALID", "Choose attack, balanced or defend.", 400);
  }
  const preset = tacticsFor(tactics);
  const batting = Math.max(
    0,
    Math.min(100, Math.round(battingAggression ?? preset.battingAggression)),
  );
  const bowling = Math.max(
    0,
    Math.min(100, Math.round(bowlingAggression ?? preset.bowlingAggression)),
  );
  db.prepare(
    `UPDATE season_teams SET tactics = ?, batting_aggression = ?, bowling_aggression = ?
     WHERE season_id = ? AND team_id = ?`,
  ).run(tactics, batting, bowling, season.id, viewerTeamId);
  db.prepare("UPDATE seasons SET updated_at = ? WHERE id = ?").run(nowIso(), season.id);
}

function autoUserLineup(db: Db, season: SeasonRow, viewerTeamId: string | null): void {
  assertSeasonActive(season);
  if (!viewerTeamId) {
    throw new SeasonError("SEAT_REQUIRED", "Take a seat in this room to manage an XI.", 401);
  }
  const squad = loadTeamSquad(db, season.id, season.session_id, viewerTeamId, season.as_of_season);
  const candidates = squad.map(candidateFor);
  let xi;
  try {
    xi = autoSelectXi(candidates, 4);
  } catch (error) {
    throw new SeasonError(
      "LINEUP_INVALID",
      error instanceof Error ? error.message : "The squad cannot field a legal XI.",
      409,
    );
  }
  setUserLineup(
    db,
    season,
    {
      playerIds: xi.battingOrder,
      battingOrder: xi.battingOrder,
      captainId: xi.captainId,
      keeperId: xi.keeperId,
    },
    viewerTeamId,
  );
}

export function applySeasonAction(
  sessionId: string,
  action: SeasonAction,
  token?: string | null,
): SeasonSnapshot {
  const db = getDb();
  const season = loadSeasonBySession(db, sessionId);
  if (!season) {
    throw new SeasonError("SEASON_NOT_FOUND", "Start the season before taking match actions.", 404);
  }
  const viewerTeamId = resolveViewerTeamId(db, season, token);
  if (!viewerTeamId) {
    throw new SeasonError("SEAT_REQUIRED", "Take a seat in this room before acting on the season.", 401);
  }

  switch (action.type) {
    case "start-match":
      startUserMatch(db, season, action.fixtureId, viewerTeamId);
      break;
    case "ready-check":
      armReadyCheck(db, season, action.fixtureId, viewerTeamId);
      break;
    case "simulate":
      simulateUserMatch(
        db,
        season,
        action.fixtureId,
        action.amount,
        {
          bowlerId: action.bowlerId ?? null,
          nextBatterId: action.nextBatterId ?? null,
        },
        viewerTeamId,
      );
      break;
    case "advance":
      if (action.scope === "league" || action.scope === "season") {
        voteAdvance(db, season, action.scope, viewerTeamId);
      } else {
        advanceSeason(db, season, action.scope);
      }
      break;
    case "set-lineup":
      setUserLineup(db, season, action.lineup, viewerTeamId);
      break;
    case "auto-lineup":
      autoUserLineup(db, season, viewerTeamId);
      break;
    case "set-tactics":
      setUserTactics(
        db,
        season,
        action.tactics,
        action.battingAggression,
        action.bowlingAggression,
        viewerTeamId,
      );
      break;
  }

  const updated = loadSeasonBySession(db, sessionId);
  if (!updated) throw new SeasonError("SEASON_NOT_FOUND", "The season could not be reloaded.", 500);
  return buildSeasonSnapshot(db, updated, viewerTeamId);
}

export function currentUserLineup(sessionId: string, token?: string | null): LineupInput | null {
  const db = getDb();
  const season = loadSeasonBySession(db, sessionId);
  if (!season) return null;
  const teamId = resolveViewerTeamId(db, season, token) ?? season.user_team_id;
  const rows = loadLineupRows(db, season.id, teamId).filter((row) => row.is_playing === 1);
  if (rows.length !== 11) return null;
  const captain = rows.find((row) => row.is_captain === 1);
  const keeper = rows.find((row) => row.is_keeper === 1);
  return {
    playerIds: rows.map((row) => row.player_id),
    battingOrder: rows.map((row) => row.player_id),
    captainId: captain?.player_id ?? rows[0].player_id,
    keeperId: keeper?.player_id ?? rows[0].player_id,
  };
}

export { loadSeasonBySession, loadFixture };
export { loadSeasonTeams, loadTeamSquad } from "./internal";
