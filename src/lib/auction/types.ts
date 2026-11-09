import type { AiProfileId, AuctionModeId } from "./modes";

export type AuctionSessionStatus = "lobby" | "active" | "completed" | "abandoned";

export type SnapshotParticipant = {
  id: string;
  teamId: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  online: boolean;
  isViewer: boolean;
  joinedAt: string;
};

export type SnapshotSeat = {
  teamId: string;
  participantId: string | null;
  displayName: string | null;
  isHost: boolean;
  isReady: boolean;
  online: boolean;
  isViewer: boolean;
  isAi: boolean;
};

export type SnapshotChatMessage = {
  id: number;
  teamId: string | null;
  displayName: string;
  kind: string;
  body: string;
  createdAt: string;
};

export type SnapshotLobby = {
  joinCode: string;
  status: "lobby" | "live" | "closed";
  paused: boolean;
  tickMs: number;
  startedAt: string | null;
  viewer: {
    participantId: string | null;
    teamId: string | null;
    isHost: boolean;
    canAct: boolean;
  };
  participants: SnapshotParticipant[];
  seats: SnapshotSeat[];
  chat: SnapshotChatMessage[];
  humanCount: number;
  aiCount: number;
};

export type SnapshotRating = {
  ovr: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  role: string;
  evidenceQuality: string;
  asOfSeason: number;
  formulaVersion: string;
};

export type SnapshotEvidence = {
  matches: number;
  inningsBat: number;
  runs: number;
  ballsFaced: number;
  strikeRate: number | null;
  average: number | null;
  highScore: number;
  fours: number;
  sixes: number;
  inningsBowl: number;
  ballsBowled: number;
  wickets: number;
  economy: number | null;
  bowlingAverage: number | null;
  catches: number;
  stumpings: number;
  seasons: number;
};

export type SnapshotMarketValue = {
  valueLakh: number;
  referenceLakh: number;
  lowLakh: number;
  highLakh: number;
  tier: "Marquee" | "Premium" | "Core" | "Rotation" | "Development";
  factors: Array<{ label: string; multiplier: number; note: string }>;
  rationale: string;
  coreLakh: number;
};

export type SnapshotPlayer = {
  id: string;
  name: string;
  shortName: string;
  role: string;
  roleSource: string;
  birthDate: string | null;
  age: number | null;
  country: string | null;
  isOverseas: boolean | null;
  capped: boolean | null;
  primaryTeamId: string | null;
  rating: SnapshotRating | null;
  marketValue: SnapshotMarketValue | null;
  evidence: SnapshotEvidence | null;
  dataStatus: string;
  auctions: Array<{
    year: number;
    basePriceLakh: number;
    winningBidLakh: number | null;
    buyerTeamId: string | null;
    buyerTeamName: string | null;
    basePriceVerified: boolean;
  }>;
};

export type SnapshotRulebook = {
  id: string;
  name: string;
  season: number;
  auctionType: string;
  status: string;
  purseCapLakh: number;
  purseCapVerified: boolean;
  squadMin: number;
  squadMax: number;
  overseasMax: number;
  rtmCards: number;
  rtmEnabled: boolean;
  incrementsVerified: boolean;
  increments: Array<{ upToLakh: number | null; incrementLakh: number }>;
};

export type SnapshotBid = {
  id: number;
  teamId: string;
  amountLakh: number;
  kind: string;
  createdAt: string;
};

