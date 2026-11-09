import { AI_PROFILES } from "./modes";
import {
  asSessionStatus,
  buildTeamContexts,
  incrementSlabs,
  isResolvedLot,
  loadActualAuction,
  loadCurrentLot,
  loadPlayerDetail,
  loadRulebook,
  loadSession,
  loadSessionConfig,
  loadSessionTeams,
  loadSquads,
  nowIso,
  parseJson,
  profileIdForTeam,
  resolveMode,
  snapshotRulebook,
  squadRules,
  pendingBasePrices,
  teamBidLimits,
  teamNamesMap,
  upcomingLots,
  type Db,
  type LotRow,
  type SessionTeamRow,
  type TeamContext,
} from "./internal";
import type {
  AuctionSnapshot,
  AuctionSessionStatus,
  SnapshotChatMessage,
  SnapshotEvent,
  SnapshotLobby,
  SnapshotLot,
  SnapshotParticipant,
  SnapshotPlayer,
  SnapshotSeat,
  SnapshotSquadPlayer,
  SnapshotTeam,
  SnapshotUpcomingLot,
} from "./types";
import { formatLakh } from "@/lib/money";
import { nextValidBid } from "@/lib/rules";

interface EventRow {
  id: number;
  type: string;
  message: string;
  payload_json: string | null;
  created_at: string;
}

interface LobbyRow {
  join_code: string;
  host_participant_id: string | null;
  status: string;
  paused: number;
  tick_ms: number;
  started_at: string | null;
}

interface ParticipantRow {
  id: string;
  team_id: string;
  display_name: string;
  is_host: number;
  is_ready: number;
  last_seen_at: string;
  joined_at: string;
}

interface ChatRow {
  id: number;
  team_id: string | null;
  display_name: string;
  kind: string;
  body: string;
  created_at: string;
}

const ONLINE_WINDOW_MS = 20_000;

type SeatOccupant = {
  id: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  online: boolean;
};

function buildLobbyState(
  db: Db,
  sessionId: string,
  sessionTeams: SessionTeamRow[],
  viewerTeamId: string | null,
): { lobby: SnapshotLobby | null; occupants: Map<string, SeatOccupant> } {
  const occupants = new Map<string, SeatOccupant>();
  const lobbyRow = db
    .prepare(
      `SELECT join_code, host_participant_id, status, paused, tick_ms, started_at
       FROM auction_lobbies WHERE session_id = ?`,
    )
    .get(sessionId) as LobbyRow | undefined;
  if (!lobbyRow) return { lobby: null, occupants };

  const rows = db
    .prepare(
      `SELECT id, team_id, display_name, is_host, is_ready, last_seen_at, joined_at
       FROM auction_participants WHERE session_id = ? ORDER BY joined_at`,
    )
    .all(sessionId) as ParticipantRow[];
  const now = Date.now();

  const participants: SnapshotParticipant[] = rows.map((row) => {
    const online = now - Date.parse(row.last_seen_at) <= ONLINE_WINDOW_MS;
    const occupant: SeatOccupant = {
      id: row.id,
      displayName: row.display_name,
      isHost: row.is_host === 1,
      isReady: row.is_ready === 1,
      online,
    };
    occupants.set(row.team_id, occupant);
    return {
      id: row.id,
      teamId: row.team_id,
      displayName: row.display_name,
      isHost: occupant.isHost,
      isReady: occupant.isReady,
      online,
      isViewer: viewerTeamId !== null && row.team_id === viewerTeamId,
      joinedAt: row.joined_at,
    };
  });

  const seats: SnapshotSeat[] = sessionTeams
    .map((team) => {
      const occupant = occupants.get(team.team_id);
      return {
        teamId: team.team_id,
        participantId: occupant?.id ?? null,
        displayName: occupant?.displayName ?? null,
        isHost: occupant?.isHost ?? false,
        isReady: occupant?.isReady ?? false,
        online: occupant?.online ?? false,
        isViewer: viewerTeamId !== null && team.team_id === viewerTeamId,
        isAi: !occupant,
      };
    })
    .sort((a, b) => Number(b.isViewer) - Number(a.isViewer) || Number(a.isAi) - Number(b.isAi));

  const chatRows = db
    .prepare(
      `SELECT id, team_id, display_name, kind, body, created_at
       FROM auction_chat WHERE session_id = ? ORDER BY id DESC LIMIT 50`,
    )
    .all(sessionId) as ChatRow[];
  const chat: SnapshotChatMessage[] = chatRows
    .reverse()
    .map((row) => ({
      id: row.id,
      teamId: row.team_id,
      displayName: row.display_name,
      kind: row.kind,
      body: row.body,
      createdAt: row.created_at,
    }));

  const viewer = viewerTeamId ? rows.find((row) => row.team_id === viewerTeamId) ?? null : null;
  return {
    lobby: {
      joinCode: lobbyRow.join_code,
      status: lobbyRow.status === "live" ? "live" : lobbyRow.status === "closed" ? "closed" : "lobby",
      paused: lobbyRow.paused === 1,
      tickMs: lobbyRow.tick_ms,
      startedAt: lobbyRow.started_at,
      viewer: {
        participantId: viewer?.id ?? null,
        teamId: viewer?.team_id ?? null,
        isHost: viewer?.is_host === 1,
        canAct: viewer !== null && viewerTeamId !== null,
      },
      participants,
      seats,
      chat,
      humanCount: rows.length,
      aiCount: Math.max(0, sessionTeams.length - rows.length),
    },
    occupants,
  };
}

