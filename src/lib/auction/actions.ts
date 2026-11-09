import { getDb } from "@/db";
import { formatLakh } from "@/lib/money";
import { nextValidBid } from "@/lib/rules";
import { ageFromBirthDate, marketValueFor } from "@/lib/market-value";
import {
  aiBidInterest,
  aiRtmRaise,
  evaluateForTeam,
  shouldInvokeRtm,
  shouldMatchRtm,
  type AiPlayerFacts,
} from "./ai";
import { loadFranchiseLegacy } from "./legacy";
import {
  AuctionError,
  buildTeamContexts,
  incrementSlabs,
  insertEvent,
  isResolvedLot,
  isSeatAutopiloted,
  loadCurrentLot,
  loadPlayer,
  loadRating,
  loadRulebook,
  loadSession,
  loadSessionConfig,
  loadSessionTeams,
  loadSquads,
  nextPendingLot,
  nowIso,
  parseJson,
  pendingBasePrices,
  pendingLotCount,
  profileIdForTeam,
  resolveMode,
  setSessionCompleted,
  squadRules,
  teamBidLimits,
  teamNamesMap,
  touchSession,
  type Db,
  type LotRow,
  type PlayerRow,
  type RatingRow,
  type SessionRow,
  type SessionTeamRow,
  type TeamContext,
} from "./internal";
import { AI_PROFILES, type AuctionMode } from "./modes";
import type { AuctionAction } from "./types";
import type { IncrementSlab } from "@/lib/rules";

interface ActionContext {
  db: Db;
  session: SessionRow;
  mode: AuctionMode;
  rulebook: ReturnType<typeof loadRulebook>;
  slabs: IncrementSlab[];
  rules: ReturnType<typeof squadRules>;
  teams: SessionTeamRow[];
  contexts: Map<string, TeamContext>;
  teamNames: Map<string, string>;
  poolPrices: number[];
  seed: number;
  multiplayer: boolean;
  actorNames: Map<string, string>;
}

interface PlayerFacts {
  player: PlayerRow;
  rating: RatingRow | null;
  ai: AiPlayerFacts;
}

function loadActionContext(db: Db, sessionId: string): ActionContext {
  const session = loadSession(db, sessionId);
  const mode = resolveMode(session);
  const rulebook = loadRulebook(db, session.rulebook_id);
  const config = loadSessionConfig(session);
  const slabs = incrementSlabs(rulebook);
  const rules = squadRules(rulebook, config.minSquadExempt);
  const teams = loadSessionTeams(db, sessionId);
  const squads = loadSquads(db, sessionId);
  const contexts = buildTeamContexts(teams, squads);
  const poolPrices = pendingBasePrices(db, sessionId);
  const teamNames = teamNamesMap(db);
  const lobby = db
    .prepare("SELECT 1 FROM auction_lobbies WHERE session_id = ?")
    .get(sessionId) as { 1: number } | undefined;
  const actorNames = new Map<string, string>();
  if (lobby) {
    const participants = db
      .prepare("SELECT team_id, display_name FROM auction_participants WHERE session_id = ?")
      .all(sessionId) as Array<{ team_id: string; display_name: string }>;
    for (const participant of participants) actorNames.set(participant.team_id, participant.display_name);
  }
  return {
    db,
    session,
    mode,
    rulebook,
    slabs,
    rules,
    teams,
    contexts,
    teamNames,
    poolPrices,
    seed: config.seed,
    multiplayer: Boolean(lobby),
    actorNames,
  };
}

function loadFacts(
  db: Db,
  playerId: string,
  asOfSeason: number,
  previousTeamId?: string | null,
): PlayerFacts {
  const player = loadPlayer(db, playerId);
  const rating = loadRating(db, playerId, asOfSeason);
  const age = ageFromBirthDate(player.birth_date);
  const sample = parseJson<{ seasons?: number; lastSeason?: number | null }>(rating?.sample_json ?? null, {});
  const marketValue = marketValueFor({
    ovr: rating?.ovr ?? null,
    batting: rating?.batting ?? null,
    bowling: rating?.bowling ?? null,
    role: rating?.role ?? player.role,
    age,
    evidenceQuality: rating?.evidence_quality ?? null,
    isOverseas: player.is_overseas === 1,
    seasons: sample.seasons ?? null,
    lastSeason: sample.lastSeason ?? null,
    asOfSeason: rating?.as_of_season ?? asOfSeason,
  });
  return {
    player,
    rating,
    ai: {
      ovr: rating?.ovr ?? null,
      evidenceQuality: rating?.evidence_quality ?? null,
      role: rating?.role ?? player.role,
      capped: player.capped === null ? null : player.capped === 1,
      isOverseas: player.is_overseas === 1,
      age,
      marketValueLakh: marketValue.referenceLakh,
      legacyTeams: loadFranchiseLegacy(
        db,
        playerId,
        asOfSeason,
        previousTeamId ? [previousTeamId] : [],
      ),
    },
  };
}

function userTeamRow(context: ActionContext, actingTeamId?: string | null): SessionTeamRow {
  const target = actingTeamId ?? context.session.user_team_id;
  const team = context.teams.find((row) => row.team_id === target);
  if (!team) {
    throw new AuctionError("NO_USER_TEAM", "You are not managing a team in this auction.", 409);
  }
  return team;
}

function actorLabel(context: ActionContext, teamId: string): string {
  return context.actorNames.get(teamId) ?? teamContext(context, teamId).team.short_name;
}

function teamContext(context: ActionContext, teamId: string): TeamContext {
  const found = context.contexts.get(teamId);
  if (!found) throw new AuctionError("TEAM_NOT_FOUND", "That franchise is not in this session.", 500);
  return found;
}