export type SnapshotLot = {
  id: string;
  lotNumber: number;
  status: "pending" | "live" | "rtm" | "sold" | "unsold";
  setName: string;
  basePriceLakh: number;
  basePriceVerified: boolean;
  currentBidLakh: number | null;
  revisedPriceLakh: number | null;
  leaderTeamId: string | null;
  leaderTeamName: string | null;
  originalTeamId: string | null;
  originalTeamName: string | null;
  rtmAvailable: boolean;
  rtmStatus: string | null;
  finalPriceLakh: number | null;
  winningTeamId: string | null;
  winningTeamName: string | null;
  soldVia: string | null;
  nextBidLakh: number | null;
  going: number;
  player: SnapshotPlayer;
  actualAuction: {
    buyerTeamId: string | null;
    buyerTeamName: string | null;
    winningBidLakh: number;
    basePriceLakh: number;
  } | null;
  userBidBlockedReason: string | null;
  bids: SnapshotBid[];
  rtmActions: {
    canInvoke: boolean;
    canDeclineOriginal: boolean;
    canRaise: boolean;
    canHold: boolean;
    canMatch: boolean;
    canDeclineMatch: boolean;
    targetTeamId: string | null;
    minRaiseLakh: number | null;
    maxRaiseLakh: number | null;
    prompt: string | null;
  };
};

export type SnapshotTeamRoleCounts = {
  batter: number;
  bowler: number;
  allRounder: number;
  wicketkeeper: number;
  unknown: number;
};

export type SnapshotTeam = {
  id: string;
  name: string;
  shortName: string;
  city: string;
  primary: string;
  secondary: string;
  ink: string;
  isHuman: boolean;
  isViewer: boolean;
  managerName: string | null;
  managerOnline: boolean;
  aiProfile: AiProfileId;
  aiProfileLabel: string;
  aiProfileColor: string;
  openingPurseLakh: number;
  purseLakh: number;
  spentLakh: number;
  preExistingValueLakh: number;
  maxBidLakh: number;
  rtmRemaining: number;
  squadSize: number;
  overseasCount: number;
  roleCounts: SnapshotTeamRoleCounts;
};

export type SnapshotSquadPlayer = {
  playerId: string;
  name: string;
  role: string;
  isOverseas: boolean | null;
  priceLakh: number;
  acquiredVia: string;
  rating: number | null;
  retained: boolean;
};

export type SnapshotEvent = {
  id: number;
  type: string;
  message: string;
  createdAt: string;
  lotNumber: number | null;
  payload: Record<string, unknown> | null;
};

export type SnapshotUpcomingLot = {
  id: string;
  lotNumber: number;
  setName: string;
  playerId: string;
  playerName: string;
  role: string;
  basePriceLakh: number;
};

export type AuctionSessionConfig = {
  mode: AuctionModeId;
  pool: string;
  retentionKind: "none" | "estimated" | "contract-2026";
  minSquadExempt: boolean;
  simulatedBasePrices: boolean;
  simulatedRetention: boolean;
  retentionNote: string | null;
  asOfSeason: number;
  seed: number;
};

export type AuctionSnapshot = {
  session: {
    id: string;
    name: string;
    mode: AuctionModeId;
    season: number;
    status: AuctionSessionStatus;
    userTeamId: string;
    userName: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    totalLots: number;
    completedLots: number;
    config: AuctionSessionConfig;
    rulebook: SnapshotRulebook;
  };
  currentLot: SnapshotLot | null;
  teams: SnapshotTeam[];
  userTeam: SnapshotTeam | null;
  userSquad: SnapshotSquadPlayer[];
  recentEvents: SnapshotEvent[];
  lastEvent: SnapshotEvent | null;
  upcomingLots: SnapshotUpcomingLot[];
  finished: boolean;
  lotProgress: number;
  lobby: SnapshotLobby | null;
};

export type AuctionAction =
  | { type: "tick" }
  | { type: "bid"; amountLakh: number }
  | { type: "rtm_invoke" }
  | { type: "rtm_decline" }
  | { type: "rtm_raise"; amountLakh?: number | null }
  | { type: "rtm_hold" }
  | { type: "rtm_match" }
  | { type: "rtm_decline_match" };

export type SessionSummary = {
  id: string;
  name: string;
  mode: AuctionModeId;
  modeName: string;
  season: number;
  status: AuctionSessionStatus;
  userTeamId: string;
  userTeamName: string;
  totalLots: number;
  completedLots: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  userSquadSize: number;
  userSpentLakh: number;
  userPurseLakh: number;
  joinCode: string | null;
  participantCount: number;
  isMultiplayer: boolean;
};