function mapTeam(
  context: TeamContext,
  rules: ReturnType<typeof squadRules>,
  currentPlayer: SnapshotPlayer | null,
  occupant: SeatOccupant | undefined,
  viewerTeamId: string | null,
  poolPrices: number[],
): SnapshotTeam {
  const team = context.team;
  const profile = AI_PROFILES[profileIdForTeam(team)];
  const limits = teamBidLimits(context, rules, currentPlayer?.isOverseas === true, poolPrices);
  return {
    id: team.team_id,
    name: team.team_name,
    shortName: team.short_name,
    city: team.city ?? "",
    primary: team.primary_color,
    secondary: team.secondary_color,
    ink: team.ink_color,
    isHuman: team.is_human === 1,
    isViewer: viewerTeamId !== null && team.team_id === viewerTeamId,
    managerName: occupant?.displayName ?? null,
    managerOnline: occupant?.online ?? false,
    aiProfile: profile.id,
    aiProfileLabel: profile.label,
    aiProfileColor: profile.color,
    openingPurseLakh: team.opening_purse_lakh,
    purseLakh: team.purse_lakh,
    spentLakh: team.spent_lakh,
    preExistingValueLakh: team.pre_existing_value_lakh,
    maxBidLakh: limits.maxBidLakh,
    rtmRemaining: team.rtm_remaining,
    squadSize: context.squadSize,
    overseasCount: context.overseasCount,
    roleCounts: context.roleCounts,
  };
}