function teamShort(context: ActionContext, teamId: string): string {
  return teamContext(context, teamId).team.short_name;
}

function touch(context: ActionContext, at: string): void {
  touchSession(context.db, context.session.id, at);
}

function recordBid(args: {
  context: ActionContext;
  lot: LotRow;
  player: PlayerRow;
  teamId: string;
  amountLakh: number;
  kind: "ai" | "human";
}): void {
  const { context, lot, player, teamId, amountLakh, kind } = args;
  const at = nowIso();
  context.db
    .prepare(
      `UPDATE auction_lots
       SET current_bid_lakh = ?, leader_team_id = ?, quiet_ticks = 0, bid_count = bid_count + 1
       WHERE id = ?`,
    )
    .run(amountLakh, teamId, lot.id);
  context.db
    .prepare(
      `INSERT INTO auction_bids (session_id, lot_id, team_id, amount_lakh, kind, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(context.session.id, lot.id, teamId, amountLakh, kind, at);
  const short = teamShort(context, teamId);
  insertEvent(
    context.db,
    context.session.id,
    "bid",
    kind === "human"
      ? context.multiplayer
        ? `${actorLabel(context, teamId)} bid ${formatLakh(amountLakh)} for ${player.full_name}.`
        : `You bid ${formatLakh(amountLakh)} for ${player.full_name}.`
      : `${short} bid ${formatLakh(amountLakh)} for ${player.full_name}.`,
    {
      lotId: lot.id,
      payload: {
        lotNumber: lot.lot_number,
        playerId: player.id,
        teamId,
        amountLakh,
        kind,
      },
      createdAt: at,
    },
  );
  touch(context, at);
}

function recordFinalRaise(args: {
  context: ActionContext;
  lot: LotRow;
  player: PlayerRow;
  teamId: string;
  amountLakh: number;
  byUser: boolean;
}): void {
  const { context, lot, player, teamId, amountLakh, byUser } = args;
  const at = nowIso();
  context.db
    .prepare(
      `INSERT INTO auction_bids (session_id, lot_id, team_id, amount_lakh, kind, created_at)
       VALUES (?, ?, ?, ?, 'rtm-raise', ?)`,
    )
    .run(context.session.id, lot.id, teamId, amountLakh, at);
  insertEvent(
    context.db,
    context.session.id,
    "rtm_raise",
    byUser
      ? context.multiplayer
        ? `RTM RAISE · ${actorLabel(context, teamId)} lift the final offer to ${formatLakh(amountLakh)}.`
        : `RTM RAISE · You lift the final offer to ${formatLakh(amountLakh)}.`
      : `RTM RAISE · ${teamShort(context, teamId)} lift the final offer to ${formatLakh(amountLakh)}.`,
    {
      lotId: lot.id,
      payload: {
        lotNumber: lot.lot_number,
        playerId: player.id,
        teamId,
        revisedPriceLakh: amountLakh,
        raised: true,
      },
      createdAt: at,
    },
  );
  touch(context, at);
}

function recordGoing(context: ActionContext, lot: LotRow, player: PlayerRow, stage: number): void {
  const at = nowIso();
  const price = lot.current_bid_lakh ?? lot.base_price_lakh;
  insertEvent(
    context.db,
    context.session.id,
    stage === 1 ? "going_once" : "going_twice",
    stage === 1
      ? `Going once at ${formatLakh(price)} for ${player.full_name}.`
      : `Going twice at ${formatLakh(price)} for ${player.full_name}.`,
    {
      lotId: lot.id,
      payload: { lotNumber: lot.lot_number, playerId: player.id, amountLakh: price, stage },
      createdAt: at,
    },
  );
  touch(context, at);
}

function originalCanMatch(
  context: ActionContext,
  lot: LotRow,
  facts: PlayerFacts,
  targetPrice: number,
): { original: SessionTeamRow | null; canMatch: boolean; reason: string | null } {
  if (!lot.original_team_id) return { original: null, canMatch: false, reason: "No eligible original team." };
  const original = context.teams.find((team) => team.team_id === lot.original_team_id) ?? null;
  if (!original) return { original: null, canMatch: false, reason: "Original team is not in this session." };
  if (original.rtm_remaining <= 0) {
    return { original, canMatch: false, reason: "No RTM cards remain." };
  }
  const evalResult = teamBidLimits(teamContext(context, original.team_id), context.rules, facts.ai.isOverseas, context.poolPrices);
  if (evalResult.blockedReason) return { original, canMatch: false, reason: evalResult.blockedReason };
  if (evalResult.maxBidLakh < targetPrice) {
    return {
      original,
      canMatch: false,
      reason: `${original.short_name} can bid at most ${formatLakh(evalResult.maxBidLakh)}.`,
    };
  }
  return { original, canMatch: true, reason: null };
}

function completeIfReady(context: ActionContext): boolean {
  const { db, session } = context;
  if (session.status !== "active") return false;
  if (pendingLotCount(db, session.id) > 0) return false;
  const current = loadCurrentLot(db, session);
  if (current && !isResolvedLot(current)) return false;
  const at = nowIso();
  setSessionCompleted(db, session.id, at);
  const userTeamId = session.user_team_id;
  const userTeam = context.teams.find((team) => team.team_id === userTeamId);
  const squadRow = userTeamId
    ? (db
        .prepare("SELECT COUNT(*) AS count FROM session_squads WHERE session_id = ? AND team_id = ?")
        .get(session.id, userTeamId) as { count: number })
    : { count: 0 };
  const squadShortfall = Math.max(0, context.rulebook.squad_min - squadRow.count);
  const summary =
    squadShortfall > 0
      ? `Auction complete. ${userTeam?.short_name ?? "Your team"} finished with ${squadRow.count} players — ${squadShortfall} short of the ${context.rulebook.squad_min}-player minimum.`
      : `Auction complete. ${userTeam?.short_name ?? "Your team"} finished with ${squadRow.count} players.`;
  insertEvent(db, session.id, "auction_complete", summary, {
    payload: {
      squadSize: squadRow.count,
      squadMin: context.rulebook.squad_min,
      squadShortfall,
      completedLots: loadSession(db, session.id).completed_lots,
    },
    createdAt: at,
  });
  touch(context, at);
  return true;
}

function openLot(context: ActionContext, lot: LotRow): void {
  const at = nowIso();
  context.db
    .prepare("UPDATE auction_lots SET status = 'live', opened_at = ?, quiet_ticks = 0 WHERE id = ?")
    .run(at, lot.id);
  context.db
    .prepare("UPDATE auction_sessions SET current_lot_id = ?, updated_at = ? WHERE id = ?")
    .run(lot.id, at, context.session.id);
  const player = loadPlayer(context.db, lot.player_id);
  insertEvent(
    context.db,
    context.session.id,
    "lot_open",
    `Lot ${lot.lot_number} · ${lot.set_name ?? "Auction lot"} — ${player.full_name} is on the block at ${formatLakh(lot.base_price_lakh)}.`,
    {
      lotId: lot.id,
      payload: {
        lotNumber: lot.lot_number,
        playerId: player.id,
        basePriceLakh: lot.base_price_lakh,
        setName: lot.set_name,
      },
      createdAt: at,
    },
  );
  touch(context, at);
}

function openNextLot(context: ActionContext, current: LotRow): void {
  const next = nextPendingLot(context.db, context.session.id, current.lot_number);
  if (!next) {
    completeIfReady(context);
    return;
  }
  openLot(context, next);
}

function finalizeSale(args: {
  context: ActionContext;
  lot: LotRow;
  facts: PlayerFacts;
  winnerTeamId: string;
  priceLakh: number;
  via: "open" | "rtm-match" | "rtm-declined";
  rtmStatus: string | null;
}): void {
  const { context, lot, facts, winnerTeamId, priceLakh, via, rtmStatus } = args;
  const winnerContext = teamContext(context, winnerTeamId);
  const limits = teamBidLimits(winnerContext, context.rules, facts.ai.isOverseas, context.poolPrices);
  if (limits.blockedReason || limits.maxBidLakh < priceLakh) {
    throw new AuctionError(
      "BID_LIMIT_BREACH",
      `The winning price of ${formatLakh(priceLakh)} breaches ${winnerContext.team.short_name}'s purse or squad limits.`,
      409,
    );
  }
  const at = nowIso();
  context.db
    .prepare(
      `UPDATE session_teams
       SET purse_lakh = purse_lakh - ?, spent_lakh = spent_lakh + ?
       WHERE session_id = ? AND team_id = ?`,
    )
    .run(priceLakh, priceLakh, context.session.id, winnerTeamId);
  context.db
    .prepare(
      `INSERT INTO session_squads (
         session_id, team_id, player_id, price_lakh, price_verified, acquired_via, created_at
       ) VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      context.session.id,
      winnerTeamId,
      facts.player.id,
      priceLakh,
      via === "rtm-match" ? "rtm" : "auction",
      at,
    );
  context.db
    .prepare(
      `INSERT INTO auction_transactions (
         session_id, team_id, player_id, lot_id, type, amount_lakh, created_at, meta_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      context.session.id,
      winnerTeamId,
      facts.player.id,
      lot.id,
      via === "rtm-match" ? "rtm-match" : "auction-sale",
      priceLakh,
      at,
      JSON.stringify({ via, rtmStatus, lotNumber: lot.lot_number }),
    );
  if (via === "rtm-match") {
    context.db
      .prepare(
        "UPDATE session_teams SET rtm_remaining = rtm_remaining - 1 WHERE session_id = ? AND team_id = ?",
      )
      .run(context.session.id, winnerTeamId);
  }
  context.db
    .prepare(
      `UPDATE auction_lots
       SET status = 'sold', winning_team_id = ?, final_price_lakh = ?, sold_via = ?,
           rtm_status = ?, revised_price_lakh = ?, quiet_ticks = 0, resolved_at = ?
       WHERE id = ?`,
    )
    .run(winnerTeamId, priceLakh, via, rtmStatus, priceLakh, at, lot.id);
  context.db
    .prepare(
      "UPDATE auction_sessions SET completed_lots = completed_lots + 1, updated_at = ? WHERE id = ?",
    )
    .run(at, context.session.id);

  const winner = teamContext(context, winnerTeamId).team;
  const message =
    via === "rtm-match"
      ? `SOLD via RTM · ${facts.player.full_name} stays with ${winner.short_name} at ${formatLakh(priceLakh)}.`
      : via === "rtm-declined"
        ? `SOLD after RTM · ${facts.player.full_name} joins ${winner.short_name} at ${formatLakh(priceLakh)}.`
        : `SOLD · ${facts.player.full_name} to ${winner.short_name} for ${formatLakh(priceLakh)}.`;
  insertEvent(context.db, context.session.id, "sold", message, {
    lotId: lot.id,
    payload: {
      lotNumber: lot.lot_number,
      playerId: facts.player.id,
      teamId: winnerTeamId,
      amountLakh: priceLakh,
      via,
      rtmStatus,
    },
    createdAt: at,
  });
  touch(context, at);
  completeIfReady(context);
}

