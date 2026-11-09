import type Database from "better-sqlite3";
import type { AuctionMode, AiProfileId } from "./modes";
import { getAuctionMode } from "./modes";
import type {
  AuctionSessionConfig,
  AuctionSessionStatus,
  SnapshotEvidence,
  SnapshotPlayer,
  SnapshotRulebook,
  SnapshotTeamRoleCounts,
} from "./types";
import { maxAffordableBid, poolReserveLakh, type RoleCounts, type SquadRules } from "./valuation";
import { marketValueFor } from "@/lib/market-value";
import type { IncrementSlab } from "@/lib/rules";
import {
  battingAverage,
  battingStrikeRate,
  bowlingAverage,
  economyRate,
} from "@/lib/data/stats";

export type Db = Database.Database;

export class AuctionError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AuctionError";
    this.code = code;
    this.status = status;
  }
}

export interface SessionRow {
  id: string;
  name: string;
  mode: string;
  season: number;
  rulebook_id: string;
  status: string;
  user_team_id: string | null;
  current_lot_id: string | null;
  pool_source: string;
  total_lots: number;
  completed_lots: number;
  purse_cap_lakh: number;
  squad_min: number;
  squad_max: number;
  overseas_max: number;
  rtm_cards: number;
  config_json: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface RulebookRow {
  id: string;
  name: string;
  season: number;
  auction_type: string;
  status: string;
  purse_cap_lakh: number;
  purse_cap_verified: number;
  squad_min: number;
  squad_max: number;
  overseas_max: number;
  rtm_cards: number;
  increments_json: string;
  sources_json: string;
  notes: string | null;
  updated_at: string;
}

export interface SessionTeamRow {
  session_id: string;
  team_id: string;
  is_human: number;
  opening_purse_lakh: number;
  purse_lakh: number;
  spent_lakh: number;
  pre_existing_value_lakh: number;
  rtm_remaining: number;
  ai_profile: string;
  team_name: string;
  short_name: string;
  city: string | null;
  primary_color: string;
  secondary_color: string;
  ink_color: string;
}

export interface SquadRow {
  session_id: string;
  team_id: string;
  player_id: string;
  price_lakh: number;
  price_verified: number;
  acquired_via: string;
  created_at: string;
  full_name: string;
  short_name: string;
  role: string;
  is_overseas: number | null;
  capped: number | null;
}

export interface LotRow {
  id: string;
  session_id: string;
  lot_number: number;
  player_id: string;
  set_name: string | null;
  base_price_lakh: number;
  base_price_verified: number;
  status: string;
  current_bid_lakh: number | null;
  leader_team_id: string | null;
  original_team_id: string | null;
  rtm_available: number;
  rtm_status: string | null;
  revised_price_lakh: number | null;
  quiet_ticks: number;
  bid_count: number;
  opened_at: string | null;
  closing_at: string | null;
  resolved_at: string | null;
  winning_team_id: string | null;
  final_price_lakh: number | null;
  sold_via: string | null;
}

export interface PlayerRow {
  id: string;
  cricsheet_id: string | null;
  full_name: string;
  short_name: string;
  nationality: string | null;
  country: string | null;
  is_overseas: number | null;
  capped: number | null;
  birth_date: string | null;
  role: string;
  role_source: string | null;
  batting_style: string | null;
  bowling_style: string | null;
  primary_team_id: string | null;
  data_status: string;
  wikidata_id: string | null;
  wikidata_retrieved_at: string | null;
  created_at: string;
}

export interface RatingRow {
  player_id: string;
  formula_version: string;
  as_of_season: number;
  role: string;
  ovr: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  evidence_quality: string;
  breakdown_json: string;
  sample_json: string;
}

export interface AuctionRow {
  player_id: string;
  auction_year: number;
  base_price_lakh: number;
  base_price_verified: number;
  winning_bid_lakh: number | null;
  buyer_team_id: string | null;
  buyer_team_name: string | null;
  capped_label: string | null;
  nationality_label: string | null;
  source: string;
  original_team_id: string | null;
  original_team_source: string | null;
  rtm_eligible: number;
  notes: string | null;
}

export interface TeamContext {
  team: SessionTeamRow;
  squadSize: number;
  overseasCount: number;
  retainedCount: number;
  roleCounts: SnapshotTeamRoleCounts;
}

export interface RulebookMeta {
  rtmEnabled?: boolean;
  incrementsVerified?: boolean;
  sources?: unknown[];
}

export interface UpcomingLotRow {
  id: string;
  lot_number: number;
  set_name: string | null;
  base_price_lakh: number;
  player_id: string;
  full_name: string;
  role: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function loadSession(db: Db, sessionId: string): SessionRow {
  const row = db.prepare("SELECT * FROM auction_sessions WHERE id = ?").get(sessionId) as
    | SessionRow
    | undefined;
  if (!row) throw new AuctionError("SESSION_NOT_FOUND", "That auction session could not be found.", 404);
  return row;
}

export function loadSessionForUpdate(db: Db, sessionId: string): SessionRow {
  return loadSession(db, sessionId);
}

export function loadRulebook(db: Db, rulebookId: string): RulebookRow {
  const row = db.prepare("SELECT * FROM rulebooks WHERE id = ?").get(rulebookId) as
    | RulebookRow
    | undefined;
  if (!row) {
    throw new AuctionError("RULEBOOK_NOT_FOUND", "The rulebook for this session is missing.", 500);
  }
  return row;
}

export function resolveMode(session: SessionRow): AuctionMode {
  const mode = getAuctionMode(session.mode);
  if (!mode) {
    throw new AuctionError("MODE_NOT_FOUND", "That auction mode is not supported.", 500);
  }
  return mode;
}

export function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadSessionConfig(session: SessionRow): AuctionSessionConfig {
  const mode = resolveMode(session);
  const fallback: AuctionSessionConfig = {
    mode: mode.id,
    pool: mode.pool,
    retentionKind: mode.retentionKind,
    minSquadExempt: mode.minSquadExempt,
    simulatedBasePrices: mode.simulatedBasePrices,
    simulatedRetention: mode.simulatedRetention,
    retentionNote: null,
    asOfSeason: mode.asOfSeason,
    seed: 1,
  };
  const config = parseJson<AuctionSessionConfig | null>(session.config_json, null);
  if (!config || typeof config.seed !== "number") return fallback;
  return { ...fallback, ...config };
}

export function rulebookMeta(row: RulebookRow): RulebookMeta {
  return parseJson<RulebookMeta>(row.sources_json, {});
}

export function incrementSlabs(row: RulebookRow): IncrementSlab[] {
  const parsed = parseJson<IncrementSlab[]>(row.increments_json, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (slab) =>
      slab &&
      typeof slab.incrementLakh === "number" &&
      slab.incrementLakh > 0 &&
      (slab.upToLakh === null || typeof slab.upToLakh === "number"),
  );
}

export function snapshotRulebook(
  row: RulebookRow,
  mode: AuctionMode,
  slabs: IncrementSlab[],
): SnapshotRulebook {
  const meta = rulebookMeta(row);
  return {
    id: row.id,
    name: row.name,
    season: row.season,
    auctionType: row.auction_type,
    status: row.status,
    purseCapLakh: row.purse_cap_lakh,
    purseCapVerified: row.purse_cap_verified === 1,
    squadMin: row.squad_min,
    squadMax: row.squad_max,
    overseasMax: row.overseas_max,
    rtmCards: row.rtm_cards,
    rtmEnabled: meta.rtmEnabled ?? mode.rtmEnabled,
    incrementsVerified: meta.incrementsVerified === true,
    increments: slabs,
  };
}

export function squadRules(row: RulebookRow, minSquadExempt: boolean): SquadRules {
  return {
    minSquad: row.squad_min,
    maxSquad: row.squad_max,
    overseasMax: row.overseas_max,
    minSquadExempt,
  };
}

export function sessionSquadRules(session: SessionRow, rules: RulebookRow): SquadRules {
  return squadRules(rules, loadSessionConfig(session).minSquadExempt);
}

export function loadSessionTeams(db: Db, sessionId: string): SessionTeamRow[] {
  return db
    .prepare(
      `SELECT st.session_id, st.team_id, st.is_human, st.opening_purse_lakh, st.purse_lakh,
              st.spent_lakh, st.pre_existing_value_lakh, st.rtm_remaining, st.ai_profile,
              t.name AS team_name, t.short_name, t.city, t.primary_color, t.secondary_color, t.ink_color
       FROM session_teams st
       JOIN teams t ON t.id = st.team_id
       WHERE st.session_id = ?
       ORDER BY t.name`,
    )
    .all(sessionId) as SessionTeamRow[];
}

export function loadSquads(db: Db, sessionId: string): SquadRow[] {
  return db
    .prepare(
      `SELECT ss.session_id, ss.team_id, ss.player_id, ss.price_lakh, ss.price_verified,
              ss.acquired_via, ss.created_at,
              p.full_name, p.short_name, p.role, p.is_overseas, p.capped
       FROM session_squads ss
       JOIN players p ON p.id = ss.player_id
       WHERE ss.session_id = ?
       ORDER BY ss.price_lakh DESC, p.full_name`,
    )
    .all(sessionId) as SquadRow[];
}

export function emptyRoleCounts(): SnapshotTeamRoleCounts {
  return { batter: 0, bowler: 0, allRounder: 0, wicketkeeper: 0, unknown: 0 };
}

export function addRole(counts: SnapshotTeamRoleCounts, role: string): void {
  if (role === "batter") counts.batter += 1;
  else if (role === "bowler") counts.bowler += 1;
  else if (role === "all-rounder") counts.allRounder += 1;
  else if (role === "wicketkeeper") counts.wicketkeeper += 1;
  else counts.unknown += 1;
}

export function roleCountsForValuation(counts: SnapshotTeamRoleCounts): RoleCounts {
  return {
    batter: counts.batter,
    bowler: counts.bowler,
    allRounder: counts.allRounder,
    wicketkeeper: counts.wicketkeeper,
    unknown: counts.unknown,
  };
}

export function buildTeamContexts(
  teams: SessionTeamRow[],
  squads: SquadRow[],
): Map<string, TeamContext> {
  const contexts = new Map<string, TeamContext>();
  for (const team of teams) {
    contexts.set(team.team_id, {
      team,
      squadSize: 0,
      overseasCount: 0,
      retainedCount: 0,
      roleCounts: emptyRoleCounts(),
    });
  }
  for (const squad of squads) {
    const context = contexts.get(squad.team_id);
    if (!context) continue;
    context.squadSize += 1;
    if (squad.is_overseas === 1) context.overseasCount += 1;
    if (squad.acquired_via.startsWith("retained-")) context.retainedCount += 1;
    addRole(context.roleCounts, squad.role);
  }
  return contexts;
}

export function teamBidLimits(
  context: TeamContext,
  rules: SquadRules,
  isOverseas: boolean,
  poolBasePricesLakh?: number[] | null,
): ReturnType<typeof maxAffordableBid> {
  return maxAffordableBid({
    purseLakh: context.team.purse_lakh,
    squadSize: context.squadSize,
    overseasCount: context.overseasCount,
    isOverseas,
    rules,
    reserveLakh: poolReserveLakh({
      squadSize: context.squadSize,
      rules,
      poolBasePricesLakh,
    }),
  });
}

/** Base prices of every lot still to come; used to price a legal squad fill. */
export function pendingBasePrices(db: Db, sessionId: string): number[] {
  const rows = db
    .prepare(
      "SELECT base_price_lakh FROM auction_lots WHERE session_id = ? AND status = 'pending' ORDER BY base_price_lakh ASC",
    )
    .all(sessionId) as Array<{ base_price_lakh: number }>;
  return rows.map((row) => row.base_price_lakh);
}

export function loadPlayer(db: Db, playerId: string): PlayerRow {
  const row = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId) as PlayerRow | undefined;
  if (!row) throw new AuctionError("PLAYER_NOT_FOUND", "That player could not be found.", 404);
  return row;
}

export function loadRating(db: Db, playerId: string, asOfSeason: number): RatingRow | null {
  return (
    (db
      .prepare("SELECT * FROM player_rating_versions WHERE player_id = ? AND as_of_season = ?")
      .get(playerId, asOfSeason) as RatingRow | undefined) ?? null
  );
}

interface EvidenceRow {
  seasons: number;
  matches: number | null;
  innings_bat: number | null;
  runs: number | null;
  balls_faced: number | null;
  dismissals: number | null;
  high_score: number | null;
  fours: number | null;
  sixes: number | null;
  innings_bowl: number | null;
  balls_bowled: number | null;
  runs_conceded: number | null;
  wickets: number | null;
  catches: number | null;
  stumpings: number | null;
}

export function loadEvidence(db: Db, playerId: string, asOfSeason: number): SnapshotEvidence | null {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT season) AS seasons,
              SUM(matches) AS matches,
              SUM(innings_bat) AS innings_bat,
              SUM(runs) AS runs,
              SUM(balls_faced) AS balls_faced,
              SUM(dismissals) AS dismissals,
              MAX(high_score) AS high_score,
              SUM(fours) AS fours,
              SUM(sixes) AS sixes,
              SUM(innings_bowl) AS innings_bowl,
              SUM(balls_bowled) AS balls_bowled,
              SUM(runs_conceded) AS runs_conceded,
              SUM(wickets) AS wickets,
              SUM(catches) AS catches,
              SUM(stumpings) AS stumpings
       FROM player_season_stats
       WHERE player_id = ? AND season <= ?`,
    )
    .get(playerId, asOfSeason) as EvidenceRow | undefined;
  if (!row || !row.matches) return null;
  const runs = row.runs ?? 0;
  const ballsFaced = row.balls_faced ?? 0;
  const dismissals = row.dismissals ?? 0;
  const ballsBowled = row.balls_bowled ?? 0;
  const runsConceded = row.runs_conceded ?? 0;
  const wickets = row.wickets ?? 0;
  return {
    matches: row.matches,
    inningsBat: row.innings_bat ?? 0,
    runs,
    ballsFaced,
    strikeRate: battingStrikeRate(runs, ballsFaced),
    average: battingAverage(runs, dismissals),
    highScore: row.high_score ?? 0,
    fours: row.fours ?? 0,
    sixes: row.sixes ?? 0,
    inningsBowl: row.innings_bowl ?? 0,
    ballsBowled,
    wickets,
    economy: economyRate(runsConceded, ballsBowled),
    bowlingAverage: bowlingAverage(runsConceded, wickets),
    catches: row.catches ?? 0,
    stumpings: row.stumpings ?? 0,
    seasons: row.seasons ?? 0,
  };
}

export function loadAuctionRows(
  db: Db,
  playerId: string,
  includeActual: boolean,
): AuctionRow[] {
  if (!includeActual) return [];
  return db
    .prepare(
      `SELECT ap.*, t.name AS buyer_team_name
       FROM auction_players ap
       LEFT JOIN teams t ON t.id = ap.buyer_team_id
       WHERE ap.player_id = ?
       ORDER BY ap.auction_year DESC`,
    )
    .all(playerId) as AuctionRow[];
}

function ageOn(birthDate: string | null, reference: string): number | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const ref = new Date(reference);
  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  const month = ref.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && ref.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function loadPlayerDetail(
  db: Db,
  playerId: string,
  asOfSeason: number,
  includeActual: boolean,
  referenceDate = nowIso(),
): SnapshotPlayer | null {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId) as
    | PlayerRow
    | undefined;
  if (!player) return null;
  const rating = loadRating(db, playerId, asOfSeason);
  const evidence = loadEvidence(db, playerId, asOfSeason);
  const auctions = loadAuctionRows(db, playerId, includeActual);
  const age = ageOn(player.birth_date, referenceDate);
  const sample = parseJson<{ seasons?: number; lastSeason?: number | null }>(rating?.sample_json ?? null, {});
  const marketValue = marketValueFor({
    ovr: rating?.ovr ?? null,
    batting: rating?.batting ?? null,
    bowling: rating?.bowling ?? null,
    role: rating?.role ?? player.role,
    age,
    evidenceQuality: rating?.evidence_quality ?? null,
    isOverseas: player.is_overseas === 1,
    seasons: sample.seasons ?? evidence?.seasons ?? null,
    lastSeason: sample.lastSeason ?? null,
    asOfSeason: rating?.as_of_season ?? asOfSeason,
  });
  return {
    id: player.id,
    name: player.full_name,
    shortName: player.short_name,
    role: player.role,
    roleSource: player.role_source ?? "unknown",
    birthDate: player.birth_date,
    age,
    country: player.country ?? player.nationality,
    isOverseas: player.is_overseas === null ? null : player.is_overseas === 1,
    capped: player.capped === null ? null : player.capped === 1,
    primaryTeamId: player.primary_team_id,
    rating: rating
      ? {
          ovr: rating.ovr,
          batting: rating.batting,
          bowling: rating.bowling,
          fielding: rating.fielding,
          role: rating.role,
          evidenceQuality: rating.evidence_quality,
          asOfSeason: rating.as_of_season,
          formulaVersion: rating.formula_version,
        }
      : null,
    marketValue,
    evidence,
    dataStatus: player.data_status,
    auctions: auctions.map((auction) => ({
      year: auction.auction_year,
      basePriceLakh: auction.base_price_lakh,
      winningBidLakh: auction.winning_bid_lakh,
      buyerTeamId: auction.buyer_team_id,
      buyerTeamName: auction.buyer_team_name,
      basePriceVerified: auction.base_price_verified === 1,
    })),
  };
}

export function loadLot(db: Db, lotId: string): LotRow {
  const row = db.prepare("SELECT * FROM auction_lots WHERE id = ?").get(lotId) as LotRow | undefined;
  if (!row) throw new AuctionError("LOT_NOT_FOUND", "That auction lot could not be found.", 404);
  return row;
}

export function loadCurrentLot(db: Db, session: SessionRow): LotRow | null {
  if (!session.current_lot_id) return null;
  return (db.prepare("SELECT * FROM auction_lots WHERE id = ?").get(session.current_lot_id) as
    | LotRow
    | undefined) ?? null;
}

export function pendingLotCount(db: Db, sessionId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM auction_lots WHERE session_id = ? AND status = 'pending'")
    .get(sessionId) as { count: number };
  return row.count;
}

export function nextPendingLot(db: Db, sessionId: string, lotNumber: number): LotRow | null {
  return (
    (db
      .prepare(
        "SELECT * FROM auction_lots WHERE session_id = ? AND status = 'pending' AND lot_number > ? ORDER BY lot_number LIMIT 1",
      )
      .get(sessionId, lotNumber) as LotRow | undefined) ?? null
  );
}

export function upcomingLots(db: Db, sessionId: string, limit = 5): UpcomingLotRow[] {
  return db
    .prepare(
      `SELECT l.id, l.lot_number, l.set_name, l.base_price_lakh, l.player_id, p.full_name, p.role
       FROM auction_lots l
       JOIN players p ON p.id = l.player_id
       WHERE l.session_id = ? AND l.status = 'pending'
       ORDER BY l.lot_number
       LIMIT ?`,
    )
    .all(sessionId, limit) as UpcomingLotRow[];
}

export function insertEvent(
  db: Db,
  sessionId: string,
  type: string,
  message: string,
  options?: {
    lotId?: string | null;
    payload?: Record<string, unknown> | null;
    createdAt?: string;
  },
): void {
  db.prepare(
    `INSERT INTO auction_events (session_id, lot_id, type, message, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    sessionId,
    options?.lotId ?? null,
    type,
    message,
    options?.payload ? JSON.stringify(options.payload) : null,
    options?.createdAt ?? nowIso(),
  );
}