function rtmActionsFor(
  lot: LotRow,
  userTeam: SessionTeamRow | null,
  userContext: TeamContext | null,
  player: SnapshotPlayer,
  rules: ReturnType<typeof squadRules>,
  slabs: ReturnType<typeof incrementSlabs>,
  teamNames: Map<string, string>,
  poolPrices: number[],
): SnapshotLot["rtmActions"] {
  const empty: SnapshotLot["rtmActions"] = {
    canInvoke: false,
    canDeclineOriginal: false,
    canRaise: false,
    canHold: false,
    canMatch: false,
    canDeclineMatch: false,
    targetTeamId: null,
    minRaiseLakh: null,
    maxRaiseLakh: null,
    prompt: null,
  };
  if (!userTeam || !userContext || lot.status !== "rtm") return empty;

  const userId = userTeam.team_id;
  const userIsOriginal = lot.original_team_id === userId;
  const userIsLeader = lot.leader_team_id === userId;
  const limits = teamBidLimits(userContext, rules, player.isOverseas === true, poolPrices);
  const currentBid = lot.current_bid_lakh;
  const revised = lot.revised_price_lakh ?? lot.current_bid_lakh;
  const next = currentBid !== null ? nextValidBid(currentBid, lot.base_price_lakh, slabs) : null;
  const originalName = teamNames.get(lot.original_team_id ?? "") ?? "The original franchise";
  const leaderName = teamNames.get(lot.leader_team_id ?? "") ?? "the leading bidder";

  if (lot.rtm_status === "awaiting_original") {
    const canInvoke =
      userIsOriginal &&
      userTeam.rtm_remaining > 0 &&
      currentBid !== null &&
      limits.blockedReason === null &&
      limits.maxBidLakh >= currentBid;
    return {
      ...empty,
      canInvoke,
      canDeclineOriginal: userIsOriginal,
      targetTeamId: lot.original_team_id,
      prompt: userIsOriginal
        ? currentBid !== null
          ? `You can invoke Right to Match at ${formatLakh(currentBid)}. ${userTeam.rtm_remaining} card${userTeam.rtm_remaining === 1 ? "" : "s"} remaining.`
          : "You can invoke Right to Match."
        : `${originalName} is deciding whether to invoke Right to Match${currentBid !== null ? ` at ${formatLakh(currentBid)}` : ""}.`,
    };
  }

  if (lot.rtm_status === "awaiting_raise") {
    const canRaise =
      userIsLeader && next !== null && limits.blockedReason === null && limits.maxBidLakh >= next;
    return {
      ...empty,
      canRaise,
      canHold: userIsLeader,
      targetTeamId: lot.leader_team_id,
      minRaiseLakh: canRaise ? next : null,
      maxRaiseLakh: userIsLeader ? limits.maxBidLakh : null,
      prompt: userIsLeader
        ? `${originalName} invoked Right to Match at ${formatLakh(currentBid)}. You have one final raise; hold to leave the current offer unchanged.`
        : `${leaderName} has one final chance to raise before ${originalName} decides to match.`,
    };
  }

  if (lot.rtm_status === "awaiting_match") {
    const canMatch =
      userIsOriginal &&
      userTeam.rtm_remaining > 0 &&
      revised !== null &&
      limits.blockedReason === null &&
      limits.maxBidLakh >= revised;
    return {
      ...empty,
      canMatch,
      canDeclineMatch: userIsOriginal,
      targetTeamId: lot.original_team_id,
      prompt: userIsOriginal
        ? canMatch
          ? `Match ${formatLakh(revised)} to keep ${player.name}, or decline and let ${leaderName} take the player.`
          : `You cannot match ${formatLakh(revised)} under your current purse or squad limits. Decline to let ${leaderName} take the player.`
        : `${originalName} is deciding whether to match ${formatLakh(revised)}.`,
    };
  }

  return empty;
}

function userBidBlockedReason(args: {
  sessionStatus: AuctionSessionStatus;
  lot: LotRow | null;
  userTeam: SessionTeamRow | null;
  userContext: TeamContext | null;
  player: SnapshotPlayer | null;
  rules: ReturnType<typeof squadRules>;
  nextBid: number | null;
  poolPrices: number[];
}): string | null {
  const { sessionStatus, lot, userTeam, userContext, player, rules, nextBid, poolPrices } = args;
  if (sessionStatus !== "active") return "This auction is complete.";
  if (!lot) return "No lot is on the block.";
  if (!userTeam || !userContext) return "You are not managing a team in this auction.";
  if (lot.status === "rtm") return "Ordinary bidding has closed while Right to Match is resolved.";
  if (lot.status !== "live") return "This lot has already been settled.";
  if (!player) return "Player data is unavailable.";
  if (lot.leader_team_id === userTeam.team_id) return "You are already the highest bidder.";
  if (nextBid === null) return "The next valid bid could not be calculated.";
  const limits = teamBidLimits(userContext, rules, player.isOverseas === true, poolPrices);
  if (limits.blockedReason) return limits.blockedReason;
  if (limits.maxBidLakh < nextBid) {
    return `The next bid is ${formatLakh(nextBid)} but your maximum is ${formatLakh(limits.maxBidLakh)}.`;
  }
  return null;
}

