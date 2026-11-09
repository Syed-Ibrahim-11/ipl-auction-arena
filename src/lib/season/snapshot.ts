import { getDb } from "@/db";
import { computeAwards, type AwardStatLine } from "./awards";
import { summariseInnings } from "./engine";
import {
  computeStandingsForSeason,
  humanTeamIds,
  loadFixtures,
  loadFixture,
  loadSeason,
  loadSeasonBySession,
  loadSeasonTeams,
  loadSession,
  loadTeamSquad,
  loadLineupRows,
  loadXiPlayers,
  parseJson,
  resolveViewerTeamId,
  seasonSquadIssues,
  type Db,
  type FixtureRow,
  type SeasonRow,
  type SeasonTeamRow,
  type SquadPlayer,
} from "./internal";
import { fallbackBatting, fallbackBowling } from "./internal";
import type {
  MatchCommentary,
  MatchControl,
  MatchControlBatter,
  MatchControlBowler,
  MatchScorecard,
  MatchSetup,
  MatchState,
  SeasonAward,
  SeasonFixtureSummary,
  SeasonPlayerOption,
  SeasonSnapshot,
  SeasonStage,
  SeasonTeamSummary,
  SimPlayer,
  SimTeam,
  TeamTactics,
} from "./types";
import { SeasonError } from "./types";

export type SeasonLaunchInfo = {
  sessionId: string;
  sessionName: string;
  sessionStatus: string;
  userTeamId: string;
  userTeamName: string;
  seasonId: string | null;
  canStart: boolean;
  blockedReason: string | null;
};

export function getSeasonLaunchInfo(sessionId: string): SeasonLaunchInfo {
  const db = getDb();
  let session;
  try {
    session = loadSession(db, sessionId);
  } catch {
    throw new SeasonError("SESSION_NOT_FOUND", "That auction session could not be found.", 404);
  }
  const season = loadSeasonBySession(db, sessionId);
  const team = session.user_team_id
    ? (db.prepare("SELECT name FROM teams WHERE id = ?").get(session.user_team_id) as
        | { name: string }
        | undefined)
    : undefined;
  const blockedReason =
    season === null && session.status !== "completed"
      ? "Finish every lot in the auction before starting the season."
      : season === null
        ? squadBlockedReason(db, sessionId)
        : null;
  return {
    sessionId,
    sessionName: session.name,
    sessionStatus: session.status,
    userTeamId: session.user_team_id ?? "",
    userTeamName: team?.name ?? "Your franchise",
    seasonId: season?.id ?? null,
    canStart: season === null && session.status === "completed" && blockedReason === null,
    blockedReason,
  };
}

function squadBlockedReason(db: ReturnType<typeof getDb>, sessionId: string): string | null {
  const issues = seasonSquadIssues(db, sessionId);
  if (issues.length === 0) return null;
  const listed = issues
    .slice(0, 3)
    .map((issue) => `${issue.teamName} (${issue.reason})`)
    .join("; ");
  const extra = issues.length > 3 ? ` and ${issues.length - 3} more` : "";
  return `The tournament uses the bought squads only, so every franchise needs a legal XI: ${listed}${extra}. Use a mode that builds full squads, such as the Mini Auction or Mega Draft.`;
}

function squadMap(teams: SeasonTeamRow[], squads: Map<string, SquadPlayer[]>): Map<string, SquadPlayer> {
  const map = new Map<string, SquadPlayer>();
  for (const team of teams) {
    for (const player of squads.get(team.team_id) ?? []) map.set(player.playerId, player);
  }
  return map;
}

