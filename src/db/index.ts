import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { LOBBY_SCHEMA_SQL } from "./schema";
import { RULEBOOKS } from "@/lib/rules";
import { clearStaticCache } from "@/lib/data/cache";

const globalForDb = globalThis as unknown as { __arenaDb?: Database.Database };

/**
 * Shipped databases predate multiplayer, so the lobby tables and their newer
 * columns are added in place on first open. CREATE IF NOT EXISTS keeps this
 * idempotent for fresh imports and for every dev-server reload.
 */
function ensureLobbySchema(db: Database.Database): void {
  db.exec(LOBBY_SCHEMA_SQL);
  const ensureColumn = (table: string, column: string, definition: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  ensureColumn("auction_lobbies", "tick_ms", "INTEGER NOT NULL DEFAULT 1500");
  ensureColumn("auction_lobbies", "tick_seq", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("auction_participants", "is_ready", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("season_fixtures", "home_ready", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("season_fixtures", "away_ready", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("season_fixtures", "ready_deadline_at", "TEXT");
}

/**
 * Rulebook text lives in source, so a shipped database is kept in step with it
 * without a full re-import (which would discard saved rooms).
 */
function syncRulebooks(db: Database.Database): void {
  const upsert = db.prepare(
    `INSERT INTO rulebooks (
       id, name, season, auction_type, status, purse_cap_lakh, purse_cap_verified,
       squad_min, squad_max, overseas_max, rtm_cards, increments_json, sources_json,
       notes, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       season = excluded.season,
       auction_type = excluded.auction_type,
       status = excluded.status,
       purse_cap_lakh = excluded.purse_cap_lakh,
       purse_cap_verified = excluded.purse_cap_verified,
       squad_min = excluded.squad_min,
       squad_max = excluded.squad_max,
       overseas_max = excluded.overseas_max,
       rtm_cards = excluded.rtm_cards,
       increments_json = excluded.increments_json,
       sources_json = excluded.sources_json,
       notes = excluded.notes,
       updated_at = excluded.updated_at`,
  );
  const at = new Date().toISOString();
  const sync = db.transaction(() => {
    for (const rulebook of RULEBOOKS) {
      upsert.run(
        rulebook.id,
        rulebook.name,
        rulebook.season,
        rulebook.auctionType,
        rulebook.status,
        rulebook.purseCapLakh,
        rulebook.purseCapVerified ? 1 : 0,
        rulebook.squadMin,
        rulebook.squadMax,
        rulebook.overseasMax,
        rulebook.rtmCards,
        JSON.stringify(rulebook.increments),
        JSON.stringify({
          sources: rulebook.sources,
          incrementsVerified: rulebook.incrementsVerified,
          rtmEnabled: rulebook.rtmEnabled,
        }),
        JSON.stringify({ notes: rulebook.notes, limitations: rulebook.limitations }),
        at,
      );
    }
    const placeholders = RULEBOOKS.map(() => "?").join(",");
    db.prepare(
      `DELETE FROM rulebooks
       WHERE id NOT IN (${placeholders})
         AND id NOT IN (SELECT DISTINCT rulebook_id FROM auction_sessions)`,
    ).run(...RULEBOOKS.map((rulebook) => rulebook.id));
  });
  sync();
}

export function getDbPath(): string {
  return process.env.IPL_DB_PATH ?? path.join(process.cwd(), "data", "ipl-arena.db");
}

export function databaseExists(): boolean {
  return fs.existsSync(getDbPath());
}

export function getDb(): Database.Database {
  if (globalForDb.__arenaDb) return globalForDb.__arenaDb;

  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Auction database not found at ${dbPath}. Run "npm run import-data" to build it from the supplied datasets.`,
    );
  }

  const db = new Database(dbPath, { fileMustExist: true });
  // The dev bundler watches this directory; WAL sidecar files can be locked mid-write and break builds.
  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = FULL");
  db.pragma("cache_size = -65536");
  db.pragma("mmap_size = 268435456");
  db.pragma("temp_store = MEMORY");
  ensureLobbySchema(db);
  syncRulebooks(db);
  globalForDb.__arenaDb = db;
  return db;
}

export function closeDb(): void {
  if (globalForDb.__arenaDb) {
    globalForDb.__arenaDb.close();
    globalForDb.__arenaDb = undefined;
    clearStaticCache();
  }
}

export function resetDbConnection(): void {
  closeDb();
}
