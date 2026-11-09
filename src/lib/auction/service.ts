import { getDb } from "@/db";
import { applyAuctionAction, abandonAuctionSession } from "./actions";
import {
  createAuctionSession,
  createLobbySession,
  type CreateLobbyInput,
  type CreateSessionInput,
  type CreatedLobby,
} from "./create";
import { asSessionStatus, AuctionError, loadSession } from "./internal";
import { getAuctionMode } from "./modes";
import { buildSnapshot } from "./snapshot";
import type { AuctionAction, AuctionSnapshot, SessionSummary } from "./types";

export { AuctionError } from "./internal";
export {
  createAuctionSession,
  createLobbySession,
  type CreateLobbyInput,
  type CreateSessionInput,
  type CreatedLobby,
} from "./create";
export { buildSnapshot } from "./snapshot";
export { AUCTION_MODES, getAuctionMode } from "./modes";

export function createSession(input: CreateSessionInput): AuctionSnapshot {
  const id = createAuctionSession(input);
  return buildSnapshot(getDb(), id);
}

export function createLobby(input: CreateLobbyInput): {
  lobby: CreatedLobby;
  snapshot: AuctionSnapshot;
} {
  const lobby = createLobbySession(input);
  return {
    lobby,
    snapshot: buildSnapshot(getDb(), lobby.sessionId, undefined, input.userTeamId),
  };
}

export function getSessionSnapshot(
  sessionId: string,
  viewerTeamId?: string | null,
): AuctionSnapshot {
  return buildSnapshot(getDb(), sessionId, undefined, viewerTeamId);
}

export function actOnSession(
  sessionId: string,
  action: AuctionAction,
  actingTeamId?: string | null,
  viewerTeamId?: string | null,
): AuctionSnapshot {
  applyAuctionAction(sessionId, action, actingTeamId);
  return buildSnapshot(getDb(), sessionId, undefined, viewerTeamId);
}

export function abandonSession(sessionId: string): void {
  abandonAuctionSession(sessionId);
}

interface SummaryRow {
  id: string;
  name: string;
  mode: string;
  season: number;
  status: string;
  user_team_id: string | null;
  total_lots: number;
  completed_lots: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  user_team_name: string | null;
  purse_lakh: number | null;
  spent_lakh: number | null;
  user_squad_size: number;
  join_code: string | null;
  participant_count: number;
}

function mapSummary(row: SummaryRow): SessionSummary {
  const mode = getAuctionMode(row.mode);
  return {
    id: row.id,
    name: row.name,
    mode: row.mode as SessionSummary["mode"],
    modeName: mode?.name ?? row.mode,
    season: row.season,
    status: asSessionStatus(row.status),
    userTeamId: row.user_team_id ?? "",
    userTeamName: row.user_team_name ?? "Unassigned",
    totalLots: row.total_lots,
    completedLots: row.completed_lots,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    userSquadSize: row.user_squad_size,
    userSpentLakh: row.spent_lakh ?? 0,
    userPurseLakh: row.purse_lakh ?? 0,
    joinCode: row.join_code,
    participantCount: row.participant_count,
    isMultiplayer: row.join_code !== null,
  };
}

export function listSessionSummaries(limit = 24): SessionSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.name, s.mode, s.season, s.status, s.user_team_id, s.total_lots,
              s.completed_lots, s.created_at, s.updated_at, s.completed_at,
              t.name AS user_team_name,
              st.purse_lakh, st.spent_lakh,
              (SELECT COUNT(*) FROM session_squads sq
               WHERE sq.session_id = s.id AND sq.team_id = s.user_team_id) AS user_squad_size,
              l.join_code,
              COALESCE(pc.participant_count, 0) AS participant_count
       FROM auction_sessions s
       LEFT JOIN teams t ON t.id = s.user_team_id
       LEFT JOIN session_teams st ON st.session_id = s.id AND st.team_id = s.user_team_id
       LEFT JOIN auction_lobbies l ON l.session_id = s.id
       LEFT JOIN (
         SELECT session_id, COUNT(*) AS participant_count
         FROM auction_participants GROUP BY session_id
       ) pc ON pc.session_id = s.id
       WHERE s.status != 'abandoned'
       ORDER BY s.updated_at DESC
       LIMIT ?`,
    )
    .all(limit) as SummaryRow[];
  return rows.map(mapSummary);
}

export function getSessionSummary(sessionId: string): SessionSummary {
  const row = getDb()
    .prepare(
      `SELECT s.id, s.name, s.mode, s.season, s.status, s.user_team_id, s.total_lots,
              s.completed_lots, s.created_at, s.updated_at, s.completed_at,
              t.name AS user_team_name,
              st.purse_lakh, st.spent_lakh,
              (SELECT COUNT(*) FROM session_squads sq
               WHERE sq.session_id = s.id AND sq.team_id = s.user_team_id) AS user_squad_size,
              l.join_code,
              COALESCE(pc.participant_count, 0) AS participant_count
       FROM auction_sessions s
       LEFT JOIN teams t ON t.id = s.user_team_id
       LEFT JOIN session_teams st ON st.session_id = s.id AND st.team_id = s.user_team_id
       LEFT JOIN auction_lobbies l ON l.session_id = s.id
       LEFT JOIN (
         SELECT session_id, COUNT(*) AS participant_count
         FROM auction_participants GROUP BY session_id
       ) pc ON pc.session_id = s.id
       WHERE s.id = ?`,
    )
    .get(sessionId) as SummaryRow | undefined;
  if (!row) throw new AuctionError("SESSION_NOT_FOUND", "That auction session could not be found.", 404);
  return mapSummary(row);
}

export function sessionExists(sessionId: string): boolean {
  try {
    loadSession(getDb(), sessionId);
    return true;
  } catch {
    return false;
  }
}
