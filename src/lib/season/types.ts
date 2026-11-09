export type SeasonStatus = "active" | "completed";

export type SeasonStage = "league" | "Qualifier 1" | "Eliminator" | "Qualifier 2" | "Final";

export type TossDecision = "bat" | "field";

export type TeamTactics = "attack" | "balanced" | "defend";

export type SimCareerStats = {
  matches: number;
  runs: number;
  ballsFaced: number;
  dismissals: number;
  fours: number;
  sixes: number;
  wickets: number;
  ballsBowled: number;
  runsConceded: number;
  dots: number;
  strikeRate: number | null;
  battingAverage: number | null;
  economy: number | null;
  bowlingStrikeRate: number | null;
  dotPercent: number | null;
};

export type SimPlayer = {
  id: string;
  name: string;
  shortName: string;
  role: string;
  isOverseas: boolean;
  isKeeper: boolean;
  isCaptain: boolean;
  batting: number;
  bowling: number;
  fielding: number;
  ovr: number | null;
  battingOrder: number;
  ratingEvidence: string | null;
  /** IPL career record used to shape this player's simulated outcomes. */
  career?: SimCareerStats | null;
};

export type SimTeam = {
  id: string;
  name: string;
  shortName: string;
  primary: string;
  secondary: string;
  tactics: TeamTactics;
  battingAggression: number;
  bowlingAggression: number;
  players: SimPlayer[];
};

export type MatchSetup = {
  fixtureId: string;
  seed: number;
  venue: string | null;
  homeTeam: SimTeam;
  awayTeam: SimTeam;
  homeTeamId: string;
  awayTeamId: string;
  userTeamId: string;
  noResultEligible: boolean;
};

export type BattingCard = {
  playerId: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  dismissal: string | null;
  bowlerId: string | null;
  fielderId: string | null;
};

export type BowlingCard = {
  playerId: string;
  balls: number;
  runs: number;
  wickets: number;
  dots: number;
  wides: number;
  noBalls: number;
};

export type FallOfWicket = {
  wicket: number;
  runs: number;
  legalBalls: number;
  playerId: string;
};

export type InningsState = {
  number: number;
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: number;
  target: number | null;
  maxBalls: number;
  maxWickets: number;
  superOver: boolean;
  strikerId: string;
  nonStrikerId: string;
  nextBatterIndex: number;
  battingOrder: string[];
  batsmen: Record<string, BattingCard>;
  bowlers: Record<string, BowlingCard>;
  fallOfWickets: FallOfWicket[];
  overNumber: number;
  ballInOver: number;
  lastOverBowlerId: string | null;
  bowlerId: string;
  freeHit: boolean;
  deliveryCount: number;
  done: boolean;
};

export type MatchResult = {
  winnerTeamId: string | null;
  loserTeamId: string | null;
  summary: string;
  margin: string;
  method: "runs" | "wickets" | "super-over" | "boundary-count" | "tie-break" | "no-result";
  superOver: boolean;
  noResult: boolean;
  playerOfMatchId: string | null;
};

export type MatchState = {
  version: 1;
  phase: "live" | "innings_break" | "complete";
  seed: number;
  venue: string | null;
  tossWinnerTeamId: string;
  tossDecision: TossDecision;
  innings: InningsState[];
  completedInnings: number[];
  target: number | null;
  superOver: boolean;
  result: MatchResult | null;
  firstBattingTeamId: string;
  secondBattingTeamId: string;
};

export type DeliveryRecord = {
  inningsNumber: number;
  deliveryNumber: number;
  overNumber: number;
  ballInOver: number;
  batterId: string;
  bowlerId: string;
  nonStrikerId: string;
  runsBatter: number;
  runsExtras: number;
  runsTotal: number;
  extraType: "wide" | "nb" | null;
  wicketType: string | null;
  playerOutId: string | null;
  fielderId: string | null;
  isLegal: boolean;
  freeHit: boolean;
  scoreRuns: number;
  scoreWickets: number;
  commentary: string;
};

export type SimulateOptions = {
  maxDeliveries?: number;
  stopAtInningsBreak?: boolean;
  stopAtCompletion?: boolean;
};

export type InningsSummary = {
  number: number;
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: number;
  superOver: boolean;
  batting: Array<BattingCard & { name: string; order: number }>;
  bowling: Array<BowlingCard & { name: string }>;
  fallOfWickets: FallOfWicket[];
};

export type LineupInput = {
  playerIds: string[];
  battingOrder: string[];
  captainId: string;
  keeperId: string;
};

export type SeasonPlayerOption = {
  id: string;
  name: string;
  shortName: string;
  role: string;
  isOverseas: boolean;
  capped: boolean | null;
  ovr: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  evidenceQuality: string | null;
  priceLakh: number;
  acquiredVia: string;
  isCallup: boolean;
  isPlaying: boolean;
  battingOrder: number;
  isCaptain: boolean;
  isKeeper: boolean;
};