function buildDisplaySetup(
  db: Db,
  teams: SeasonTeamRow[],
  squads: Map<string, SquadPlayer[]>,
  season: SeasonRow,
  fixture: FixtureRow,
  state: MatchState,
): MatchSetup {
  if (!fixture.home_team_id || !fixture.away_team_id) throw new Error("Fixture teams missing");
  const home = teams.find((team) => team.team_id === fixture.home_team_id);
  const away = teams.find((team) => team.team_id === fixture.away_team_id);
  if (!home || !away) throw new Error("Fixture team missing");

  const toSimTeam = (team: SeasonTeamRow): SimTeam => {
    const xi = loadXiPlayers(db, season.id, team.team_id, season.as_of_season);
    const players: SimPlayer[] =
      xi.length > 0
        ? xi
        : (squads.get(team.team_id) ?? []).map((player, index) => ({
            id: player.playerId,
            name: player.name,
            shortName: player.shortName,
            role: player.role,
            isOverseas: player.isOverseas,
            isKeeper: false,
            isCaptain: false,
            batting: player.batting ?? fallbackBatting(player.role),
            bowling: player.bowling ?? fallbackBowling(player.role),
            fielding: player.fielding ?? 50,
            ovr: player.ovr,
            battingOrder: index + 1,
            ratingEvidence: player.evidenceQuality,
            career: null,
          }));
    const tactics = (team.tactics === "attack" || team.tactics === "defend"
      ? team.tactics
      : "balanced") as TeamTactics;
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
  };

  return {
    fixtureId: fixture.id,
    seed: state.seed,
    venue: fixture.venue,
    homeTeam: toSimTeam(home),
    awayTeam: toSimTeam(away),
    homeTeamId: home.team_id,
    awayTeamId: away.team_id,
    userTeamId: season.user_team_id,
    noResultEligible: fixture.stage === "league",
  };
}

export function buildMatchScorecard(
  db: Db,
  season: SeasonRow,
  fixture: FixtureRow,
  humanTeams: Set<string> = new Set(),
): MatchScorecard | null {
  const state = parseJson<MatchState | null>(fixture.state_json, null);
  if (!state) return null;
  const teams = loadSeasonTeams(db, season.id);
  const squads = new Map<string, SquadPlayer[]>();
  for (const team of teams) {
    squads.set(team.team_id, loadTeamSquad(db, season.id, season.session_id, team.team_id, season.as_of_season));
  }
  const setup = buildDisplaySetup(db, teams, squads, season, fixture, state);
  const humanMatch =
    fixture.home_team_id !== null &&
    fixture.away_team_id !== null &&
    humanTeams.has(fixture.home_team_id) &&
    humanTeams.has(fixture.away_team_id);
  const commentaryRows = db
    .prepare(
      `SELECT id, innings_number, delivery_number, over_number, ball_in_over, runs_total,
              wicket_type, extra_type, commentary, score_runs, score_wickets, batter_id, bowler_id
       FROM season_deliveries WHERE fixture_id = ? ORDER BY innings_number, delivery_number`,
    )
    .all(fixture.id) as Array<{
    id: number;
    innings_number: number;
    delivery_number: number;
    over_number: number;
    ball_in_over: number;
    runs_total: number;
    wicket_type: string | null;
    extra_type: string | null;
    commentary: string;
    score_runs: number;
    score_wickets: number;
    batter_id: string;
    bowler_id: string;
  }>;
  const commentary: MatchCommentary[] = commentaryRows.map((row) => ({
    id: row.id,
    inningsNumber: row.innings_number,
    deliveryNumber: row.delivery_number,
    overNumber: row.over_number,
    ballInOver: row.ball_in_over,
    runsTotal: row.runs_total,
    isWicket: row.wicket_type !== null,
    extraType: row.extra_type,
    commentary: row.commentary,
    scoreRuns: row.score_runs,
    scoreWickets: row.score_wickets,
    batterId: row.batter_id,
    bowlerId: row.bowler_id,
  }));

  return {
    fixtureId: fixture.id,
    state,
    innings: state.innings.map((innings) => summariseInnings(innings, setup)),
    commentary,
    result: state.result,
    control: buildMatchControl(state, setup, humanMatch),
  };
}