function finalizeUnsold(context: ActionContext, lot: LotRow, facts: PlayerFacts): void {
  const at = nowIso();
  context.db
    .prepare(
      "UPDATE auction_lots SET status = 'unsold', resolved_at = ?, quiet_ticks = 0 WHERE id = ?",
    )
    .run(at, lot.id);
  context.db
    .prepare(
      "UPDATE auction_sessions SET completed_lots = completed_lots + 1, updated_at = ? WHERE id = ?",
    )
    .run(at, context.session.id);
  insertEvent(
    context.db,
    context.session.id,
    "unsold",
    `UNSOLD · ${facts.player.full_name} attracted no valid bid.`,
    {
      lotId: lot.id,
      payload: { lotNumber: lot.lot_number, playerId: facts.player.id },
      createdAt: at,
    },
  );
  touch(context, at);
  completeIfReady(context);
}

function enterRtmWindow(
  context: ActionContext,
  lot: LotRow,
  facts: PlayerFacts,
  initial: "awaiting_original" | "awaiting_raise",
): void {
  const at = nowIso();
  const currentBid = lot.current_bid_lakh ?? lot.base_price_lakh;
  context.db
    .prepare(
      `UPDATE auction_lots
       SET status = 'rtm', rtm_status = ?, revised_price_lakh = ?, quiet_ticks = 0
       WHERE id = ?`,
    )
    .run(initial, currentBid, lot.id);
  if (initial === "awaiting_original") {
    const original = lot.original_team_id ? teamShort(context, lot.original_team_id) : "The original team";
    insertEvent(
      context.db,
      context.session.id,
      "rtm_window",
      `RTM WINDOW · ${original} may match ${formatLakh(currentBid)} for ${facts.player.full_name}.`,
      {
        lotId: lot.id,
        payload: {
          lotNumber: lot.lot_number,
          playerId: facts.player.id,
          originalTeamId: lot.original_team_id,
          leaderTeamId: lot.leader_team_id,
          currentBidLakh: currentBid,
        },
        createdAt: at,
      },
    );
  }
  touch(context, at);
}