export function touchSession(db: Db, sessionId: string, at = nowIso()): void {
  db.prepare("UPDATE auction_sessions SET updated_at = ? WHERE id = ?").run(at, sessionId);
}

export function setSessionCompleted(db: Db, sessionId: string, at = nowIso()): void {
  db.prepare(
    "UPDATE auction_sessions SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
  ).run(at, at, sessionId);
}

export function isResolvedLot(lot: LotRow): boolean {
  return lot.status === "sold" || lot.status === "unsold";
}

export function isAuctionPlayerCapped(
  capped: number | null,
  label: string | null | undefined,
): boolean | null {
  if (capped !== null) return capped === 1;
  if (label === "Capped") return true;
  if (label === "Uncapped") return false;
  return null;
}

export function profileIdForTeam(team: SessionTeamRow): AiProfileId {
  const value = team.ai_profile;
  if (
    value === "balanced" ||
    value === "aggressive" ||
    value === "analytical" ||
    value === "conservative" ||
    value === "maverick"
  ) {
    return value;
  }
  return "balanced";
}

export function teamNamesMap(db: Db): Map<string, string> {
  const rows = db.prepare("SELECT id, name, short_name FROM teams").all() as Array<{
    id: string;
    name: string;
    short_name: string;
  }>;
  return new Map(rows.map((row) => [row.id, row.name]));
}

