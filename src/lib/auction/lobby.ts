import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { applyAuctionAction } from "./actions";
import { cleanDisplayName } from "./create";
import {
  AuctionError,
  insertEvent,
  loadSession,
  loadSessionTeams,
  nowIso,
  touchSession,
} from "./internal";
import { buildSnapshot } from "./snapshot";
import type { AuctionSnapshot, SnapshotSeat } from "./types";

interface LobbyRow {
  session_id: string;
  join_code: string;
  host_participant_id: string | null;
  status: string;
  paused: number;
  tick_ms: number;
  last_tick_at: string | null;
  started_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ParticipantRow {
  id: string;
  session_id: string;
  team_id: string;
  display_name: string;
  token: string;
  is_host: number;
  is_ready: number;
  joined_at: string;
  last_seen_at: string;
}

export interface JoinedLobby {
  sessionId: string;
  joinCode: string;
  participantId: string;
  token: string;
  teamId: string;
  isHost: boolean;
}

export interface LobbyPreview {
  sessionId: string;
  joinCode: string;
  name: string;
  modeName: string;
  status: "lobby" | "live" | "closed";
  joinable: boolean;
  seats: SnapshotSeat[];
  humanCount: number;
}

const MAX_SEATS = 10;
export const MIN_TICK_MS = 1_000;
export const MAX_TICK_MS = 120_000;

function lobbyRow(db: ReturnType<typeof getDb>, sessionId: string): LobbyRow {
  const row = db
    .prepare("SELECT * FROM auction_lobbies WHERE session_id = ?")
    .get(sessionId) as LobbyRow | undefined;
  if (!row) {
    throw new AuctionError("LOBBY_NOT_FOUND", "That multiplayer room could not be found.", 404);
  }
  return row;
}

function normalizeToken(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const token = raw.trim();
  if (token.length < 8 || token.length > 100) return null;
  return token;
}

export function findParticipant(
  sessionId: string,
  rawToken: string | null | undefined,
): ParticipantRow | null {
  const token = normalizeToken(rawToken);
  if (!token) return null;
  return (
    (getDb()
      .prepare("SELECT * FROM auction_participants WHERE session_id = ? AND token = ?")
      .get(sessionId, token) as ParticipantRow | undefined) ?? null
  );
}

export function requireParticipant(
  sessionId: string,
  rawToken: string | null | undefined,
): ParticipantRow {
  const participant = findParticipant(sessionId, rawToken);
  if (!participant) {
    throw new AuctionError("SEAT_REQUIRED", "Take a seat in this room before acting.", 401);
  }
  return participant;
}

export function resolveParticipantTeam(
  sessionId: string,
  rawToken: string | null | undefined,
): string | null {
  return findParticipant(sessionId, rawToken)?.team_id ?? null;
}

function touchParticipant(sessionId: string, participantId: string): void {
  getDb()
    .prepare("UPDATE auction_participants SET last_seen_at = ? WHERE session_id = ? AND id = ?")
    .run(nowIso(), sessionId, participantId);
}

function systemChat(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  body: string,
  options: { participantId?: string | null; teamId?: string | null; displayName?: string } = {},
): void {
  db.prepare(
    `INSERT INTO auction_chat (session_id, participant_id, team_id, display_name, kind, body, created_at)
     VALUES (?, ?, ?, ?, 'system', ?, ?)`,
  ).run(
    sessionId,
    options.participantId ?? null,
    options.teamId ?? null,
    options.displayName ?? "Room",
    body,
    nowIso(),
  );
}

function lobbyStatus(row: LobbyRow): "lobby" | "live" | "closed" {
  if (row.status === "live") return "live";
  if (row.status === "closed") return "closed";
  return "lobby";
}

export function getLobbyByCode(codeRaw: string): LobbyRow & { session_id: string } {
  const code = codeRaw.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,10}$/.test(code)) {
    throw new AuctionError("INVALID_CODE", "Enter the six-character room code.", 400);
  }
  const row = getDb()
    .prepare("SELECT * FROM auction_lobbies WHERE join_code = ?")
    .get(code) as LobbyRow | undefined;
  if (!row) throw new AuctionError("ROOM_NOT_FOUND", "No room uses that code.", 404);
  return row;
}