function closeOrdinaryBidding(context: ActionContext, lot: LotRow, facts: PlayerFacts): void {
  if (!lot.leader_team_id || lot.current_bid_lakh === null) {
    finalizeUnsold(context, lot, facts);
    return;
  }
  const leaderId = lot.leader_team_id;
  const currentBid = lot.current_bid_lakh;
  const rtmEligible =
    context.mode.rtmEnabled &&
    lot.rtm_available === 1 &&
    lot.original_team_id !== null &&
    lot.original_team_id !== leaderId;
  if (rtmEligible) {
    const check = originalCanMatch(context, lot, facts, currentBid);
    if (check.canMatch && check.original) {
      enterRtmWindow(context, lot, facts, "awaiting_original");
      return;
    }
  }
  finalizeSale({
    context,
    lot,
    facts,
    winnerTeamId: leaderId,
    priceLakh: currentBid,
    via: "open",
    rtmStatus: null,
  });
}

function aiBidStep(context: ActionContext, lot: LotRow, facts: PlayerFacts): void {
  const next = nextValidBid(lot.current_bid_lakh, lot.base_price_lakh, context.slabs);
  let best: { teamId: string; interest: number } | null = null;
  for (const [teamId, candidate] of context.contexts) {
    if (
      candidate.team.is_human === 1 &&
      !isSeatAutopiloted(context.db, context.session.id, teamId)
    ) {
      continue;
    }
    if (teamId === lot.leader_team_id) continue;
    const profile = AI_PROFILES[profileIdForTeam(candidate.team)];
    const evaluation = evaluateForTeam({
      player: facts.ai,
      basePriceLakh: lot.base_price_lakh,
      context: candidate,
      rules: context.rules,
      profile,
      seed: context.seed,
      lotNumber: lot.lot_number,
      poolBasePricesLakh: context.poolPrices,
    });
    if (evaluation.limits.blockedReason) continue;
    if (evaluation.limits.maxBidLakh < next) continue;
    if (evaluation.valuationLakh < next) continue;
    const interest = aiBidInterest({
      seed: context.seed,
      lotNumber: lot.lot_number,
      teamId,
      valuationLakh: evaluation.valuationLakh,
      nextBidLakh: next,
      quietTicks: lot.quiet_ticks,
      bidCount: lot.bid_count,
      legacyStrength: evaluation.legacyStrength,
    });
    if (interest <= 0) continue;
    if (!best || interest > best.interest) best = { teamId, interest };
  }

  if (best) {
    recordBid({
      context,
      lot,
      player: facts.player,
      teamId: best.teamId,
      amountLakh: next,
      kind: "ai",
    });
    return;
  }

  const quiet = lot.quiet_ticks + 1;
  context.db
    .prepare("UPDATE auction_lots SET quiet_ticks = ? WHERE id = ?")
    .run(quiet, lot.id);
  if (quiet === 1 || quiet === 2) {
    recordGoing(context, { ...lot, current_bid_lakh: lot.current_bid_lakh }, facts.player, quiet);
  } else {
    closeOrdinaryBidding(context, lot, facts);
  }
}

