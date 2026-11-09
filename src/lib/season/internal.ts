import type Database from "better-sqlite3";
import { hashUnit } from "./random";
import { computeStandings, type StandingsResult, type StandingsTeam } from "./standings";
import type { MatchSetup, SimPlayer, SimTeam, StandingRow, TeamTactics } from "./types";

export type Db = Database.Database;

export interface SessionRow {
  id: string;
  name: string;
  status: string;
  user_team_id: string | null;
  season: number;
  config_json: string | null;
  total_lots: number;
  completed_lots: number;
  created_at: string;
  completed_at: string | null;
}

export interface SeasonRow {
  id: string;
  session_id: string;
  status: string;
  season_year: number;
  as_of_season: number;
  user_team_id: string;
  schedule_source: string;
  schedule_note: string;
  seed: number;
  champion_team_id: string | null;
  runner_up_team_id: string | null;
  started_at: string;
  completed_at: string | null;
  result_json: string | null;
  updated_at: string;
}

export interface SeasonTeamRow {
  team_id: string;
  is_user_controlled: number;
  tactics: string;
  batting_aggression: number;
  bowling_aggression: number;
  lineup_locked: number;
  name: string;
  short_name: string;
  city: string | null;
  primary_color: string;
  secondary_color: string;
  ink_color: string;
  ai_profile: string;
}

export interface FixtureRow {
  id: string;
  season_id: string;
  match_number: number;
  stage: string;
  round: number;
  match_date: string;
  venue: string | null;
  city: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  template_match_id: string | null;
  status: string;
  toss_winner_id: string | null;
  toss_decision: string | null;
  winner_team_id: string | null;
  result_summary: string | null;
  home_score: string | null;
  away_score: string | null;
  home_runs: number | null;
  home_wickets: number | null;
  home_balls: number | null;
  away_runs: number | null;
  away_wickets: number | null;
  away_balls: number | null;
  player_of_match_id: string | null;
  state_json: string | null;
  completed_at: string | null;
  home_ready: number;
  away_ready: number;
  ready_deadline_at: string | null;
}

export interface SquadPlayer {
  playerId: string;
  name: string;
  shortName: string;
  role: string;
  isOverseas: boolean;
  capped: boolean | null;
  priceLakh: number;
  acquiredVia: string;
  isCallup: boolean;
  ovr: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  evidenceQuality: string | null;
}

export interface LineupRow {
  player_id: string;
  batting_order: number;
  is_captain: number;
  is_keeper: number;
  is_playing: number;
}

interface SquadDbRow {
  player_id: string;
  full_name: string;
  short_name: string;
  role: string;
  is_overseas: number | null;
  capped: number | null;
  price_lakh: number;
  acquired_via: string;
  is_callup: number;
  ovr: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  evidence_quality: string | null;
}

interface LineupDbRow extends LineupRow {
  full_name: string;
  short_name: string;
  role: string;
  is_overseas: number | null;
  ovr: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  evidence_quality: string | null;
  matches: number | null;
  runs: number | null;
  balls_faced: number | null;
  dismissals: number | null;
  fours: number | null;
  sixes: number | null;
  wickets: number | null;
  balls_bowled: number | null;
  runs_conceded: number | null;
  dots: number | null;
}

function ratio(value: number, divisor: number, scale: number): number | null {
  if (!Number.isFinite(value) || divisor <= 0) return null;
  return Math.round((value / divisor) * scale * 10) / 10;
}