/** Human choices the match centre can offer before the next delivery. */
function buildMatchControl(state: MatchState, setup: MatchSetup, humanMatch: boolean): MatchControl | null {
  if (state.phase === "complete") return null;
  const upcoming = state.phase === "innings_break";
  const innings = upcoming ? null : state.innings[state.innings.length - 1];
  if (!upcoming && !innings) return null;

  const battingTeamId = upcoming
    ? state.secondBattingTeamId
    : (innings as NonNullable<typeof innings>).battingTeamId;
  const bowlingTeamId = upcoming
    ? state.firstBattingTeamId
    : (innings as NonNullable<typeof innings>).bowlingTeamId;
  const bowlingTeam =
    setup.homeTeam.id === bowlingTeamId ? setup.homeTeam : setup.awayTeam;
  const battingTeam = setup.homeTeam.id === battingTeamId ? setup.homeTeam : setup.awayTeam;
  const lastOverBowlerId = innings?.lastOverBowlerId ?? null;
  const ballLimit = (innings?.superOver ? 1 : 4) * 6;

  const bowlers: MatchControlBowler[] = bowlingTeam.players.map((player) => {
    const balls = innings?.bowlers[player.id]?.balls ?? 0;
    const note =
      balls >= ballLimit
        ? "Over limit reached"
        : lastOverBowlerId === player.id
          ? "Bowled the last over"
          : balls === 0
            ? "Fresh"
            : `${Math.floor(balls / 6)}.${balls % 6} overs`;
    const career = player.career;
    const detailParts = [
      player.ovr !== null ? `OVR ${player.ovr}` : null,
      career?.economy !== null && career?.economy !== undefined ? `Econ ${career.economy}` : null,
      career?.bowlingStrikeRate !== null && career?.bowlingStrikeRate !== undefined
        ? `SR ${career.bowlingStrikeRate}`
        : null,
      career?.dotPercent !== null && career?.dotPercent !== undefined
        ? `${Math.round(career.dotPercent)}% dots`
        : null,
    ].filter((entry): entry is string => entry !== null);
    return {
      id: player.id,
      name: player.name,
      oversBowled: Math.floor(balls / 6),
      ballsBowled: balls,
      eligible: balls < ballLimit && lastOverBowlerId !== player.id,
      note,
      detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
    };
  });

  const order = innings?.battingOrder ?? battingTeam.players.map((player) => player.id);
  const nextIndex = innings?.nextBatterIndex ?? 2;
  const batters: MatchControlBatter[] = order.slice(nextIndex).map((id, index) => {
    const player = battingTeam.players.find((entry) => entry.id === id);
    const career = player?.career;
    const detailParts = [
      player?.ovr !== null && player?.ovr !== undefined ? `OVR ${player.ovr}` : null,
      career?.strikeRate !== null && career?.strikeRate !== undefined ? `SR ${career.strikeRate}` : null,
      career?.battingAverage !== null && career?.battingAverage !== undefined
        ? `Avg ${career.battingAverage}`
        : null,
    ].filter((entry): entry is string => entry !== null);
    return {
      id,
      name: player?.name ?? "Batter",
      order: nextIndex + index + 1,
      eligible: innings?.batsmen[id]?.out !== true,
      detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
    };
  });

  return {
    inningsNumber: upcoming ? state.innings.length + 1 : (innings as NonNullable<typeof innings>).number,
    battingTeamId,
    bowlingTeamId,
    humanMatch,
    needBowler: upcoming || (innings as NonNullable<typeof innings>).ballInOver === 0,
    suggestedBowlerId: innings?.bowlerId ?? null,
    bowlers,
    nextBatterId: batters.find((batter) => batter.eligible)?.id ?? null,
    batters,
  };
}

export function getMatchScorecard(sessionId: string, fixtureId: string): MatchScorecard | null {
  const db = getDb();
  const season = loadSeasonBySession(db, sessionId);
  if (!season) return null;
  const fixture = loadFixture(db, season.id, fixtureId);
  return buildMatchScorecard(db, season, fixture, humanTeamIds(db, season));
}