function aiRtmStep(context: ActionContext, lot: LotRow, facts: PlayerFacts): void {
  const currentBid = lot.current_bid_lakh;
  if (currentBid === null || !lot.original_team_id || !lot.leader_team_id) return;

  if (lot.rtm_status === "awaiting_original") {
    const original = context.teams.find((team) => team.team_id === lot.original_team_id);
    if (!original) return;
    if (
      original.is_human === 1 &&
      !isSeatAutopiloted(context.db, context.session.id, original.team_id)
    ) {
      return;
    }
    const originalCtx = teamContext(context, original.team_id);
    const profile = AI_PROFILES[profileIdForTeam(original)];
    const evaluation = evaluateForTeam({
      player: facts.ai,
      basePriceLakh: lot.base_price_lakh,
      context: originalCtx,
      rules: context.rules,
      profile,
      seed: context.seed,
      lotNumber: lot.lot_number,
      poolBasePricesLakh: context.poolPrices,
    });
    const canAfford = evaluation.limits.blockedReason === null && evaluation.limits.maxBidLakh >= currentBid;
    const invoke =
      original.rtm_remaining > 0 &&
      canAfford &&
      shouldInvokeRtm({
        valuationLakh: evaluation.valuationLakh,
        currentBidLakh: currentBid,
        profile,
        seed: context.seed,
        lotNumber: lot.lot_number,
        teamId: original.team_id,
        legacyStrength: evaluation.legacyStrength,
      });
    if (invoke) {
      const at = nowIso();
      context.db
        .prepare("UPDATE auction_lots SET rtm_status = 'awaiting_raise' WHERE id = ?")
        .run(lot.id);
      insertEvent(
        context.db,
        context.session.id,
        "rtm_invoked",
        `RTM INVOKED · ${original.short_name} challenge the ${formatLakh(currentBid)} bid for ${facts.player.full_name}. ${teamShort(context, lot.leader_team_id)} get one final raise.`,
        {
          lotId: lot.id,
          payload: {
            lotNumber: lot.lot_number,
            playerId: facts.player.id,
            originalTeamId: original.team_id,
            leaderTeamId: lot.leader_team_id,
            currentBidLakh: currentBid,
          },
          createdAt: at,
        },
      );
      touch(context, at);
      return;
    }
    const leaderId = lot.leader_team_id;
    const at = nowIso();
    insertEvent(
      context.db,
      context.session.id,
      "rtm_declined",
      `RTM DECLINED · ${original.short_name} pass on matching ${facts.player.full_name}.`,
      {
        lotId: lot.id,
        payload: {
          lotNumber: lot.lot_number,
          playerId: facts.player.id,
          originalTeamId: original.team_id,
          rtmStatus: "declined_original",
        },
        createdAt: at,
      },
    );
    finalizeSale({
      context,
      lot,
      facts,
      winnerTeamId: leaderId,
      priceLakh: currentBid,
      via: "rtm-declined",
      rtmStatus: "declined_original",
    });
    return;
  }

  if (lot.rtm_status === "awaiting_raise") {
    const leader = context.teams.find((team) => team.team_id === lot.leader_team_id);
    if (!leader) return;
    if (
      leader.is_human === 1 &&
      !isSeatAutopiloted(context.db, context.session.id, leader.team_id)
    ) {
      return;
    }
    const leaderCtx = teamContext(context, leader.team_id);
    const profile = AI_PROFILES[profileIdForTeam(leader)];
    const evaluation = evaluateForTeam({
      player: facts.ai,
      basePriceLakh: lot.base_price_lakh,
      context: leaderCtx,
      rules: context.rules,
      profile,
      seed: context.seed,
      lotNumber: lot.lot_number,
      poolBasePricesLakh: context.poolPrices,
    });
    const next = nextValidBid(currentBid, lot.base_price_lakh, context.slabs);
    const raise =
      evaluation.limits.blockedReason === null
        ? aiRtmRaise({
            currentBidLakh: currentBid,
            nextBidLakh: next,
            valuationLakh: evaluation.valuationLakh,
            maxBidLakh: evaluation.limits.maxBidLakh,
            incrementLakh: Math.max(5, next - currentBid),
            profile,
            seed: context.seed,
            lotNumber: lot.lot_number,
            teamId: leader.team_id,
            legacyStrength: evaluation.legacyStrength,
          })
        : null;
    const revised = raise ?? currentBid;
    const at = nowIso();
    context.db
      .prepare(
        "UPDATE auction_lots SET rtm_status = 'awaiting_match', revised_price_lakh = ? WHERE id = ?",
      )
      .run(revised, lot.id);
    if (raise === null) {
      insertEvent(
        context.db,
        context.session.id,
        "rtm_hold",
        `RTM HOLD · ${leader.short_name} keep the offer at ${formatLakh(currentBid)}.`,
        {
          lotId: lot.id,
          payload: {
            lotNumber: lot.lot_number,
            playerId: facts.player.id,
            leaderTeamId: leader.team_id,
            revisedPriceLakh: revised,
            raised: false,
          },
          createdAt: at,
        },
      );
    } else {
      recordFinalRaise({
        context,
        lot,
        player: facts.player,
        teamId: leader.team_id,
        amountLakh: raise,
        byUser: false,
      });
    }
    const affordability = originalCanMatch(context, lot, facts, revised);
    if (!affordability.canMatch && affordability.original) {
      insertEvent(
        context.db,
        context.session.id,
        "rtm_match_blocked",
        `${affordability.original.short_name} cannot match ${formatLakh(revised)}. ${teamShort(context, lot.leader_team_id)} will take the player.`,
        {
          lotId: lot.id,
          payload: {
            lotNumber: lot.lot_number,
            playerId: facts.player.id,
            originalTeamId: affordability.original.team_id,
            revisedPriceLakh: revised,
            reason: affordability.reason,
          },
          createdAt: at,
        },
      );
      finalizeSale({
        context,
        lot,
        facts,
        winnerTeamId: lot.leader_team_id,
        priceLakh: revised,
        via: "rtm-declined",
        rtmStatus: "declined_match",
      });
      return;
    }
    touch(context, at);
    return;
  }

  if (lot.rtm_status === "awaiting_match") {
    const original = context.teams.find((team) => team.team_id === lot.original_team_id);
    if (!original) return;
    if (
      original.is_human === 1 &&
      !isSeatAutopiloted(context.db, context.session.id, original.team_id)
    ) {
      return;
    }
    const revised = lot.revised_price_lakh ?? currentBid;
    const originalCtx = teamContext(context, original.team_id);
    const profile = AI_PROFILES[profileIdForTeam(original)];
    const evaluation = evaluateForTeam({
      player: facts.ai,
      basePriceLakh: lot.base_price_lakh,
      context: originalCtx,
      rules: context.rules,
      profile,
      seed: context.seed,
      lotNumber: lot.lot_number,
      poolBasePricesLakh: context.poolPrices,
    });
    const match =
      original.rtm_remaining > 0 &&
      evaluation.limits.blockedReason === null &&
      shouldMatchRtm({
        valuationLakh: evaluation.valuationLakh,
        revisedPriceLakh: revised,
        maxBidLakh: evaluation.limits.maxBidLakh,
        profile,
        legacyStrength: evaluation.legacyStrength,
      });
    const at = nowIso();
    if (match) {
      insertEvent(
        context.db,
        context.session.id,
        "rtm_matched",
        `RTM MATCHED · ${original.short_name} match ${formatLakh(revised)} for ${facts.player.full_name}.`,
        {
          lotId: lot.id,
          payload: {
            lotNumber: lot.lot_number,
            playerId: facts.player.id,
            originalTeamId: original.team_id,
            revisedPriceLakh: revised,
          },
          createdAt: at,
        },
      );
      finalizeSale({
        context,
        lot,
        facts,
        winnerTeamId: original.team_id,
        priceLakh: revised,
        via: "rtm-match",
        rtmStatus: "matched",
      });
    } else {
      insertEvent(
        context.db,
        context.session.id,
        "rtm_declined_match",
        `RTM DECLINED · ${original.short_name} decline to match ${formatLakh(revised)}. ${teamShort(context, lot.leader_team_id)} take the player.`,
        {
          lotId: lot.id,
          payload: {
            lotNumber: lot.lot_number,
            playerId: facts.player.id,
            originalTeamId: original.team_id,
            revisedPriceLakh: revised,
          },
          createdAt: at,
        },
      );
      finalizeSale({
        context,
        lot,
        facts,
        winnerTeamId: lot.leader_team_id,
        priceLakh: revised,
        via: "rtm-declined",
        rtmStatus: "declined_match",
      });
    }
    return;
  }
}

