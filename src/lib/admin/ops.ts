import { getDb } from "@/db";
import { brandAssetCoverage } from "@/lib/brand-assets";
import { CURRENT_PLAYER_SQL } from "@/lib/data/queries";

export type AdminSessionRow = {
  id: string;
  name: string;
  mode: string;
  status: string;
  season: number;
  totalLots: number;
  resolvedLots: number;
  createdAt: string;
  updatedAt: string;
  joinCode: string | null;
  humans: number;
  onlineHumans: number;
  lastSeenAt: string | null;
  idle: boolean;
};

export type AdminSeasonRow = {
  id: string;
  sessionId: string;
  sessionName: string;
  status: string;
  seasonYear: number;
  fixtures: number;
  played: number;
  championName: string | null;
};

export type AdminAuditRow = {
  id: number;
  action: string;
  detail: string | null;
  address: string | null;
  at: string;
};

export type AdminOps = {
  counts: {
    players: number;
    activePlayers: number;
    rated: number;
    teams: number;
    sessions: number;
    idleSessions: number;
    seasons: number;
    lots: number;
  };
  assets: { teams: number; players: number; generatedAt: string };
  sessions: AdminSessionRow[];
  seasons: AdminSeasonRow[];
  audit: AdminAuditRow[];
};

const ONLINE_WINDOW_MS = 20_000;
const IDLE_LOBBY_MS = 15 * 60_000;
const IDLE_ROOM_MS = 6 * 60 * 60_000;

export function loadAdminOps(): AdminOps {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      detail TEXT,
      address TEXT,
      at TEXT NOT NULL
    )
  `);

  const scalar = (sql: string): number => {
    const row = db.prepare(sql).get() as { count: number } | undefined;
    return row?.count ?? 0;
  };

  const now = Date.now();
  const onlineCutoff = new Date(now - ONLINE_WINDOW_MS).toISOString();

  const rows = db
    .prepare(
      `SELECT s.id, s.name, s.mode, s.status, s.season, s.total_lots AS totalLots,
              s.created_at AS createdAt, s.updated_at AS updatedAt,
              l.join_code AS joinCode,
              COALESCE((SELECT COUNT(*) FROM auction_lots l2
                        WHERE l2.session_id = s.id AND l2.status IN ('sold','unsold')), 0) AS resolvedLots,
              (SELECT COUNT(*) FROM auction_participants p WHERE p.session_id = s.id) AS humans,
              (SELECT COUNT(*) FROM auction_participants p
                WHERE p.session_id = s.id AND p.last_seen_at >= ?) AS onlineHumans,
              (SELECT MAX(p.last_seen_at) FROM auction_participants p WHERE p.session_id = s.id) AS lastSeenAt
       FROM auction_sessions s
       LEFT JOIN auction_lobbies l ON l.session_id = s.id
       ORDER BY s.created_at DESC
       LIMIT 250`,
    )
    .all(onlineCutoff) as Array<Omit<AdminSessionRow, "idle">>;

  const sessions: AdminSessionRow[] = rows.map((row) => {
    const lastActivity = Date.parse(row.lastSeenAt ?? row.updatedAt);
    const idleLobby =
      row.joinCode !== null &&
      row.status === "lobby" &&
      (row.humans === 0 || now - lastActivity > IDLE_LOBBY_MS);
    const staleRoom =
      row.status !== "completed" &&
      row.status !== "abandoned" &&
      now - Date.parse(row.updatedAt) > IDLE_ROOM_MS;
    return {
      ...row,
      idle: row.status === "abandoned" || idleLobby || staleRoom,
    };
  });

  const seasons = db
    .prepare(
      `SELECT se.id, se.session_id AS sessionId, se.status, se.season_year AS seasonYear,
              s.name AS sessionName,
              COALESCE((SELECT COUNT(*) FROM season_fixtures f WHERE f.season_id = se.id), 0) AS fixtures,
              COALESCE((SELECT COUNT(*) FROM season_fixtures f WHERE f.season_id = se.id AND f.status = 'completed'), 0) AS played,
              t.name AS championName
       FROM seasons se
       JOIN auction_sessions s ON s.id = se.session_id
       LEFT JOIN teams t ON t.id = se.champion_team_id
       ORDER BY se.started_at DESC
       LIMIT 8`,
    )
    .all() as AdminSeasonRow[];

  const audit = db
    .prepare("SELECT id, action, detail, address, at FROM admin_audit ORDER BY id DESC LIMIT 12")
    .all() as AdminAuditRow[];

  return {
    counts: {
      players: scalar("SELECT COUNT(*) AS count FROM players"),
      activePlayers: scalar(
        `SELECT COUNT(*) AS count FROM players p WHERE ${CURRENT_PLAYER_SQL}`,
      ),
      rated: scalar("SELECT COUNT(*) AS count FROM player_ratings WHERE ovr IS NOT NULL"),
      teams: scalar("SELECT COUNT(*) AS count FROM teams"),
      sessions: scalar("SELECT COUNT(*) AS count FROM auction_sessions"),
      idleSessions: sessions.filter((row) => row.idle).length,
      seasons: scalar("SELECT COUNT(*) AS count FROM seasons"),
      lots: scalar("SELECT COUNT(*) AS count FROM auction_lots"),
    },
    assets: brandAssetCoverage(),
    sessions,
    seasons,
    audit,
  };
}