export type SeasonTeamSummary = {
  id: string;
  name: string;
  shortName: string;
  city: string | null;
  primary: string;
  secondary: string;
  ink: string;
  isUserControlled: boolean;
  tactics: TeamTactics;
  squadSize: number;
  overseasCount: number;
  playingXiOvr: number | null;
  callupCount: number;
  isChampion: boolean;
};

export type SeasonFixtureSummary = {
  id: string;
  matchNumber: number;
  stage: SeasonStage;
  round: number;
  date: string;
  venue: string | null;
  city: string | null;
  status: "scheduled" | "live" | "completed";
  homeTeamId: string | null;
  homeTeamName: string | null;
  homeTeamShort: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  awayTeamShort: string | null;
  homeScore: string | null;
  awayScore: string | null;
  resultSummary: string | null;
  winnerTeamId: string | null;
  isUserMatch: boolean;
  isHumanMatch: boolean;
  hasHuman: boolean;
  homeReady: boolean;
  awayReady: boolean;
  readyDeadline: string | null;
  hasState: boolean;
  playerOfMatchName: string | null;
};

export type StandingRow = {
  position: number;
  teamId: string;
  teamName: string;
  teamShort: string;
  primary: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  runsFor: number;
  ballsFaced: number;
  runsAgainst: number;
  ballsBowled: number;
  nrr: number;
  form: Array<"W" | "L" | "T" | "N">;
  qualification: "q1" | "eliminator" | "none";
};

export type MatchCommentary = {
  id: number;
  inningsNumber: number;
  deliveryNumber: number;
  overNumber: number;
  ballInOver: number;
  runsTotal: number;
  isWicket: boolean;
  extraType: string | null;
  commentary: string;
  scoreRuns: number;
  scoreWickets: number;
  batterId: string;
  bowlerId: string;
};

export type MatchControlBowler = {
  id: string;
  name: string;
  oversBowled: number;
  ballsBowled: number;
  eligible: boolean;
  note: string | null;
  detail: string | null;
};

export type MatchControlBatter = {
  id: string;
  name: string;
  order: number;
  eligible: boolean;
  detail: string | null;
};

export type MatchControl = {
  /** Innings the next delivery belongs to. */
  inningsNumber: number | null;
  /** Team batting in the innings the next delivery belongs to. */
  battingTeamId: string | null;
  /** Team bowling in the innings the next delivery belongs to. */
  bowlingTeamId: string | null;
  /** True when both sides of this fixture are human managers. */
  humanMatch: boolean;
  /** True when the next delivery opens an over, so the bowler can be chosen. */
  needBowler: boolean;
  suggestedBowlerId: string | null;
  bowlers: MatchControlBowler[];
  /** True while a wicket is yet to fall; the pick is used when it does. */
  nextBatterId: string | null;
  batters: MatchControlBatter[];
};

export type MatchScorecard = {
  fixtureId: string;
  state: MatchState;
  innings: InningsSummary[];
  commentary: MatchCommentary[];
  result: MatchResult | null;
  control: MatchControl | null;
};

export type SeasonAward = {
  id: string;
  label: string;
  playerId: string | null;
  playerName: string;
  teamId: string | null;
  teamShort: string;
  value: string;
  detail: string;
};

export type SeasonSnapshot = {
  season: {
    id: string;
    sessionId: string;
    status: SeasonStatus;
    year: number;
    asOfSeason: number;
    userTeamId: string;
    scheduleSource: string;
    scheduleNote: string;
    startedAt: string;
    completedAt: string | null;
    updatedAt: string;
    championTeamId: string | null;
    runnerUpTeamId: string | null;
  };
  teams: SeasonTeamSummary[];
  userTeam: SeasonTeamSummary | null;
  userSquad: SeasonPlayerOption[];
  fixtures: SeasonFixtureSummary[];
  standings: StandingRow[];
  nextFixture: SeasonFixtureSummary | null;
  nextUserFixture: SeasonFixtureSummary | null;
  liveFixture: SeasonFixtureSummary | null;
  progress: {
    leaguePlayed: number;
    leagueTotal: number;
    playoffsPlayed: number;
    playoffsTotal: number;
    totalPlayed: number;
    totalMatches: number;
    percent: number;
    stageLabel: string;
  };
  upcomingUserFixture: SeasonFixtureSummary | null;
  champion: SeasonTeamSummary | null;
  awards: SeasonAward[];
  match: MatchScorecard | null;
  recentResults: SeasonFixtureSummary[];
  callups: Array<{ playerId: string; playerName: string; teamId: string; teamShort: string; reason: string }>;
  /** Bulk simulation needs every human manager in the room to agree. */
  advanceVotes: {
    required: number;
    league: number;
    season: number;
    viewer: { league: boolean; season: boolean };
  };
  canStart: boolean;
  startBlockedReason: string | null;
  /** Who this snapshot is rendered for. Multiplayer rooms are seat-scoped. */
  viewer: {
    teamId: string;
    teamName: string | null;
    isHost: boolean;
    canAct: boolean;
    humanCount: number;
  };
  notes: string[];
};

export class SeasonError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "SeasonError";
    this.code = code;
    this.status = status;
  }
}