function tick(context: ActionContext): void {
  const { db, session } = context;
  if (session.status !== "active") return;
  const lot = loadCurrentLot(db, session);
  if (!lot) {
    const first = nextPendingLot(db, session.id, 0);
    if (first) openLot(context, first);
    else completeIfReady(context);
    return;
  }
  if (lot.status === "sold" || lot.status === "unsold") {
    openNextLot(context, lot);
    return;
  }
  if (lot.status === "pending") {
    openLot(context, lot);
    return;
  }
  const facts = loadFacts(
    db,
    lot.player_id,
    loadSessionConfig(session).asOfSeason,
    lot.original_team_id,
  );
  if (lot.status === "live") {
    aiBidStep(context, lot, facts);
    return;
  }
  if (lot.status === "rtm") {
    aiRtmStep(context, lot, facts);
    touch(context, nowIso());
  }
}

function submitHumanBid(
  context: ActionContext,
  lot: LotRow,
  facts: PlayerFacts,
  amountLakh: number,
  actingTeamId?: string | null,
): void {
  if (lot.status !== "live") {
    throw new AuctionError("LOT_NOT_LIVE", "Bidding is not open on this lot.", 409);
  }
  const user = userTeamRow(context, actingTeamId);
  if (lot.leader_team_id === user.team_id) {
    throw new AuctionError("ALREADY_LEADING", "You are already the highest bidder.", 409);
  }
  if (!Number.isInteger(amountLakh)) {
    throw new AuctionError("INVALID_AMOUNT", "Bids must be whole lakh amounts.", 400);
  }
  const next = nextValidBid(lot.current_bid_lakh, lot.base_price_lakh, context.slabs);
  if (amountLakh !== next) {
    throw new AuctionError(
      "INVALID_INCREMENT",
      `The next valid bid is ${formatLakh(next)}.`,
      409,
    );
  }
  const userContext = teamContext(context, user.team_id);
  const limits = teamBidLimits(userContext, context.rules, facts.ai.isOverseas, context.poolPrices);
  if (limits.blockedReason) throw new AuctionError("BID_BLOCKED", limits.blockedReason, 409);
  if (limits.maxBidLakh < amountLakh) {
    throw new AuctionError(
      "PURSE_LIMIT",
      `Your maximum bid is ${formatLakh(limits.maxBidLakh)}. The next bid is ${formatLakh(amountLakh)}.`,
      409,
    );
  }
  recordBid({
    context,
    lot,
    player: facts.player,
    teamId: user.team_id,
    amountLakh,
    kind: "human",
  });
}

function rtmWindowOpen(lot: LotRow): boolean {
  return lot.status === "rtm";
}