export function buildSnapshot(
  db: Db,
  sessionId: string,
  referenceDate = nowIso(),
  viewerTeamId?: string | null,
): AuctionSnapshot {
  const session = loadSession(db, sessionId);
  const mode = resolveMode(session);
  const rulebookRow = loadRulebook(db, session.rulebook_id);
  const config = loadSessionConfig(session);
  const slabs = incrementSlabs(rulebookRow);
  const rules = squadRules(rulebookRow, config.minSquadExempt);
  const sessionTeams = loadSessionTeams(db, sessionId);
  const squads = loadSquads(db, sessionId);
  const contexts = buildTeamContexts(sessionTeams, squads);
  const poolPrices = pendingBasePrices(db, sessionId);
  const teamNames = teamNamesMap(db);
  const effectiveViewerId = viewerTeamId === undefined ? session.user_team_id : viewerTeamId;
  const { lobby, occupants } = buildLobbyState(db, sessionId, sessionTeams, effectiveViewerId);
  const userTeam = sessionTeams.find((team) => team.team_id === effectiveViewerId) ?? null;
  const userContext = userTeam ? (contexts.get(userTeam.team_id) ?? null) : null;

  const lot = loadCurrentLot(db, session);
  const player = lot
    ? loadPlayerDetail(db, lot.player_id, config.asOfSeason, isResolvedLot(lot), referenceDate)
    : null;
  if (lot && !player) {
    throw new Error(`Player ${lot.player_id} for lot ${lot.id} is missing from the player registry.`);
  }

  const nextBid =
    lot && lot.status === "live"
      ? nextValidBid(lot.current_bid_lakh, lot.base_price_lakh, slabs)
      : null;

  const actual = lot && isResolvedLot(lot) ? loadActualAuction(db, lot.player_id) : null;
  const bidRows = lot
    ? (db
        .prepare(
          `SELECT id, team_id, amount_lakh, kind, created_at
           FROM auction_bids
           WHERE lot_id = ?
           ORDER BY id DESC
           LIMIT 24`,
        )
        .all(lot.id) as Array<{
        id: number;
        team_id: string;
        amount_lakh: number;
        kind: string;
        created_at: string;
      }>)
    : [];
  const bids = bidRows.reverse().map((row) => ({
    id: row.id,
    teamId: row.team_id,
    amountLakh: row.amount_lakh,
    kind: row.kind,
    createdAt: row.created_at,
  }));
  let snapshotLot: SnapshotLot | null = null;
  if (lot && player) {
    snapshotLot = {
      id: lot.id,
      lotNumber: lot.lot_number,
      status:
        lot.status === "live" || lot.status === "rtm" || lot.status === "sold" || lot.status === "unsold"
          ? lot.status
          : "pending",
      setName: lot.set_name ?? "Auction lot",
      basePriceLakh: lot.base_price_lakh,
      basePriceVerified: lot.base_price_verified === 1,
      currentBidLakh: lot.current_bid_lakh,
      revisedPriceLakh: lot.revised_price_lakh,
      leaderTeamId: lot.leader_team_id,
      leaderTeamName: lot.leader_team_id ? (teamNames.get(lot.leader_team_id) ?? null) : null,
      originalTeamId: lot.original_team_id,
      originalTeamName: lot.original_team_id ? (teamNames.get(lot.original_team_id) ?? null) : null,
      rtmAvailable: lot.rtm_available === 1,
      rtmStatus: lot.rtm_status,
      finalPriceLakh: lot.final_price_lakh,
      winningTeamId: lot.winning_team_id,
      winningTeamName: lot.winning_team_id ? (teamNames.get(lot.winning_team_id) ?? null) : null,
      soldVia: lot.sold_via,
      nextBidLakh: nextBid,
      going: lot.quiet_ticks,
      player,
      actualAuction:
        actual && actual.winning_bid_lakh !== null
          ? {
              buyerTeamId: actual.buyer_team_id,
              buyerTeamName: actual.buyer_team_name,
              winningBidLakh: actual.winning_bid_lakh,
              basePriceLakh: actual.base_price_lakh,
            }
          : null,
      userBidBlockedReason: userBidBlockedReason({
        sessionStatus: asSessionStatus(session.status),
        lot,
        userTeam,
        userContext,
        player,
        rules,
        nextBid,
        poolPrices,
      }),
      bids,
      rtmActions: rtmActionsFor(lot, userTeam, userContext, player, rules, slabs, teamNames, poolPrices),
    };
  }

  const teamSnapshots = sessionTeams
    .map((team) =>
      mapTeam(
        contexts.get(team.team_id) as TeamContext,
        rules,
        player,
        occupants.get(team.team_id),
        effectiveViewerId,
        poolPrices,
      ),
    )
    .sort(
      (a, b) =>
        Number(b.isViewer) - Number(a.isViewer) ||
        Number(b.isHuman) - Number(a.isHuman) ||
        a.name.localeCompare(b.name),
    );

  const seasonRatings = new Map<string, number | null>();
  const ratingRows = db
    .prepare("SELECT player_id, ovr FROM player_rating_versions WHERE as_of_season = ?")
    .all(config.asOfSeason) as Array<{ player_id: string; ovr: number | null }>;
  for (const row of ratingRows) seasonRatings.set(row.player_id, row.ovr);

  const userSquad: SnapshotSquadPlayer[] = userTeam
    ? squads
        .filter((squad) => squad.team_id === userTeam.team_id)
        .map((squad) => ({
          playerId: squad.player_id,
          name: squad.full_name,
          role: squad.role,
          isOverseas: squad.is_overseas === null ? null : squad.is_overseas === 1,
          priceLakh: squad.price_lakh,
          acquiredVia: squad.acquired_via,
          rating: seasonRatings.get(squad.player_id) ?? null,
          retained: squad.acquired_via.startsWith("retained-"),
        }))
    : [];

  const eventRows = db
    .prepare(
      `SELECT id, type, message, payload_json, created_at
       FROM auction_events
       WHERE session_id = ?
       ORDER BY id DESC
       LIMIT 25`,
    )
    .all(sessionId) as EventRow[];

  const recentEvents: SnapshotEvent[] = eventRows
    .reverse()
    .map((row) => {
      const payload = parseJson<Record<string, unknown> | null>(row.payload_json, null);
      return {
        id: row.id,
        type: row.type,
        message: row.message,
        createdAt: row.created_at,
        lotNumber:
          payload && typeof payload.lotNumber === "number" ? payload.lotNumber : null,
        payload,
      };
    });
  const lastEvent = recentEvents.length > 0 ? recentEvents[recentEvents.length - 1] : null;

  const upcoming: SnapshotUpcomingLot[] = upcomingLots(db, sessionId, 24).map((row) => ({
    id: row.id,
    lotNumber: row.lot_number,
    setName: row.set_name ?? "Auction lot",
    playerId: row.player_id,
    playerName: row.full_name,
    role: row.role,
    basePriceLakh: row.base_price_lakh,
  }));

  const status = asSessionStatus(session.status);

  return {
    session: {
      id: session.id,
      name: session.name,
      mode: mode.id,
      season: session.season,
      status,
      userTeamId: effectiveViewerId ?? "",
      userName: userTeam?.team_name ?? null,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      completedAt: session.completed_at,
      totalLots: session.total_lots,
      completedLots: session.completed_lots,
      config,
      rulebook: snapshotRulebook(rulebookRow, mode, slabs),
    },
    currentLot: snapshotLot,
    teams: teamSnapshots,
    userTeam: teamSnapshots.find((team) => team.id === effectiveViewerId) ?? null,
    userSquad,
    recentEvents,
    lastEvent,
    upcomingLots: upcoming,
    finished: status === "completed",
    lotProgress:
      session.total_lots > 0 ? session.completed_lots / session.total_lots : 0,
    lobby,
  };
}

