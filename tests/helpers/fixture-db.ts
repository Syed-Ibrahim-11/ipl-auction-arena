import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "../../src/db/schema";
import { RULEBOOKS } from "../../src/lib/rules";

export const TEAM_IDS = [
  "team-a",
  "team-b",
  "team-c",
  "team-d",
  "team-e",
  "team-f",
  "team-g",
  "team-h",
  "team-i",
  "team-j",
] as const;

interface FixturePlayer {
  id: string;
  name: string;
  shortName: string;
  role: "batter" | "bowler" | "all-rounder" | "wicketkeeper";
  overseas: number;
  capped: number;
  teamId: string;
  ovr: number;
  basePriceLakh: number;
}

const PLAYERS: FixturePlayer[] = [
  {
    id: "p1",
    name: "Alpha Star",
    shortName: "A Star",
    role: "batter",
    overseas: 0,
    capped: 1,
    teamId: "team-a",
    ovr: 90,
    basePriceLakh: 200,
  },
  {
    id: "p2",
    name: "Beta Bowler",
    shortName: "B Bowler",
    role: "bowler",
    overseas: 0,
    capped: 1,
    teamId: "team-b",
    ovr: 70,
    basePriceLakh: 100,
  },
  {
    id: "p3",
    name: "Gamma Overseas",
    shortName: "G Overseas",
    role: "all-rounder",
    overseas: 1,
    capped: 1,
    teamId: "team-c",
    ovr: 80,
    basePriceLakh: 200,
  },
  {
    id: "p4",
    name: "Delta Bargain",
    shortName: "D Bargain",
    role: "batter",
    overseas: 0,
    capped: 0,
    teamId: "team-d",
    ovr: 55,
    basePriceLakh: 30,
  },
];

export interface FixtureDatabase {
  db: Database.Database;
  dbPath: string;
  tempDir: string;
  close: () => void;
}

export function createFixtureDatabase(options: { playerCount?: number } = {}): FixtureDatabase {
  const playerCount = Math.min(PLAYERS.length, Math.max(1, options.playerCount ?? PLAYERS.length));
  const players = PLAYERS.slice(0, playerCount);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ipl-arena-test-"));
  const dbPath = path.join(tempDir, "fixture.db");
  process.env.IPL_DB_PATH = dbPath;

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  const now = new Date().toISOString();

  const insertTeam = db.prepare(
    `INSERT INTO teams (id, name, short_name, city, primary_color, secondary_color, ink_color, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  TEAM_IDS.forEach((id, index) => {
    const letter = String.fromCharCode(65 + index);
    insertTeam.run(id, `Test Team ${letter}`, `T${letter}`, `Test City ${letter}`, "#111111", "#eeeeee", "#ffffff");
  });

  const insertRulebook = db.prepare(
    `INSERT INTO rulebooks (
       id, name, season, auction_type, status, purse_cap_lakh, purse_cap_verified, squad_min, squad_max,
       overseas_max, rtm_cards, increments_json, sources_json, notes, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const rulebook of RULEBOOKS) {
    insertRulebook.run(
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
      now,
    );
  }

  const insertPlayer = db.prepare(
    `INSERT INTO players (
       id, full_name, short_name, is_overseas, capped, role, role_source, primary_team_id, data_status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'test-fixture', ?, 'registry_only', ?)`,
  );
  const insertAuctionPlayer = db.prepare(
    `INSERT INTO auction_players (
       player_id, auction_year, base_price_lakh, base_price_verified, source, notes
     ) VALUES (?, 2026, ?, 1, 'test-fixture', 'Synthetic fixture used only by automated tests.')`,
  );
  const insertRating = db.prepare(
    `INSERT INTO player_rating_versions (
       player_id, as_of_season, formula_version, role, ovr, batting, bowling, fielding,
       evidence_quality, breakdown_json, sample_json, computed_at
     ) VALUES (?, ?, 'test-fixture', ?, ?, ?, ?, ?, 'strong', '{}', '{}', ?)`,
  );
  const insertMatch = db.prepare(
    `INSERT INTO matches (id, season, date, team1_id, team2_id, stage, source)
     VALUES (?, 2025, ?, ?, ?, 'League', 'test-fixture')`,
  );
  const insertMatchStat = db.prepare(
    `INSERT INTO player_match_stats (player_id, match_id, season, date, team_id, opponent_team_id)
     VALUES (?, ?, 2025, ?, ?, ?)`,
  );

  players.forEach((player, index) => {
    insertPlayer.run(
      player.id,
      player.name,
      player.shortName,
      player.overseas,
      player.capped,
      player.role,
      player.teamId,
      now,
    );
    insertAuctionPlayer.run(player.id, player.basePriceLakh);
    for (const season of [2024, 2025]) {
      insertRating.run(
        player.id,
        season,
        player.role,
        player.ovr,
        Math.max(25, player.ovr - 5),
        player.role === "bowler" || player.role === "all-rounder" ? Math.max(25, player.ovr - 4) : null,
        Math.max(25, player.ovr - 10),
        now,
      );
    }
    const opponent = player.teamId === "team-a" ? "team-b" : "team-a";
    const matchId = `match-${player.id}`;
    const date = `2025-04-0${index + 1}`;
    insertMatch.run(matchId, date, player.teamId, opponent);
    insertMatchStat.run(player.id, matchId, date, player.teamId, opponent);
  });

  return {
    db,
    dbPath,
    tempDir,
    close: () => {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
      delete process.env.IPL_DB_PATH;
    },
  };
}