function submitRtmAction(
  context: ActionContext,
  lot: LotRow,
  facts: PlayerFacts,
  action: AuctionAction,
  actingTeamId?: string | null,
): void {
  if (lot.status !== "rtm" || !rtmWindowOpen(lot)) {
    throw new AuctionError("RTM_NOT_OPEN", "Right to Match is not active on this lot.", 409);
  }
  const user = userTeamRow(context, actingTeamId);
  const currentBid = lot.current_bid_lakh;
  if (currentBid === null) {
    throw new AuctionError("RTM_PRICE_MISSING", "The RTM price is not available.", 409);
  }
  const isOriginal = lot.original_team_id === user.team_id;
  const isLeader = lot.leader_team_id === user.team_id;

  if (action.type === "rtm_invoke") {
    if (lot.rtm_status !== "awaiting_original" || !isOriginal) {
      throw new AuctionError("RTM_NOT_YOUR_DECISION", "It is not your turn to invoke RTM.", 409);
    }
    if (user.rtm_remaining <= 0) {
      throw new AuctionError("NO_RTM_CARDS", "You have no RTM cards remaining.", 409);
    }
    const check = originalCanMatch(context, lot, facts, currentBid);
    if (!check.canMatch) {
      throw new AuctionError("RTM_NOT_AFFORDABLE", check.reason ?? "You cannot match the current bid.", 409);
    }
    const at = nowIso();
    context.db
      .prepare("UPDATE auction_lots SET rtm_status = 'awaiting_raise' WHERE id = ?")
      .run(lot.id);
    insertEvent(
      context.db,
      context.session.id,
      "rtm_invoked",
      context.multiplayer
        ? `RTM INVOKED · ${actorLabel(context, user.team_id)} challenge the ${formatLakh(currentBid)} bid for ${facts.player.full_name}. ${teamShort(context, lot.leader_team_id!)} get one final raise.`
        : `RTM INVOKED · You challenge the ${formatLakh(currentBid)} bid for ${facts.player.full_name}. ${teamShort(context, lot.leader_team_id!)} get one final raise.`,
      {
        lotId: lot.id,
        payload: {
          lotNumber: lot.lot_number,
          playerId: facts.player.id,
          originalTeamId: user.team_id,
          currentBidLakh: currentBid,
        },
        createdAt: at,
      },
    );
    touch(context, at);
    return;
  }

  if (action.type === "rtm_decline") {
    if (lot.rtm_status !== "awaiting_original" || !isOriginal) {
      throw new AuctionError("RTM_NOT_YOUR_DECISION", "It is not your turn to decline RTM.", 409);
    }
    const at = nowIso();
    insertEvent(
      context.db,
      context.session.id,
      "rtm_declined",
      context.multiplayer
        ? `RTM DECLINED · ${actorLabel(context, user.team_id)} pass on matching ${facts.player.full_name}.`
        : `RTM DECLINED · You pass on matching ${facts.player.full_name}.`,
      {
        lotId: lot.id,
        payload: {
          lotNumber: lot.lot_number,
          playerId: facts.player.id,
          originalTeamId: user.team_id,
          rtmStatus: "declined_original",
        },
        createdAt: at,
      },
    );
    finalizeSale({
      context,
      lot,
      facts,
      winnerTeamId: lot.leader_team_id!,
      priceLakh: currentBid,
      via: "rtm-declined",
      rtmStatus: "declined_original",
    });
    return;
  }

  if (action.type === "rtm_raise" || action.type === "rtm_hold") {
    if (lot.rtm_status !== "awaiting_raise" || !isLeader) {
      throw new AuctionError("RTM_NOT_YOUR_DECISION", "It is not your turn to raise or hold.", 409);
    }
    const next = nextValidBid(currentBid, lot.base_price_lakh, context.slabs);
    let revised = currentBid;
    if (action.type === "rtm_raise") {
      const requested = action.amountLakh ?? next;
      if (!Number.isInteger(requested) || requested % 5 !== 0) {
        throw new AuctionError("INVALID_AMOUNT", "The final raise must be a whole multiple of ₹5 lakh.", 400);
      }
      if (requested < next) {
        throw new AuctionError("INVALID_RAISE", `The minimum raise is ${formatLakh(next)}.`, 409);
      }
      const limits = teamBidLimits(teamContext(context, user.team_id), context.rules, facts.ai.isOverseas, context.poolPrices);
      if (limits.blockedReason) throw new AuctionError("BID_BLOCKED", limits.blockedReason, 409);
      if (requested > limits.maxBidLakh) {
        throw new AuctionError(
          "PURSE_LIMIT",
          `Your maximum final offer is ${formatLakh(limits.maxBidLakh)}.`,
          409,
        );
      }
      revised = requested;
    }
    const at = nowIso();
    context.db
      .prepare(
        "UPDATE auction_lots SET rtm_status = 'awaiting_match', revised_price_lakh = ? WHERE id = ?",
      )
      .run(revised, lot.id);
    if (action.type === "rtm_raise") {
      recordFinalRaise({
        context,
        lot,
        player: facts.player,
        teamId: user.team_id,
        amountLakh: revised,
        byUser: true,
      });
    } else {
      insertEvent(
        context.db,
        context.session.id,
        "rtm_hold",
        context.multiplayer
          ? `RTM HOLD · ${actorLabel(context, user.team_id)} hold the offer at ${formatLakh(currentBid)}.`
          : `RTM HOLD · You hold the offer at ${formatLakh(currentBid)}.`,
        {
          lotId: lot.id,
          payload: {
            lotNumber: lot.lot_number,
            playerId: facts.player.id,
            revisedPriceLakh: revised,
            raised: false,
          },
          createdAt: at,
        },
      );
    }
    const affordability = originalCanMatch(context, lot, facts, revised);
    if (!affordability.canMatch && affordability.original) {
      insertEvent(
        context.db,
        context.session.id,
        "rtm_match_blocked",
        `${affordability.original.short_name} cannot match ${formatLakh(revised)}. You will take the player at the revised price.`,
        {
          lotId: lot.id,
          payload: {
            lotNumber: lot.lot_number,
            playerId: facts.player.id,
            revisedPriceLakh: revised,
            reason: affordability.reason,
          },
          createdAt: at,
        },
      );
      finalizeSale({
        context,
        lot,
        facts,
        winnerTeamId: lot.leader_team_id!,
        priceLakh: revised,
        via: "rtm-declined",
        rtmStatus: "declined_match",
      });
      return;
    }
    touch(context, at);
    return;
  }

  if (action.type === "rtm_match") {
    if (lot.rtm_status !== "awaiting_match" || !isOriginal) {
      throw new AuctionError("RTM_NOT_YOUR_DECISION", "It is not your turn to match.", 409);
    }
    if (user.rtm_remaining <= 0) {
      throw new AuctionError("NO_RTM_CARDS", "You have no RTM cards remaining.", 409);
    }
    const revised = lot.revised_price_lakh ?? currentBid;
    const check = originalCanMatch(context, lot, facts, revised);
    if (!check.canMatch) {
      throw new AuctionError("RTM_NOT_AFFORDABLE", check.reason ?? "You cannot match this price.", 409);
    }
    insertEvent(
      context.db,
      context.session.id,
      "rtm_matched",
      context.multiplayer
        ? `RTM MATCHED · ${actorLabel(context, user.team_id)} match ${formatLakh(revised)} for ${facts.player.full_name}.`
        : `RTM MATCHED · You match ${formatLakh(revised)} for ${facts.player.full_name}.`,
      {
        lotId: lot.id,
        payload: {
          lotNumber: lot.lot_number,
          playerId: facts.player.id,
          originalTeamId: user.team_id,
          revisedPriceLakh: revised,
        },
        createdAt: nowIso(),
      },
    );
    finalizeSale({
      context,
      lot,
      facts,
      winnerTeamId: user.team_id,
      priceLakh: revised,
      via: "rtm-match",
      rtmStatus: "matched",
    });
    return;
  }

  if (action.type === "rtm_decline_match") {
    if (lot.rtm_status !== "awaiting_match" || !isOriginal) {
      throw new AuctionError("RTM_NOT_YOUR_DECISION", "It is not your turn to decline the match.", 409);
    }
    const revised = lot.revised_price_lakh ?? currentBid;
    insertEvent(
      context.db,
      context.session.id,
      "rtm_declined_match",
      context.multiplayer
        ? `RTM DECLINED · ${actorLabel(context, user.team_id)} decline to match ${formatLakh(revised)}.`
        : `RTM DECLINED · You decline to match ${formatLakh(revised)}.`,
      {
        lotId: lot.id,
        payload: {
          lotNumber: lot.lot_number,
          playerId: facts.player.id,
          originalTeamId: user.team_id,
          revisedPriceLakh: revised,
        },
        createdAt: nowIso(),
      },
    );
    finalizeSale({
      context,
      lot,
      facts,
      winnerTeamId: lot.leader_team_id!,
      priceLakh: revised,
      via: "rtm-declined",
      rtmStatus: "declined_match",
    });
    return;
  }

  throw new AuctionError("INVALID_RTM_ACTION", "That RTM action is not supported.", 400);
}