function fixtureSummary(
  fixture: FixtureRow,
  teamsById: Map<string, SeasonTeamRow>,
  playerNames: Map<string, string>,
  userTeamId: string,
  humanTeams: Set<string>,
): SeasonFixtureSummary {
  const home = fixture.home_team_id ? teamsById.get(fixture.home_team_id) : undefined;
  const away = fixture.away_team_id ? teamsById.get(fixture.away_team_id) : undefined;
  return {
    id: fixture.id,
    matchNumber: fixture.match_number,
    stage: fixture.stage as SeasonStage,
    round: fixture.round,
    date: fixture.match_date,
    venue: fixture.venue,
    city: fixture.city,
    status: fixture.status as SeasonFixtureSummary["status"],
    homeTeamId: fixture.home_team_id,
    homeTeamName: home?.name ?? null,
    homeTeamShort: home?.short_name ?? null,
    awayTeamId: fixture.away_team_id,
    awayTeamName: away?.name ?? null,
    awayTeamShort: away?.short_name ?? null,
    homeScore: fixture.home_score,
    awayScore: fixture.away_score,
    resultSummary: fixture.result_summary,
    winnerTeamId: fixture.winner_team_id,
    isUserMatch:
      fixture.home_team_id === userTeamId || fixture.away_team_id === userTeamId,
    isHumanMatch:
      fixture.home_team_id !== null &&
      fixture.away_team_id !== null &&
      humanTeams.has(fixture.home_team_id) &&
      humanTeams.has(fixture.away_team_id),
    hasHuman:
      (fixture.home_team_id !== null && humanTeams.has(fixture.home_team_id)) ||
      (fixture.away_team_id !== null && humanTeams.has(fixture.away_team_id)),
    homeReady: fixture.home_ready === 1,
    awayReady: fixture.away_ready === 1,
    readyDeadline: fixture.ready_deadline_at,
    hasState: fixture.state_json !== null,
    playerOfMatchName: fixture.player_of_match_id
      ? playerNames.get(fixture.player_of_match_id) ?? null
      : null,
  };
}

function awardLines(db: Db, season: SeasonRow, squads: Map<string, SquadPlayer[]>): AwardStatLine[] {
  const teams = loadSeasonTeams(db, season.id);
  const lines = new Map<string, AwardStatLine>();
  for (const team of teams) {
    for (const player of squads.get(team.team_id) ?? []) {
      if (lines.has(player.playerId)) continue;
      lines.set(player.playerId, {
        playerId: player.playerId,
        name: player.name,
        teamId: team.team_id,
        teamShort: team.short_name,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        wickets: 0,
        ballsBowled: 0,
        runsConceded: 0,
        dots: 0,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
      });
    }
  }

  const rows = db
    .prepare(
      `SELECT d.batter_id, d.bowler_id, d.fielder_id, d.wicket_type, d.runs_batter, d.runs_total,
              d.is_legal
       FROM season_deliveries d
       JOIN season_fixtures f ON f.id = d.fixture_id
       WHERE f.season_id = ? AND f.status = 'completed'`,
    )
    .all(season.id) as Array<{
    batter_id: string;
    bowler_id: string;
    fielder_id: string | null;
    wicket_type: string | null;
    runs_batter: number;
    runs_total: number;
    is_legal: number;
  }>;

  for (const row of rows) {
    const batter = lines.get(row.batter_id);
    if (batter) {
      batter.runs += row.runs_batter;
      if (row.is_legal === 1) batter.balls += 1;
      if (row.runs_batter === 4) batter.fours += 1;
      if (row.runs_batter === 6) batter.sixes += 1;
    }
    const bowler = lines.get(row.bowler_id);
    if (bowler) {
      if (row.is_legal === 1) bowler.ballsBowled += 1;
      bowler.runsConceded += row.runs_total;
      if (row.is_legal === 1 && row.runs_total === 0 && row.wicket_type === null) bowler.dots += 1;
      if (row.wicket_type && row.wicket_type !== "run out") bowler.wickets += 1;
    }
    if (row.fielder_id) {
      const fielder = lines.get(row.fielder_id);
      if (fielder) {
        if (row.wicket_type === "caught" || row.wicket_type === "caught and bowled") fielder.catches += 1;
        else if (row.wicket_type === "stumped") fielder.stumpings += 1;
        else if (row.wicket_type === "run out") fielder.runOuts += 1;
      }
    }
  }
  return [...lines.values()];
}

