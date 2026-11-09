import { randomInt, randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { formatLakh } from "@/lib/money";
import { buildPool } from "./pool";
import { buildRetainedSquads, RETENTION_NOTE, type RetainedPlayer } from "./retention";
import { chooseMini2027Retentions } from "./mini2027";
import {
  AuctionError,
  incrementSlabs,
  insertEvent,
  loadRulebook,
  nowIso,
  rulebookMeta,
} from "./internal";
import { getAuctionMode, profileForTeam } from "./modes";
import type { AuctionSessionConfig } from "./types";

interface TeamRow {
  id: string;
  name: string;
  short_name: string;
  city: string | null;
  primary_color: string;
  secondary_color: string;
  ink_color: string;
  active: number;
}

export interface CreateSessionInput {
  modeId: string;
  userTeamId: string;
  name?: string | null;
  /** 2027 mini auction: player ids the user keeps from their 2026 squad. */
  retainedPlayerIds?: string[] | null;
  /** 2026 mega draft: optional Right to Match switch. */
  rtmEnabled?: boolean | null;
}

export interface CreateLobbyInput extends CreateSessionInput {
  displayName: string;
  /** Per-tick room clock in milliseconds. */
  tickMs?: number | null;
}

/** Lobby clock clamp: one second to two minutes. */
export function lobbyTickMs(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1_000;
  return Math.min(120_000, Math.max(1_000, Math.round(value)));
}

export interface CreatedLobby {
  sessionId: string;
  joinCode: string;
  participantId: string;
  token: string;
}

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateJoinCode(db: ReturnType<typeof getDb>): string {
  const exists = db.prepare("SELECT 1 FROM auction_lobbies WHERE join_code = ?");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    let code = "";
    for (let index = 0; index < 6; index += 1) {
      code += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)];
    }
    if (!exists.get(code)) return code;
  }
  throw new AuctionError("JOIN_CODE_UNAVAILABLE", "A room code could not be allocated. Try again.", 500);
}

export function cleanDisplayName(raw: string | null | undefined): string {
  if (!raw) return "Manager";
  const trimmed = raw.trim().replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "");
  return trimmed.length > 0 ? trimmed.slice(0, 24) : "Manager";
}

function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed.slice(0, 80) : null;
}