export function applyAuctionAction(
  sessionId: string,
  action: AuctionAction,
  actingTeamId?: string | null,
): void {
  const db = getDb();
  const run = db.transaction(() => {
    const context = loadActionContext(db, sessionId);
    if (context.session.status === "lobby") {
      if (action.type === "tick") return;
      throw new AuctionError("LOBBY_NOT_STARTED", "The host has not started the auction yet.", 409);
    }
    if (context.session.status !== "active") {
      if (action.type === "tick") return;
      throw new AuctionError("AUCTION_COMPLETE", "This auction has already finished.", 409);
    }
    if (action.type === "tick") {
      tick(context);
      return;
    }
    const lot = loadCurrentLot(db, context.session);
    if (!lot) {
      throw new AuctionError("NO_LIVE_LOT", "There is no live lot for that action.", 409);
    }
    const facts = loadFacts(
      db,
      lot.player_id,
      loadSessionConfig(context.session).asOfSeason,
      lot.original_team_id,
    );
    if (action.type === "bid") {
      submitHumanBid(context, lot, facts, action.amountLakh, actingTeamId);
      return;
    }
    if (lot.status === "rtm" || action.type.startsWith("rtm_")) {
      submitRtmAction(context, lot, facts, action, actingTeamId);
      return;
    }
    throw new AuctionError("ACTION_NOT_AVAILABLE", "That action is not available on this lot.", 409);
  });
  run.immediate();
}

export function abandonAuctionSession(sessionId: string): void {
  const db = getDb();
  const session = loadSession(db, sessionId);
  if (session.status === "abandoned") return;
  if (session.status !== "active") {
    throw new AuctionError("AUCTION_NOT_ACTIVE", "Only an active auction can be abandoned.", 409);
  }
  const at = nowIso();
  db.prepare(
    "UPDATE auction_sessions SET status = 'abandoned', updated_at = ? WHERE id = ?",
  ).run(at, sessionId);
  insertEvent(db, sessionId, "session_abandoned", "Auction abandoned. The saved state remains available for inspection.", {
    payload: { abandonedAt: at },
    createdAt: at,
  });
}