function careerFor(row: LineupDbRow): SimPlayer["career"] {
  const matches = row.matches ?? 0;
  const ballsFaced = row.balls_faced ?? 0;
  const dismissals = row.dismissals ?? 0;
  const ballsBowled = row.balls_bowled ?? 0;
  const runsConceded = row.runs_conceded ?? 0;
  const dots = row.dots ?? 0;
  if (matches === 0 && ballsFaced === 0 && ballsBowled === 0) return null;
  return {
    matches,
    runs: row.runs ?? 0,
    ballsFaced,
    dismissals,
    fours: row.fours ?? 0,
    sixes: row.sixes ?? 0,
    wickets: row.wickets ?? 0,
    ballsBowled,
    runsConceded,
    dots,
    strikeRate: ballsFaced > 0 ? ratio(row.runs ?? 0, ballsFaced, 100) : null,
    battingAverage: dismissals > 0 ? ratio(row.runs ?? 0, dismissals, 1) : null,
    economy: ballsBowled > 0 ? ratio(runsConceded, ballsBowled, 6) : null,
    bowlingStrikeRate: (row.wickets ?? 0) > 0 ? ratio(ballsBowled, row.wickets ?? 0, 1) : null,
    dotPercent: ballsBowled > 0 ? ratio(dots, ballsBowled, 100) : null,
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadSession(db: Db, sessionId: string): SessionRow {
  const row = db
    .prepare(
      `SELECT id, name, status, user_team_id, season, config_json, total_lots, completed_lots,
              created_at, completed_at
       FROM auction_sessions WHERE id = ?`,
    )
    .get(sessionId) as SessionRow | undefined;
  if (!row) throw new Error("Auction session not found");
  return row;
}

export function loadSeasonBySession(db: Db, sessionId: string): SeasonRow | null {
  return (
    (db.prepare("SELECT * FROM seasons WHERE session_id = ?").get(sessionId) as SeasonRow | undefined) ??
    null
  );
}

export function loadSeason(db: Db, seasonId: string): SeasonRow {
  const row = db.prepare("SELECT * FROM seasons WHERE id = ?").get(seasonId) as SeasonRow | undefined;
  if (!row) throw new Error("Season not found");
  return row;
}

export function loadSeasonTeams(db: Db, seasonId: string): SeasonTeamRow[] {
  return db
    .prepare(
      `SELECT st.team_id, st.is_user_controlled, st.tactics, st.batting_aggression,
              st.bowling_aggression, st.lineup_locked,
              t.name, t.short_name, t.city, t.primary_color, t.secondary_color, t.ink_color,
              COALESCE((
                SELECT ai_profile FROM session_teams xt
                WHERE xt.session_id = (SELECT session_id FROM seasons WHERE id = st.season_id)
                  AND xt.team_id = st.team_id
              ), 'balanced') AS ai_profile
       FROM season_teams st
       JOIN teams t ON t.id = st.team_id
       WHERE st.season_id = ?
       ORDER BY t.name`,
    )
    .all(seasonId) as SeasonTeamRow[];
}

export function loadFixtures(db: Db, seasonId: string): FixtureRow[] {
  return db
    .prepare("SELECT * FROM season_fixtures WHERE season_id = ? ORDER BY match_number")
    .all(seasonId) as FixtureRow[];
}

export function humanTeamIds(db: Db, season: SeasonRow): Set<string> {
  return new Set(
    loadSeasonTeams(db, season.id)
      .filter((team) => team.is_user_controlled === 1)
      .map((team) => team.team_id),
  );
}

/**
 * Resolve who is acting. A seat token wins; otherwise a solo season belongs to
 * its only human manager. Multiplayer rooms with no valid seat are spectators.
 */
export function resolveViewerTeamId(
  db: Db,
  season: SeasonRow,
  rawToken: string | null | undefined,
): string | null {
  const humans = humanTeamIds(db, season);
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  if (token.length >= 8) {
    const row = db
      .prepare("SELECT team_id FROM auction_participants WHERE session_id = ? AND token = ?")
      .get(season.session_id, token) as { team_id: string | null } | undefined;
    if (row?.team_id && humans.has(row.team_id)) return row.team_id;
  }
  if (humans.size === 1) return [...humans][0];
  return null;
}

export function loadFixture(db: Db, seasonId: string, fixtureId: string): FixtureRow {
  const row = db
    .prepare("SELECT * FROM season_fixtures WHERE season_id = ? AND id = ?")
    .get(seasonId, fixtureId) as FixtureRow | undefined;
  if (!row) throw new Error("Season fixture not found");
  return row;
}

export function loadTeamSquad(
  db: Db,
  seasonId: string,
  sessionId: string,
  teamId: string,
  asOfSeason: number,
): SquadPlayer[] {
  const rows = db
    .prepare(
      `SELECT player_id, full_name, short_name, role, is_overseas, capped, price_lakh, acquired_via,
              is_callup, ovr, batting, bowling, fielding, evidence_quality
       FROM (
         SELECT sq.player_id, p.full_name, p.short_name, p.role, p.is_overseas, p.capped,
                sq.price_lakh, sq.acquired_via, 0 AS is_callup,
                rv.ovr, rv.batting, rv.bowling, rv.fielding, rv.evidence_quality
         FROM session_squads sq
         JOIN players p ON p.id = sq.player_id
         LEFT JOIN player_rating_versions rv ON rv.player_id = p.id AND rv.as_of_season = ?
         WHERE sq.session_id = ? AND sq.team_id = ?
         UNION ALL
         SELECT c.player_id, p.full_name, p.short_name, p.role, p.is_overseas, p.capped,
                0 AS price_lakh, 'season-callup' AS acquired_via, 1 AS is_callup,
                rv.ovr, rv.batting, rv.bowling, rv.fielding, rv.evidence_quality
         FROM season_callups c
         JOIN players p ON p.id = c.player_id
         LEFT JOIN player_rating_versions rv ON rv.player_id = p.id AND rv.as_of_season = ?
         WHERE c.season_id = ? AND c.team_id = ?
       )
       ORDER BY is_callup ASC, price_lakh DESC, full_name COLLATE NOCASE`,
    )
    .all(asOfSeason, sessionId, teamId, asOfSeason, seasonId, teamId) as SquadDbRow[];

  return rows.map((row) => ({
    playerId: row.player_id,
    name: row.full_name,
    shortName: row.short_name,
    role: row.role,
    isOverseas: row.is_overseas === 1,
    capped: row.capped === null ? null : row.capped === 1,
    priceLakh: row.price_lakh,
    acquiredVia: row.acquired_via,
    isCallup: row.is_callup === 1,
    ovr: row.ovr,
    batting: row.batting,
    bowling: row.bowling,
    fielding: row.fielding,
    evidenceQuality: row.evidence_quality,
  }));
}

export type SeasonSquadIssue = {
  teamId: string;
  teamName: string;
  players: number;
  reason: string;
};

// The tournament is played with the auction's final squads only. Ten legal XIs need
// 110 bought players, so short-format auctions must be blocked rather than padded.
export function seasonSquadIssues(db: Db, sessionId: string): SeasonSquadIssue[] {
  const rows = db
    .prepare(
      `SELECT st.team_id, t.name AS team_name,
              COUNT(sq.player_id) AS players,
              COALESCE(SUM(CASE WHEN p.is_overseas = 1 THEN 1 ELSE 0 END), 0) AS overseas
       FROM session_teams st
       JOIN teams t ON t.id = st.team_id
       LEFT JOIN session_squads sq ON sq.session_id = st.session_id AND sq.team_id = st.team_id
       LEFT JOIN players p ON p.id = sq.player_id
       WHERE st.session_id = ?
       GROUP BY st.team_id, t.name
       ORDER BY t.name COLLATE NOCASE`,
    )
    .all(sessionId) as Array<{ team_id: string; team_name: string; players: number; overseas: number }>;

  const issues: SeasonSquadIssue[] = [];
  for (const row of rows) {
    const players = Number(row.players);
    const domestic = players - Number(row.overseas);
    let reason: string | null = null;
    if (players < 11) {
      reason = `only ${players} player${players === 1 ? "" : "s"} bought; a tournament XI needs at least 11`;
    } else if (domestic < 7) {
      reason = `${domestic} domestic player${domestic === 1 ? "" : "s"}; an XI needs at least seven`;
    }
    if (reason) {
      issues.push({ teamId: row.team_id, teamName: row.team_name, players, reason });
    }
  }
  return issues;
}

export function loadLineupRows(db: Db, seasonId: string, teamId: string): LineupRow[] {
  return db
    .prepare(
      `SELECT player_id, batting_order, is_captain, is_keeper, is_playing
       FROM season_lineups WHERE season_id = ? AND team_id = ? ORDER BY batting_order`,
    )
    .all(seasonId, teamId) as LineupRow[];
}

export function fallbackBatting(role: string): number {
  if (role === "bowler") return 32;
  if (role === "all-rounder") return 48;
  return 55;
}

export function fallbackBowling(role: string): number {
  if (role === "bowler") return 58;
  if (role === "all-rounder") return 48;
  return 30;
}

export function autoScoreFor(player: SquadPlayer): number {
  if (player.ovr !== null) return player.ovr;
  const batting = player.batting ?? fallbackBatting(player.role);
  const bowling = player.bowling ?? fallbackBowling(player.role);
  const fielding = player.fielding ?? 50;
  return Math.round(batting * 0.55 + bowling * 0.3 + fielding * 0.15);
}

export function loadXiPlayers(db: Db, seasonId: string, teamId: string, asOfSeason: number): SimPlayer[] {
  const rows = db
    .prepare(
      `SELECT l.player_id, l.batting_order, l.is_captain, l.is_keeper, l.is_playing,
              p.full_name, p.short_name, p.role, p.is_overseas,
              rv.ovr, rv.batting, rv.bowling, rv.fielding, rv.evidence_quality,
              cs.matches, cs.runs, cs.balls_faced, cs.dismissals, cs.fours, cs.sixes,
              cs.wickets, cs.balls_bowled, cs.runs_conceded, cs.dots
       FROM season_lineups l
       JOIN players p ON p.id = l.player_id
       LEFT JOIN player_rating_versions rv ON rv.player_id = p.id AND rv.as_of_season = ?
       LEFT JOIN player_career_stats cs ON cs.player_id = p.id
       WHERE l.season_id = ? AND l.team_id = ? AND l.is_playing = 1
       ORDER BY l.batting_order`,
    )
    .all(asOfSeason, seasonId, teamId) as LineupDbRow[];

  return rows.map((row) => ({
    id: row.player_id,
    name: row.full_name,
    shortName: row.short_name,
    role: row.role,
    isOverseas: row.is_overseas === 1,
    isKeeper: row.is_keeper === 1,
    isCaptain: row.is_captain === 1,
    batting: row.batting ?? fallbackBatting(row.role),
    bowling: row.bowling ?? fallbackBowling(row.role),
    fielding: row.fielding ?? 50,
    ovr: row.ovr,
    battingOrder: row.batting_order,
    ratingEvidence: row.evidence_quality ?? "unrated · role-based fallback",
    career: careerFor(row),
  }));
}

function simTeam(team: SeasonTeamRow, players: SimPlayer[]): SimTeam {
  const tactics = (team.tactics === "attack" || team.tactics === "defend" ? team.tactics : "balanced") as TeamTactics;
  return {
    id: team.team_id,
    name: team.name,
    shortName: team.short_name,
    primary: team.primary_color,
    secondary: team.secondary_color,
    tactics,
    battingAggression: team.batting_aggression,
    bowlingAggression: team.bowling_aggression,
    players,
  };
}

export function buildMatchSetup(
  db: Db,
  season: SeasonRow,
  fixture: FixtureRow,
  seedOverride?: number,
): MatchSetup {
  if (!fixture.home_team_id || !fixture.away_team_id) {
    throw new Error("This fixture does not have both teams yet");
  }
  if (fixture.status === "scheduled" && !fixture.template_match_id && fixture.stage !== "league") {
    throw new Error("Playoff teams are still being decided");
  }
  const teams = loadSeasonTeams(db, season.id);
  const home = teams.find((team) => team.team_id === fixture.home_team_id);
  const away = teams.find((team) => team.team_id === fixture.away_team_id);
  if (!home || !away) throw new Error("A fixture team is missing from the season");

  const homePlayers = loadXiPlayers(db, season.id, home.team_id, season.as_of_season);
  const awayPlayers = loadXiPlayers(db, season.id, away.team_id, season.as_of_season);
  if (homePlayers.length !== 11 || awayPlayers.length !== 11) {
    throw new Error("Both teams must have a complete 11-player XI before the match can start");
  }

  const seed =
    seedOverride ??
    Math.floor(hashUnit(season.seed, fixture.id, "match-seed") * 2_000_000_000) + 1;
  return {
    fixtureId: fixture.id,
    seed,
    venue: fixture.venue,
    homeTeam: simTeam(home, homePlayers),
    awayTeam: simTeam(away, awayPlayers),
    homeTeamId: home.team_id,
    awayTeamId: away.team_id,
    userTeamId: season.user_team_id,
    noResultEligible: fixture.stage === "league",
  };
}

function nrrBalls(balls: number | null, wickets: number | null): number {
  if ((wickets ?? 0) >= 10) return 120;
  return Math.max(0, balls ?? 0);
}

export function computeStandingsForSeason(
  db: Db,
  season: SeasonRow,
): { standings: StandingRow[]; complete: boolean } {
  const teams = loadSeasonTeams(db, season.id);
  const fixtures = loadFixtures(db, season.id).filter(
    (fixture) => fixture.stage === "league" && fixture.status === "completed",
  );
  const standingsTeams: StandingsTeam[] = teams.map((team) => ({
    id: team.team_id,
    name: team.name,
    shortName: team.short_name,
    primary: team.primary_color,
  }));
  const results: StandingsResult[] = [];
  for (const fixture of fixtures) {
    if (!fixture.home_team_id || !fixture.away_team_id) continue;
    const state = parseJson<{ result?: { noResult?: boolean } } | null>(fixture.state_json, null);
    const noResult = state?.result?.noResult === true;
    const homeBalls = noResult ? 0 : nrrBalls(fixture.home_balls, fixture.home_wickets);
    const awayBalls = noResult ? 0 : nrrBalls(fixture.away_balls, fixture.away_wickets);
    const tied = !noResult && !fixture.winner_team_id;
    results.push({
      teamId: fixture.home_team_id,
      opponentId: fixture.away_team_id,
      matchNumber: fixture.match_number,
      date: fixture.match_date,
      won: fixture.winner_team_id === fixture.home_team_id,
      tied,
      noResult,
      runsFor: noResult ? 0 : fixture.home_runs ?? 0,
      ballsFaced: homeBalls,
      runsAgainst: noResult ? 0 : fixture.away_runs ?? 0,
      ballsBowled: awayBalls,
    });
    results.push({
      teamId: fixture.away_team_id,
      opponentId: fixture.home_team_id,
      matchNumber: fixture.match_number,
      date: fixture.match_date,
      won: fixture.winner_team_id === fixture.away_team_id,
      tied,
      noResult,
      runsFor: noResult ? 0 : fixture.away_runs ?? 0,
      ballsFaced: awayBalls,
      runsAgainst: noResult ? 0 : fixture.home_runs ?? 0,
      ballsBowled: homeBalls,
    });
  }
  const complete = fixtures.length === 70;
  return { standings: computeStandings(standingsTeams, results, complete), complete };
}

export function leagueComplete(db: Db, seasonId: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS played FROM season_fixtures
       WHERE season_id = ? AND stage = 'league' AND status = 'completed'`,
    )
    .get(seasonId) as { played: number };
  return row.played === 70;
}