function createSessionRecord(
  input: CreateSessionInput,
  lobby: { displayName: string; tickMs?: number | null } | null,
): { sessionId: string; joinCode: string | null; participantId: string | null; token: string | null } {
  const mode = getAuctionMode(input.modeId);
  if (!mode) {
    throw new AuctionError("MODE_NOT_FOUND", "That auction format is not available.", 404);
  }

  const db = getDb();
  const sessionId = randomUUID();
  let joinCode: string | null = null;
  let participantId: string | null = null;
  let token: string | null = null;
  const effectiveRtm = mode.rtmOptional ? Boolean(input.rtmEnabled) : mode.rtmEnabled;
  const effectiveRulebookId =
    effectiveRtm && mode.rtmRulebookId ? mode.rtmRulebookId : mode.rulebookId;
  const effectiveMode = effectiveRtm === mode.rtmEnabled ? mode : { ...mode, rtmEnabled: effectiveRtm };

  const create = db.transaction(() => {
    const rulebook = loadRulebook(db, effectiveRulebookId);
    const meta = rulebookMeta(rulebook);
    if (effectiveRtm && meta.rtmEnabled === false) {
      throw new AuctionError("RTM_NOT_AVAILABLE", "This rulebook does not enable Right to Match.", 400);
    }

    const teams = db
      .prepare("SELECT * FROM teams WHERE active = 1 ORDER BY name")
      .all() as TeamRow[];
    const userTeam = teams.find((team) => team.id === input.userTeamId);
    if (!userTeam) {
      throw new AuctionError("TEAM_NOT_FOUND", "Choose one of the ten active franchises.", 400);
    }

    const activeTeamIds = new Set(teams.map((team) => team.id));
    const seed = randomInt(1, 2_000_000_000);
    const cap = rulebook.purse_cap_lakh;

    let retained: Map<string, RetainedPlayer[]>;
    let retainedPlayerIds: Set<string>;
    if (mode.retentionKind === "contract-2026") {
      const selection = chooseMini2027Retentions(db, {
        userTeamId: userTeam.id,
        retainedPlayerIds: input.retainedPlayerIds,
        capLakh: cap,
        squadMax: rulebook.squad_max,
        overseasMax: rulebook.overseas_max,
        asOfSeason: mode.asOfSeason,
      });
      retained = selection.retainedByTeam;
      retainedPlayerIds = selection.retainedIds;
    } else if (mode.retainedSquads) {
      retained = buildRetainedSquads(db, mode.asOfSeason, rulebook.squad_max);
      retainedPlayerIds = new Set(
        [...retained.values()].flat().map((player) => player.playerId),
      );
    } else {
      retained = new Map<string, RetainedPlayer[]>();
      retainedPlayerIds = new Set<string>();
    }

    const pool = buildPool(db, effectiveMode, seed, activeTeamIds, retainedPlayerIds);
    if (pool.length === 0) {
      throw new AuctionError("EMPTY_POOL", "No players are available for this auction format.", 500);
    }

    const retainedTotals = new Map<string, number>();
    for (const [teamId, players] of retained) {
      retainedTotals.set(
        teamId,
        players.reduce((sum, player) => sum + player.priceLakh, 0),
      );
    }

    const config: AuctionSessionConfig = {
      mode: mode.id,
      pool: mode.pool,
      retentionKind: mode.retentionKind,
      minSquadExempt: mode.minSquadExempt,
      simulatedBasePrices: mode.simulatedBasePrices,
      simulatedRetention: mode.simulatedRetention,
      retentionNote:
        mode.retentionKind === "contract-2026"
          ? "2027 mini auction: every retained player is charged at his official 2026 contract value. Unchecked players join the global auction pool, and each purse is the cap minus that team's retention spend."
          : mode.retainedSquads
            ? RETENTION_NOTE
            : null,
      asOfSeason: mode.asOfSeason,
      seed,
    };
    const sessionName =
      cleanName(input.name) ?? `${userTeam.short_name} · ${mode.name}`;
    const createdAt = nowIso();
    if (lobby) {
      joinCode = generateJoinCode(db);
      participantId = randomUUID();
      token = randomUUID();
    }

    db.prepare(
      `INSERT INTO auction_sessions (
         id, name, mode, season, rulebook_id, status, user_team_id, current_lot_id,
         pool_source, total_lots, completed_lots, purse_cap_lakh, squad_min, squad_max,
         overseas_max, rtm_cards, config_json, created_at, updated_at, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      sessionId,
      sessionName,
      mode.id,
      mode.season,
      effectiveRulebookId,
      lobby ? "lobby" : "active",
      userTeam.id,
      mode.pool,
      pool.length,
      cap,
      rulebook.squad_min,
      rulebook.squad_max,
      rulebook.overseas_max,
      effectiveRtm ? rulebook.rtm_cards : 0,
      JSON.stringify(config),
      createdAt,
      createdAt,
    );

    const insertTeam = db.prepare(
      `INSERT INTO session_teams (
         session_id, team_id, is_human, opening_purse_lakh, purse_lakh, spent_lakh,
         pre_existing_value_lakh, rtm_remaining, ai_profile
       ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    );
    for (const team of teams) {
      const retentionSpend = retainedTotals.get(team.id) ?? 0;
      const openingPurse = cap - retentionSpend;
      insertTeam.run(
        sessionId,
        team.id,
        team.id === userTeam.id ? 1 : 0,
        openingPurse,
        openingPurse,
        retentionSpend,
        effectiveRtm ? rulebook.rtm_cards : 0,
        profileForTeam(team.id).id,
      );
    }

    const insertRetained = db.prepare(
      `INSERT INTO session_squads (
         session_id, team_id, player_id, price_lakh, price_verified, acquired_via, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertTransaction = db.prepare(
      `INSERT INTO auction_transactions (
         session_id, team_id, player_id, lot_id, type, amount_lakh, created_at, meta_json
       ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    );
    for (const [teamId, players] of retained) {
      for (const player of players) {
        insertRetained.run(
          sessionId,
          teamId,
          player.playerId,
          player.priceLakh,
          player.verified ? 1 : 0,
          player.verified ? "retained-contract" : "retained-simulated",
          createdAt,
        );
        insertTransaction.run(
          sessionId,
          teamId,
          player.playerId,
          player.verified ? "retention-contract" : "retention-simulated",
          player.priceLakh,
          createdAt,
          JSON.stringify({
            source: player.verified ? "official-2026-contract" : "simulator-estimate",
            ratingAsOf: mode.asOfSeason,
            rating: player.rating,
            note: player.verified
              ? "Retained at the official 2026 contract value."
              : "Retention charge is a simulator estimate for a player outside the official 2026 squad list.",
          }),
        );
      }
    }

    const insertLot = db.prepare(
      `INSERT INTO auction_lots (
         id, session_id, lot_number, player_id, set_name, base_price_lakh, base_price_verified,
         status, current_bid_lakh, leader_team_id, original_team_id, rtm_available, rtm_status,
         revised_price_lakh, quiet_ticks, bid_count, opened_at, closing_at, resolved_at,
         winning_team_id, final_price_lakh, sold_via
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL)`,
    );

    let firstLotId: string | null = null;
    pool.forEach((entry, index) => {
      const lotNumber = index + 1;
      const lotId = `${sessionId}-lot-${String(lotNumber).padStart(3, "0")}`;
      insertLot.run(
        lotId,
        sessionId,
        lotNumber,
        entry.playerId,
        entry.setName,
        entry.basePriceLakh,
        entry.basePriceVerified ? 1 : 0,
        entry.originalTeamId,
        entry.rtmAvailable ? 1 : 0,
      );
      if (lotNumber === 1) firstLotId = lotId;
    });

    if (!firstLotId) throw new AuctionError("EMPTY_POOL", "No lots were created.", 500);

    if (lobby && joinCode && participantId && token) {
      db.prepare(
        `INSERT INTO auction_lobbies (
           session_id, join_code, host_participant_id, status, paused, tick_ms,
           last_tick_at, tick_seq, created_at, updated_at, started_at, closed_at
         ) VALUES (?, ?, ?, 'lobby', 0, ?, NULL, 0, ?, ?, NULL, NULL)`,
      ).run(sessionId, joinCode, participantId, lobbyTickMs(lobby.tickMs), createdAt, createdAt);
      db.prepare(
        `INSERT INTO auction_participants (
           id, session_id, team_id, display_name, token, is_host, is_ready, joined_at, last_seen_at
         ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      ).run(
        participantId,
        sessionId,
        userTeam.id,
        cleanDisplayName(lobby.displayName),
        token,
        createdAt,
        createdAt,
      );
      insertEvent(
        db,
        sessionId,
        "lobby_created",
        `Multiplayer room created · share code ${joinCode}. Unclaimed franchises will be managed by the AI.`,
        {
          payload: { mode: mode.id, hostTeamId: userTeam.id, joinCode, totalLots: pool.length },
          createdAt,
        },
      );
    } else {
      db.prepare(
        "UPDATE auction_lots SET status = 'live', opened_at = ? WHERE id = ?",
      ).run(createdAt, firstLotId);
      db.prepare("UPDATE auction_sessions SET current_lot_id = ? WHERE id = ?").run(
        firstLotId,
        sessionId,
      );
    }

    insertEvent(
      db,
      sessionId,
      "session_created",
      lobby
        ? `${userTeam.name} opened a multiplayer ${mode.name} room.`
        : `Auction created · ${mode.name}. ${userTeam.name} is under your control.`,
      {
        payload: {
          mode: mode.id,
          userTeamId: userTeam.id,
          totalLots: pool.length,
          pool: mode.pool,
          asOfSeason: mode.asOfSeason,
          seed,
          multiplayer: Boolean(lobby),
        },
        createdAt,
      },
    );

    if (retainedTotals.size > 0) {
      insertEvent(
        db,
        sessionId,
        "retention_notice",
        mode.retentionKind === "contract-2026"
          ? "2026 squads applied. Retained players are charged at their 2026 contract value."
          : "Simulated retained squads applied at estimated contract values.",
        { payload: { retainedPlayers: [...retained.values()].reduce((sum, list) => sum + list.length, 0) }, createdAt },
      );
    }

    if (!lobby) {
      const opening = pool[0];
      const slabs = incrementSlabs(rulebook);
      insertEvent(
        db,
        sessionId,
        "lot_open",
        `Lot 1 · ${opening.setName} — ${opening.fullName} is on the block at ${formatLakh(opening.basePriceLakh)}.`,
        {
          lotId: firstLotId,
          payload: {
            lotNumber: 1,
            playerId: opening.playerId,
            basePriceLakh: opening.basePriceLakh,
            setName: opening.setName,
            increments: slabs.length,
          },
          createdAt,
        },
      );
    }

    if (mode.retainedSquads) {
      db.prepare("UPDATE auction_sessions SET updated_at = ? WHERE id = ?").run(createdAt, sessionId);
    }
  });

  create.immediate();
  return { sessionId, joinCode, participantId, token };
}

export function createAuctionSession(input: CreateSessionInput): string {
  return createSessionRecord(input, null).sessionId;
}

export function createLobbySession(input: CreateLobbyInput): CreatedLobby {
  const result = createSessionRecord(input, { displayName: input.displayName, tickMs: input.tickMs });
  if (!result.joinCode || !result.participantId || !result.token) {
    throw new AuctionError("LOBBY_NOT_CREATED", "The multiplayer room could not be created.", 500);
  }
  return {
    sessionId: result.sessionId,
    joinCode: result.joinCode,
    participantId: result.participantId,
    token: result.token,
  };
}