export type TeamSquadView = {
  teamId: string;
  teamName: string;
  shortName: string;
  players: SnapshotSquadPlayer[];
};

/** Full signed + retained roster for one franchise, loaded on demand. */
export function buildTeamSquad(db: Db, sessionId: string, teamId: string): TeamSquadView | null {
  const session = loadSession(db, sessionId);
  const config = loadSessionConfig(session);
  const team = loadSessionTeams(db, sessionId).find((row) => row.team_id === teamId);
  if (!team) return null;

  const ratings = new Map<string, number | null>();
  const ratingRows = db
    .prepare("SELECT player_id, ovr FROM player_rating_versions WHERE as_of_season = ?")
    .all(config.asOfSeason) as Array<{ player_id: string; ovr: number | null }>;
  for (const row of ratingRows) ratings.set(row.player_id, row.ovr);

  const players = loadSquads(db, sessionId)
    .filter((row) => row.team_id === teamId)
    .map((row) => ({
      playerId: row.player_id,
      name: row.full_name,
      role: row.role,
      isOverseas: row.is_overseas === null ? null : row.is_overseas === 1,
      priceLakh: row.price_lakh,
      acquiredVia: row.acquired_via,
      rating: ratings.get(row.player_id) ?? null,
      retained: row.acquired_via.startsWith("retained-"),
    }))
    .sort((a, b) => Number(b.retained) - Number(a.retained) || b.priceLakh - a.priceLakh);

  return {
    teamId,
    teamName: team.team_name,
    shortName: team.short_name,
    players,
  };
}