function teamSummary(
  team: SeasonTeamRow,
  squad: SquadPlayer[],
  xiIds: Set<string>,
  championTeamId: string | null,
): SeasonTeamSummary {
  const xi = squad.filter((player) => xiIds.has(player.playerId));
  const rated = xi.filter((player) => player.ovr !== null);
  const playingXiOvr =
    rated.length > 0 ? Math.round(rated.reduce((sum, player) => sum + (player.ovr ?? 0), 0) / rated.length) : null;
  return {
    id: team.team_id,
    name: team.name,
    shortName: team.short_name,
    city: team.city,
    primary: team.primary_color,
    secondary: team.secondary_color,
    ink: team.ink_color,
    isUserControlled: team.is_user_controlled === 1,
    tactics: team.tactics as TeamTactics,
    squadSize: squad.length,
    overseasCount: squad.filter((player) => player.isOverseas).length,
    playingXiOvr,
    callupCount: squad.filter((player) => player.isCallup).length,
    isChampion: championTeamId === team.team_id,
  };
}

export function buildSeasonSnapshot(
  db: Db,
  season: SeasonRow,
  viewerTeamId?: string | null,
  actingTeamId?: string | null,
): SeasonSnapshot {
  const teams = loadSeasonTeams(db, season.id);
  const humanTeams = new Set(
    teams.filter((team) => team.is_user_controlled === 1).map((team) => team.team_id),
  );
  const effectiveViewer =
    viewerTeamId && humanTeams.has(viewerTeamId)
      ? viewerTeamId
      : humanTeams.has(season.user_team_id)
        ? season.user_team_id
        : ([...humanTeams][0] ?? season.user_team_id);
  // Displaying a team's page does not grant control of it. Acting requires a
  // verified seat token (or a solo season, which resolveViewerTeamId resolves).
  const effectiveActor =
    actingTeamId === undefined ? (viewerTeamId ?? season.user_team_id) : actingTeamId;
  const fixtures = loadFixtures(db, season.id);
  const squads = new Map<string, SquadPlayer[]>();
  const lineups = new Map<string, Set<string>>();
  for (const team of teams) {
    squads.set(team.team_id, loadTeamSquad(db, season.id, season.session_id, team.team_id, season.as_of_season));
    lineups.set(team.team_id, new Set(loadLineupRows(db, season.id, team.team_id).filter((row) => row.is_playing === 1).map((row) => row.player_id)));
  }

  const teamsById = new Map(teams.map((team) => [team.team_id, team]));
  const players = squadMap(teams, squads);
  const playerNames = new Map([...players.values()].map((player) => [player.playerId, player.name]));
  const summaries = teams.map((team) =>
    teamSummary(team, squads.get(team.team_id) ?? [], lineups.get(team.team_id) ?? new Set(), season.champion_team_id),
  );
  const userTeam = teams.find((team) => team.team_id === effectiveViewer);
  const userSquadRows = squads.get(effectiveViewer) ?? [];
  const userLineup = new Map(
    loadLineupRows(db, season.id, effectiveViewer).map((row) => [row.player_id, row]),
  );
  const userSquad: SeasonPlayerOption[] = userSquadRows.map((player) => {
    const slot = userLineup.get(player.playerId);
    return {
      id: player.playerId,
      name: player.name,
      shortName: player.shortName,
      role: player.role,
      isOverseas: player.isOverseas,
      capped: player.capped,
      ovr: player.ovr,
      batting: player.batting,
      bowling: player.bowling,
      fielding: player.fielding,
      evidenceQuality: player.evidenceQuality,
      priceLakh: player.priceLakh,
      acquiredVia: player.acquiredVia,
      isCallup: player.isCallup,
      isPlaying: slot?.is_playing === 1,
      battingOrder: slot?.batting_order ?? 0,
      isCaptain: slot?.is_captain === 1,
      isKeeper: slot?.is_keeper === 1,
    };
  });

  const fixtureSummaries = fixtures.map((fixture) =>
    fixtureSummary(fixture, teamsById, playerNames, effectiveViewer, humanTeams),
  );
  const { standings, complete: leagueDone } = computeStandingsForSeason(db, season);
  const leagueTotal = fixtures.filter((fixture) => fixture.stage === "league").length;
  const leaguePlayed = fixtures.filter((fixture) => fixture.stage === "league" && fixture.status === "completed").length;
  const playoffFixtures = fixtures.filter((fixture) => fixture.stage !== "league");
  const playoffPlayed = playoffFixtures.filter((fixture) => fixture.status === "completed").length;
  const totalPlayed = leaguePlayed + playoffPlayed;
  const totalMatches = fixtures.length;
  const live = fixtureSummaries.find((fixture) => fixture.status === "live") ?? null;
  const scheduled = fixtureSummaries.filter(
    (fixture) => fixture.status === "scheduled" && fixture.homeTeamId && fixture.awayTeamId,
  );
  const nextFixture = live ?? scheduled[0] ?? null;
  const nextUserFixture =
    (live && live.isUserMatch ? live : null) ??
    scheduled.find((fixture) => fixture.isUserMatch) ??
    null;
  const championSummary = season.champion_team_id
    ? summaries.find((team) => team.id === season.champion_team_id) ?? null
    : null;

  const lines = awardLines(db, season, squads);
  let franchise: { teamId: string; teamName: string; teamShort: string; label: string } | null = null;
  if (season.champion_team_id) {
    const champ = teamsById.get(season.champion_team_id);
    if (champ) {
      franchise = { teamId: champ.team_id, teamName: champ.name, teamShort: champ.short_name, label: "Champions" };
    }
  } else if (standings.length > 0 && totalPlayed > 0) {
    const leader = standings[0];
    franchise = {
      teamId: leader.teamId,
      teamName: leader.teamName,
      teamShort: leader.teamShort,
      label: "Table leaders",
    };
  }
  const awards: SeasonAward[] = totalPlayed > 0 ? computeAwards(lines, franchise) : [];

  const callups = db
    .prepare(
      `SELECT c.player_id, c.team_id, c.reason, p.full_name, t.short_name
       FROM season_callups c
       JOIN players p ON p.id = c.player_id
       JOIN teams t ON t.id = c.team_id
       WHERE c.season_id = ? ORDER BY c.created_at`,
    )
    .all(season.id) as Array<{
    player_id: string;
    team_id: string;
    reason: string;
    full_name: string;
    short_name: string;
  }>;

  const unrated = [...squads.values()].flat().filter((player) => player.ovr === null).length;
  const voteRows = db
    .prepare("SELECT team_id, scope FROM season_sim_votes WHERE season_id = ?")
    .all(season.id) as Array<{ team_id: string; scope: string }>;
  const countVotes = (scope: "league" | "season") =>
    voteRows.filter((row) => row.scope === scope && humanTeams.has(row.team_id)).length;
  const viewerVoted = (scope: "league" | "season") =>
    voteRows.some((row) => row.scope === scope && row.team_id === effectiveViewer);
  const notes = [
    `Ratings are frozen at the auction's as-of season (${season.as_of_season}), so the season does not use hindsight from 2026 performances.`,
    unrated > 0
      ? `${unrated} squad players have no ${season.as_of_season} rating and use role-based neutral skills; they are flagged wherever they appear.`
      : "Every squad player has a rating from the auction's as-of season.",
    "Fixtures use the 2026 match archive as a schedule template. Playoff places are seeded from this simulated table, not the real tournament.",
    "Results, scorecards, commentary and awards come from a deterministic ball-by-ball simulation. They are not real IPL results, forecasts or official awards.",
    "Rain can abandon a league match before play (about one in eighty fixtures); both sides take one point and the match is excluded from NRR. In-play DLS revisions, injuries, player availability, mid-season transfers and post-auction salary-cap checks are not modelled.",
    "Super Overs repeat up to three times; a boundary countback and then a seeded tie-break settle the rare remaining tie.",
    "Home advantage adds a small +2 skill adjustment. Venue scoring bands are heuristic, not venue-specific ground data.",
    "Level points are separated by net run rate, then wins, then team name. NRR counts an all-out innings as 20 overs and ignores no-results.",
  ];
  if (callups.length > 0) {
    notes.push(
      `${callups.length} season call-up${callups.length === 1 ? "" : "s"} filled squads below the XI minimum or without a wicketkeeper, at zero fee and outside the auction ledger.`,
    );
  }

  const rawLive = fixtures.find((fixture) => fixture.status === "live") ?? null;
  const match = rawLive ? buildMatchScorecard(db, season, rawLive, humanTeams) : null;

  const seasonStatus = season.status as SeasonSnapshot["season"]["status"];
  const stageLabel =
    seasonStatus === "completed"
      ? `${championSummary?.shortName ?? "Champion"} are champions`
      : !leagueDone
        ? `League · ${leaguePlayed} of ${leagueTotal} played`
        : `Playoffs · ${playoffPlayed} of ${playoffFixtures.length} played`;

  return {
    season: {
      id: season.id,
      sessionId: season.session_id,
      status: seasonStatus,
      year: season.season_year,
      asOfSeason: season.as_of_season,
      userTeamId: season.user_team_id,
      scheduleSource: season.schedule_source,
      scheduleNote: season.schedule_note,
      startedAt: season.started_at,
      completedAt: season.completed_at,
      updatedAt: season.updated_at,
      championTeamId: season.champion_team_id,
      runnerUpTeamId: season.runner_up_team_id,
    },
    teams: summaries,
    userTeam: userTeam ? summaries.find((team) => team.id === userTeam.team_id) ?? null : null,
    userSquad,
    fixtures: fixtureSummaries,
    standings,
    nextFixture,
    nextUserFixture,
    liveFixture: live,
    progress: {
      leaguePlayed,
      leagueTotal,
      playoffsPlayed: playoffPlayed,
      playoffsTotal: playoffFixtures.length,
      totalPlayed,
      totalMatches,
      percent: totalMatches > 0 ? Math.round((totalPlayed / totalMatches) * 1000) / 10 : 0,
      stageLabel,
    },
    upcomingUserFixture: nextUserFixture,
    champion: championSummary,
    awards,
    match,
    recentResults: fixtureSummaries
      .filter((fixture) => fixture.status === "completed")
      .sort((a, b) => b.matchNumber - a.matchNumber)
      .slice(0, 5),
    callups: callups.map((row) => ({
      playerId: row.player_id,
      playerName: row.full_name,
      teamId: row.team_id,
      teamShort: row.short_name,
      reason: row.reason,
    })),
    advanceVotes: {
      required: humanTeams.size,
      league: countVotes("league"),
      season: countVotes("season"),
      viewer: { league: viewerVoted("league"), season: viewerVoted("season") },
    },
    canStart: false,
    startBlockedReason: null,
    viewer: {
      teamId: effectiveViewer,
      teamName: teamsById.get(effectiveViewer)?.name ?? null,
      isHost: effectiveViewer === season.user_team_id,
      canAct:
        season.status === "active" &&
        effectiveActor !== null &&
        humanTeams.has(effectiveActor),
      humanCount: humanTeams.size,
    },
    notes,
  };
}

export function getSeasonSnapshotForSession(
  sessionId: string,
  token?: string | null,
): SeasonSnapshot | null {
  const db = getDb();
  const season = loadSeasonBySession(db, sessionId);
  if (!season) return null;
  const resolved = resolveViewerTeamId(db, season, token);
  return buildSeasonSnapshot(db, season, resolved ?? season.user_team_id, resolved);
}

export function getSeasonSnapshot(seasonId: string): SeasonSnapshot {
  return buildSeasonSnapshot(getDb(), loadSeason(getDb(), seasonId));
}