export function previewLobby(codeRaw: string): LobbyPreview {
  const db = getDb();
  const row = getLobbyByCode(codeRaw);
  const snapshot = buildSnapshot(db, row.session_id, undefined, null);
  const lobby = snapshot.lobby;
  if (!lobby) throw new AuctionError("LOBBY_NOT_FOUND", "That room could not be found.", 404);
  return {
    sessionId: row.session_id,
    joinCode: row.join_code,
    name: snapshot.session.name,
    modeName: snapshot.session.rulebook.name,
    status: lobbyStatus(row),
    joinable: lobbyStatus(row) === "lobby",
    seats: lobby.seats,
    humanCount: lobby.humanCount,
  };
}

export function joinLobby(input: {
  code: string;
  teamId: string;
  displayName: string;
}): JoinedLobby {
  const db = getDb();
  const run = db.transaction(() => {
    const row = getLobbyByCode(input.code);
    if (lobbyStatus(row) !== "lobby") {
      throw new AuctionError("ROOM_STARTED", "That auction has already started.", 409);
    }
    const session = loadSession(db, row.session_id);
    if (session.status !== "lobby") {
      throw new AuctionError("ROOM_STARTED", "That auction has already started.", 409);
    }
    const teams = loadSessionTeams(db, row.session_id);
    const team = teams.find((entry) => entry.team_id === input.teamId);
    if (!team) {
      throw new AuctionError("TEAM_NOT_FOUND", "That franchise is not in this room.", 400);
    }
    if (teams.length > MAX_SEATS) {
      throw new AuctionError("ROOM_FULL", "This room already has ten seats.", 409);
    }
    const existing = db
      .prepare("SELECT id FROM auction_participants WHERE session_id = ? AND team_id = ?")
      .get(row.session_id, team.team_id) as { id: string } | undefined;
    if (existing) {
      throw new AuctionError("SEAT_TAKEN", "Another manager already claimed that franchise.", 409);
    }
    const at = nowIso();
    const participantId = randomUUID();
    const token = randomUUID();
    db.prepare(
      `INSERT INTO auction_participants (
         id, session_id, team_id, display_name, token, is_host, is_ready, joined_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    ).run(
      participantId,
      row.session_id,
      team.team_id,
      cleanDisplayName(input.displayName),
      token,
      at,
      at,
    );
    db.prepare(
      "UPDATE session_teams SET is_human = 1 WHERE session_id = ? AND team_id = ?",
    ).run(row.session_id, team.team_id);
    db.prepare("UPDATE auction_lobbies SET updated_at = ? WHERE session_id = ?").run(
      at,
      row.session_id,
    );
    touchSession(db, row.session_id, at);
    systemChat(db, row.session_id, `${team.team_name} is now managed by a human.`, {
      participantId,
      teamId: team.team_id,
      displayName: cleanDisplayName(input.displayName),
    });
    insertEvent(db, row.session_id, "seat_claimed", `${team.short_name} joined the room as a human franchise.`, {
      payload: { teamId: team.team_id },
      createdAt: at,
    });
    return {
      sessionId: row.session_id,
      joinCode: row.join_code,
      participantId,
      token,
      teamId: team.team_id,
      isHost: false,
    };
  });
  return run.immediate() as JoinedLobby;
}

export function leaveLobby(sessionId: string, token: string): { closed: boolean } {
  const db = getDb();
  const run = db.transaction(() => {
    const row = lobbyRow(db, sessionId);
    const participant = requireParticipant(sessionId, token);
    if (lobbyStatus(row) !== "lobby") {
      throw new AuctionError("ROOM_STARTED", "Seats are locked once the auction starts.", 409);
    }
    const at = nowIso();
    db.prepare("DELETE FROM auction_participants WHERE id = ?").run(participant.id);
    db.prepare(
      "UPDATE session_teams SET is_human = 0 WHERE session_id = ? AND team_id = ?",
    ).run(sessionId, participant.team_id);
    const others = db
      .prepare(
        "SELECT * FROM auction_participants WHERE session_id = ? ORDER BY joined_at LIMIT 1",
      )
      .get(sessionId) as ParticipantRow | undefined;
    if (!others) {
      db.prepare(
        "UPDATE auction_lobbies SET status = 'closed', closed_at = ?, updated_at = ? WHERE session_id = ?",
      ).run(at, at, sessionId);
      db.prepare(
        "UPDATE auction_sessions SET status = 'abandoned', updated_at = ? WHERE id = ?",
      ).run(at, sessionId);
      insertEvent(db, sessionId, "session_abandoned", "The host left and the empty room was closed.", {
        payload: { abandonedAt: at },
        createdAt: at,
      });
      return { closed: true };
    }
    if (participant.is_host === 1) {
      db.prepare(
        "UPDATE auction_participants SET is_host = 1 WHERE session_id = ? AND id = ?",
      ).run(sessionId, others.id);
      db.prepare("UPDATE auction_lobbies SET host_participant_id = ?, updated_at = ? WHERE session_id = ?").run(
        others.id,
        at,
        sessionId,
      );
      db.prepare("UPDATE auction_sessions SET user_team_id = ? WHERE id = ?").run(
        others.team_id,
        sessionId,
      );
      systemChat(db, sessionId, "Host controls passed to the longest-seated manager.");
    }
    systemChat(db, sessionId, `${participant.display_name} left the room.`);
    db.prepare("UPDATE auction_lobbies SET updated_at = ? WHERE session_id = ?").run(at, sessionId);
    touchSession(db, sessionId, at);
    return { closed: false };
  });
  return run.immediate() as { closed: boolean };
}

export function setReady(sessionId: string, token: string, ready: boolean): void {
  const db = getDb();
  const participant = requireParticipant(sessionId, token);
  const row = lobbyRow(db, sessionId);
  if (lobbyStatus(row) !== "lobby") {
    throw new AuctionError("ROOM_STARTED", "The auction has already started.", 409);
  }
  db.prepare("UPDATE auction_participants SET is_ready = ?, last_seen_at = ? WHERE id = ?").run(
    ready ? 1 : 0,
    nowIso(),
    participant.id,
  );
}

export function startLobby(sessionId: string, token: string): AuctionSnapshot {
  const db = getDb();
  const run = db.transaction(() => {
    const row = lobbyRow(db, sessionId);
    const participant = requireParticipant(sessionId, token);
    if (participant.is_host !== 1) {
      throw new AuctionError("HOST_ONLY", "Only the host can start the auction.", 403);
    }
    if (lobbyStatus(row) !== "lobby") {
      throw new AuctionError("ROOM_STARTED", "This room has already started.", 409);
    }
    const session = loadSession(db, sessionId);
    if (session.status !== "lobby") {
      throw new AuctionError("ROOM_STARTED", "This room has already started.", 409);
    }
    const participants = db
      .prepare("SELECT * FROM auction_participants WHERE session_id = ? ORDER BY joined_at")
      .all(sessionId) as ParticipantRow[];
    const claimed = new Set(participants.map((entry) => entry.team_id));
    const at = nowIso();
    db.prepare("UPDATE session_teams SET is_human = 0 WHERE session_id = ?").run(sessionId);
    const setHuman = db.prepare(
      "UPDATE session_teams SET is_human = 1 WHERE session_id = ? AND team_id = ?",
    );
    for (const teamId of claimed) setHuman.run(sessionId, teamId);

    const first = db
      .prepare(
        "SELECT id, player_id, lot_number, set_name, base_price_lakh FROM auction_lots WHERE session_id = ? ORDER BY lot_number LIMIT 1",
      )
      .get(sessionId) as
      | {
          id: string;
          player_id: string;
          lot_number: number;
          set_name: string | null;
          base_price_lakh: number;
        }
      | undefined;
    if (!first) throw new AuctionError("EMPTY_POOL", "This room has no lots to auction.", 500);

    db.prepare(
      `UPDATE auction_lobbies
       SET status = 'live', paused = 0, started_at = ?, last_tick_at = NULL, updated_at = ?
       WHERE session_id = ?`,
    ).run(at, at, sessionId);
    db.prepare(
      "UPDATE auction_sessions SET status = 'active', current_lot_id = ?, updated_at = ? WHERE id = ?",
    ).run(first.id, at, sessionId);
    db.prepare(
      "UPDATE auction_lots SET status = 'live', opened_at = ?, quiet_ticks = 0 WHERE id = ?",
    ).run(at, first.id);
    const player = db.prepare("SELECT full_name FROM players WHERE id = ?").get(first.player_id) as {
      full_name: string;
    };
    const aiCount = loadSessionTeams(db, sessionId).length - claimed.size;
    systemChat(
      db,
      sessionId,
      `Room locked · ${claimed.size} human manager${claimed.size === 1 ? "" : "s"}, ${aiCount} AI franchise${aiCount === 1 ? "" : "s"}.`,
    );
    insertEvent(
      db,
      sessionId,
      "lobby_started",
      `Auction started · ${claimed.size} human manager${claimed.size === 1 ? "" : "s"} and the AI fill all ten seats.`,
      { payload: { humans: claimed.size, ai: aiCount }, createdAt: at },
    );
    insertEvent(
      db,
      sessionId,
      "lot_open",
      `Lot 1 · ${first.set_name ?? "Auction lot"} — ${player.full_name} is on the block at the base price.`,
      {
        lotId: first.id,
        payload: {
          lotNumber: first.lot_number,
          playerId: first.player_id,
          basePriceLakh: first.base_price_lakh,
          setName: first.set_name,
        },
        createdAt: at,
      },
    );
  });
  run.immediate();
  return buildSnapshot(db, sessionId, undefined, participantTeam(sessionId, token));
}

function participantTeam(sessionId: string, token: string): string | null {
  return findParticipant(sessionId, token)?.team_id ?? null;
}

export function updateLobbySettings(
  sessionId: string,
  token: string,
  settings: { paused?: boolean; tickMs?: number },
): void {
  const db = getDb();
  const row = lobbyRow(db, sessionId);
  const participant = requireParticipant(sessionId, token);
  if (participant.is_host !== 1) {
    throw new AuctionError("HOST_ONLY", "Only the host can control the room clock.", 403);
  }
  if (lobbyStatus(row) === "closed") {
    throw new AuctionError("ROOM_CLOSED", "This room has closed.", 409);
  }
  const at = nowIso();
  if (typeof settings.paused === "boolean") {
    db.prepare("UPDATE auction_lobbies SET paused = ?, last_tick_at = NULL, updated_at = ? WHERE session_id = ?").run(
      settings.paused ? 1 : 0,
      at,
      sessionId,
    );
  }
  if (typeof settings.tickMs === "number" && Number.isFinite(settings.tickMs)) {
    const tickMs = Math.min(MAX_TICK_MS, Math.max(MIN_TICK_MS, Math.round(settings.tickMs)));
    db.prepare("UPDATE auction_lobbies SET tick_ms = ?, updated_at = ? WHERE session_id = ?").run(
      tickMs,
      at,
      sessionId,
    );
  }
}

export function nudgeLobby(sessionId: string, token: string): void {
  const db = getDb();
  requireParticipant(sessionId, token);
  db.prepare("UPDATE auction_lobbies SET last_tick_at = NULL WHERE session_id = ?").run(sessionId);
}

export function kickParticipant(sessionId: string, token: string, participantId: string): void {
  const db = getDb();
  const run = db.transaction(() => {
    const row = lobbyRow(db, sessionId);
    const host = requireParticipant(sessionId, token);
    if (host.is_host !== 1) {
      throw new AuctionError("HOST_ONLY", "Only the host can remove a manager.", 403);
    }
    if (lobbyStatus(row) !== "lobby") {
      throw new AuctionError("ROOM_STARTED", "Seats are locked once the auction starts.", 409);
    }
    if (participantId === host.id) {
      throw new AuctionError("CANNOT_KICK_HOST", "The host cannot remove their own seat.", 400);
    }
    const target = db
      .prepare("SELECT * FROM auction_participants WHERE session_id = ? AND id = ?")
      .get(sessionId, participantId) as ParticipantRow | undefined;
    if (!target) throw new AuctionError("PARTICIPANT_NOT_FOUND", "That manager is no longer in the room.", 404);
    const at = nowIso();
    db.prepare("DELETE FROM auction_participants WHERE id = ?").run(target.id);
    db.prepare(
      "UPDATE session_teams SET is_human = 0 WHERE session_id = ? AND team_id = ?",
    ).run(sessionId, target.team_id);
    systemChat(db, sessionId, `${target.display_name} was removed by the host.`);
    db.prepare("UPDATE auction_lobbies SET updated_at = ? WHERE session_id = ?").run(at, sessionId);
    touchSession(db, sessionId, at);
  });
  run.immediate();
}

export function postChat(sessionId: string, token: string, bodyRaw: string, kindRaw?: string): void {
  const db = getDb();
  lobbyRow(db, sessionId);
  const participant = requireParticipant(sessionId, token);
  const body = bodyRaw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  if (!body) throw new AuctionError("EMPTY_MESSAGE", "Write a message before sending.", 400);
  const kind = kindRaw === "emote" ? "emote" : "chat";
  const at = nowIso();
  db.prepare(
    `INSERT INTO auction_chat (session_id, participant_id, team_id, display_name, kind, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, participant.id, participant.team_id, participant.display_name, kind, body, at);
  db.prepare("UPDATE auction_participants SET last_seen_at = ? WHERE id = ?").run(at, participant.id);
}

/** Accepted voice clip containers; the browser recorder decides between webm/ogg/mp4. */
export const VOICE_MIME_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);
export const MAX_VOICE_BYTES = 750_000;
export const MAX_VOICE_MS = 60_000;

function normalizeVoiceMime(raw: string): string | null {
  const base = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  return VOICE_MIME_TYPES.has(base) ? base : null;
}

/**
 * Stores a short voice note as a clip and links it into the room chat. The
 * chat body only carries the clip id and duration, so state polls stay small.
 */
export function postVoiceChat(
  sessionId: string,
  token: string,
  audio: Buffer,
  mimeRaw: string,
  durationRaw: number,
): void {
  const db = getDb();
  lobbyRow(db, sessionId);
  const participant = requireParticipant(sessionId, token);
  const mime = normalizeVoiceMime(mimeRaw);
  if (!mime) throw new AuctionError("VOICE_TYPE", "That audio format is not supported.", 400);
  if (audio.byteLength === 0) throw new AuctionError("VOICE_EMPTY", "The recording was empty.", 400);
  if (audio.byteLength > MAX_VOICE_BYTES) {
    throw new AuctionError("VOICE_TOO_LARGE", "That voice note is too long — keep it under a minute.", 413);
  }
  const durationMs = Number.isFinite(durationRaw)
    ? Math.min(MAX_VOICE_MS, Math.max(500, Math.round(durationRaw)))
    : 0;
  const clipId = randomUUID();
  const at = nowIso();
  const body = JSON.stringify({ clipId, durationMs });
  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO auction_chat (session_id, participant_id, team_id, display_name, kind, body, created_at)
         VALUES (?, ?, ?, ?, 'voice', ?, ?)`,
      )
      .run(sessionId, participant.id, participant.team_id, participant.display_name, body, at);
    db.prepare(
      `INSERT INTO auction_voice_clips (
         id, session_id, chat_id, participant_id, mime, duration_ms, data, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(clipId, sessionId, Number(result.lastInsertRowid), participant.id, mime, durationMs, audio, at);
    db.prepare("UPDATE auction_participants SET last_seen_at = ? WHERE id = ?").run(at, participant.id);
  });
  insert();
}

export function loadVoiceClip(
  sessionId: string,
  clipId: string,
): { mime: string; data: Buffer } | null {
  const row = getDb()
    .prepare("SELECT mime, data FROM auction_voice_clips WHERE id = ? AND session_id = ?")
    .get(clipId, sessionId) as { mime: string; data: Buffer } | undefined;
  return row ?? null;
}

/**
 * Called by the room's state poll. Touches presence, then lets exactly one
 * client advance the auction per tick window, so several browsers can poll
 * without double-bidding.
 */
export function lobbyHeartbeat(
  sessionId: string,
  token?: string | null,
  options: { advance?: boolean } = {},
): AuctionSnapshot {
  const db = getDb();
  const row = lobbyRow(db, sessionId);
  const viewer = findParticipant(sessionId, token);
  if (viewer) touchParticipant(sessionId, viewer.id);

  if (options.advance !== false && lobbyStatus(row) === "live" && row.paused === 0) {
    const session = loadSession(db, sessionId);
    if (session.status === "active") {
      const at = nowIso();
      const dueBefore = new Date(Date.now() - row.tick_ms).toISOString();
      const claim = db
        .prepare(
          `UPDATE auction_lobbies SET last_tick_at = ?, tick_seq = tick_seq + 1
           WHERE session_id = ? AND (last_tick_at IS NULL OR last_tick_at <= ?)`,
        )
        .run(at, sessionId, dueBefore);
      if (claim.changes === 1) {
        applyAuctionAction(sessionId, { type: "tick" });
        const after = loadSession(db, sessionId);
        if (after.status === "completed") {
          db.prepare(
            "UPDATE auction_lobbies SET status = 'closed', closed_at = ?, updated_at = ? WHERE session_id = ?",
          ).run(nowIso(), nowIso(), sessionId);
        }
      }
    }
  }

  return buildSnapshot(db, sessionId, undefined, viewer?.team_id ?? null);
}

export function getLobbySnapshot(sessionId: string, token?: string | null): AuctionSnapshot {
  const db = getDb();
  lobbyRow(db, sessionId);
  const viewer = findParticipant(sessionId, token);
  if (viewer) touchParticipant(sessionId, viewer.id);
  return buildSnapshot(db, sessionId, undefined, viewer?.team_id ?? null);
}

export function closeLobby(sessionId: string, token: string): void {
  const db = getDb();
  const run = db.transaction(() => {
    const row = lobbyRow(db, sessionId);
    const host = requireParticipant(sessionId, token);
    if (host.is_host !== 1) {
      throw new AuctionError("HOST_ONLY", "Only the host can close the room.", 403);
    }
    if (lobbyStatus(row) === "closed") return;
    const at = nowIso();
    db.prepare(
      "UPDATE auction_lobbies SET status = 'closed', closed_at = ?, updated_at = ? WHERE session_id = ?",
    ).run(at, at, sessionId);
    const session = loadSession(db, sessionId);
    if (session.status === "lobby" || session.status === "active") {
      db.prepare("UPDATE auction_sessions SET status = 'abandoned', updated_at = ? WHERE id = ?").run(
        at,
        sessionId,
      );
    }
    insertEvent(db, sessionId, "session_abandoned", "The host closed the multiplayer room.", {
      payload: { closedAt: at },
      createdAt: at,
    });
  });
  run.immediate();
}

export function lobbyExists(sessionId: string): boolean {
  return Boolean(
    getDb().prepare("SELECT 1 FROM auction_lobbies WHERE session_id = ?").get(sessionId),
  );
}