export function teamShortNamesMap(db: Db): Map<string, string> {
  const rows = db.prepare("SELECT id, name, short_name FROM teams").all() as Array<{
    id: string;
    name: string;
    short_name: string;
  }>;
  return new Map(rows.map((row) => [row.id, row.short_name]));
}

export function loadActualAuction(db: Db, playerId: string): AuctionRow | null {
  return (
    (db
      .prepare(
        `SELECT ap.*, t.name AS buyer_team_name
         FROM auction_players ap
         LEFT JOIN teams t ON t.id = ap.buyer_team_id
         WHERE ap.player_id = ?
         ORDER BY ap.auction_year DESC
         LIMIT 1`,
      )
      .get(playerId) as AuctionRow | undefined) ?? null
  );
}

export function asSessionStatus(status: string): AuctionSessionStatus {
  if (status === "lobby") return "lobby";
  if (status === "completed") return "completed";
  if (status === "abandoned") return "abandoned";
  return "active";
}

/** How long a seated human may be silent before the AI caretaker bids for them. */
export const AUTOPILOT_AFTER_MS = 60_000;

/** A claimed seat whose manager stopped polling is played by the AI instead of stalling the room. */
export function isSeatAutopiloted(
  db: Db,
  sessionId: string,
  teamId: string,
  now = Date.now(),
): boolean {
  const lobby = db
    .prepare("SELECT status FROM auction_lobbies WHERE session_id = ?")
    .get(sessionId) as { status: string } | undefined;
  if (!lobby || lobby.status !== "live") return false;
  const participant = db
    .prepare("SELECT last_seen_at FROM auction_participants WHERE session_id = ? AND team_id = ?")
    .get(sessionId, teamId) as { last_seen_at: string } | undefined;
  if (!participant) return true;
  const seen = Date.parse(participant.last_seen_at);
  return !Number.isFinite(seen) || now - seen > AUTOPILOT_AFTER_MS;
}
