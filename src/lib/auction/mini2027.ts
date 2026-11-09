import type { Db } from "./internal";
import { AuctionError } from "./internal";
import type { RetainedPlayer } from "./retention";
import { OFFICIAL_2026_DEALS, type OfficialDeal } from "./official-2026-deals";

/**
 * 2027 mini-auction retention model.
 *
 * Each franchise's 2026 squad comes from the official ESPNcricinfo sold list:
 * pre-auction retentions plus every auction buy, each with its real contract
 * value. A retained player is charged exactly that value; players who only
 * appear in the simulator's appearance roster fall back to an estimate.
 *
 * Franchises normally keep a core of 6-8 players, so the recommendation aims
 * for seven and never spends more than 55% of the purse on retentions.
 */

export type RetentionSource = "contract-2026" | "estimate";

export type RetentionOption = {
  playerId: string;
  name: string;
  role: string;
  isOverseas: boolean;
  contractLakh: number;
  source: RetentionSource;
  auctionPriceLakh: number | null;
};

export type RetentionTeam = {
  teamId: string;
  name: string;
  shortName: string;
  players: RetentionOption[];
  defaultIds: string[];
};

type PlayerRow = {
  id: string;
  full_name: string;
  role: string;
  is_overseas: number | null;
  capped: number | null;
  ovr: number | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
};

type AppearanceRow = {
  team_id: string;
  player_id: string;
};

type ContractPlayer = {
  teamId: string;
  playerId: string;
  fullName: string;
  role: string;
  isOverseas: boolean;
  contractLakh: number;
  contractSource: RetentionSource;
  auctionPriceLakh: number | null;
  rating: number | null;
};

export type TeamRoster = {
  teamId: string;
  name: string;
  shortName: string;
  players: ContractPlayer[];
};

export const DEFAULT_RETENTION_TARGET = 7;
const RETENTION_TARGET_MIN = 6;
const RETENTION_TARGET_MAX = 8;
const RETENTION_BUDGET_RATIO = 0.55;
const SQUAD_MAX = 25;
const OVERSEAS_MAX = 8;

function estimatedContractLakh(row: { ovr: number | null; is_overseas: number | null; capped: number | null }): number {
  const ovr = row.ovr;
  let raw: number;
  if (ovr === null) raw = 80;
  else if (ovr >= 88) raw = 1_200;
  else if (ovr >= 82) raw = 950;
  else if (ovr >= 76) raw = 750;
  else if (ovr >= 70) raw = 550;
  else if (ovr >= 64) raw = 380;
  else if (ovr >= 58) raw = 260;
  else raw = 140;
  if (row.is_overseas === 1) raw *= 1.06;
  if (row.capped === 0) raw *= 0.92;
  return Math.max(30, Math.round(raw / 5) * 5);
}

function strength(player: ContractPlayer): number {
  return player.rating ?? 55;
}

/** AI franchises keep a natural 6-8 player core; the user's default is seven. */
export function retentionTargetForTeam(teamId: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < teamId.length; index += 1) {
    hash ^= teamId.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  const span = RETENTION_TARGET_MAX - RETENTION_TARGET_MIN + 1;
  return RETENTION_TARGET_MIN + (Math.abs(hash) % span);
}

/**
 * Official 2026 squads (25 players, 8 overseas) with contract values, topped up
 * from the simulator appearance roster only where ESPN has no matching player.
 */
export function loadMini2027Rosters(db: Db, asOfSeason: number, capLakh = 13_000): TeamRoster[] {
  const players = db
    .prepare(
      `SELECT p.id, p.full_name, p.role, p.is_overseas, p.capped, rv.ovr AS ovr
       FROM players p
       LEFT JOIN player_rating_versions rv ON rv.player_id = p.id AND rv.as_of_season = ?`,
    )
    .all(asOfSeason) as PlayerRow[];
  const byId = new Map(players.map((row) => [row.id, row]));

  const teams = db
    .prepare("SELECT id, name, short_name FROM teams WHERE active = 1 ORDER BY name")
    .all() as TeamRow[];

  const appearances = db
    .prepare(
      `WITH appearance_rank AS (
         SELECT ms.team_id, ms.player_id,
                ROW_NUMBER() OVER (
                  PARTITION BY ms.player_id
                  ORDER BY COUNT(*) DESC, MAX(ms.date) DESC, ms.team_id
                ) AS rn
         FROM player_match_stats ms
         WHERE ms.season = 2026
         GROUP BY ms.team_id, ms.player_id
       )
       SELECT team_id, player_id FROM appearance_rank WHERE rn = 1`,
    )
    .all() as AppearanceRow[];

  const dealsByTeam = new Map<string, OfficialDeal[]>();
  const covered = new Set<string>();
  for (const deal of OFFICIAL_2026_DEALS) {
    const list = dealsByTeam.get(deal.teamId) ?? [];
    list.push(deal);
    dealsByTeam.set(deal.teamId, list);
    covered.add(deal.playerId);
  }

  const extrasByTeam = new Map<string, AppearanceRow[]>();
  for (const row of appearances) {
    if (covered.has(row.player_id) || !byId.has(row.player_id)) continue;
    const list = extrasByTeam.get(row.team_id) ?? [];
    list.push(row);
    extrasByTeam.set(row.team_id, list);
  }

  const rosters: TeamRoster[] = [];
  for (const team of teams) {
    const candidates: ContractPlayer[] = [];
    for (const deal of dealsByTeam.get(team.id) ?? []) {
      const row = byId.get(deal.playerId);
      if (!row) continue;
      candidates.push({
        teamId: team.id,
        playerId: row.id,
        fullName: row.full_name,
        role: row.role === "unknown" ? deal.role : row.role,
        isOverseas: row.is_overseas === 1,
        contractLakh: deal.priceLakh,
        contractSource: "contract-2026",
        auctionPriceLakh: deal.priceLakh,
        rating: row.ovr,
      });
    }
    candidates.sort((a, b) => strength(b) - strength(a) || b.contractLakh - a.contractLakh);

    const extras = (extrasByTeam.get(team.id) ?? [])
      .map((entry) => byId.get(entry.player_id))
      .filter((row): row is PlayerRow => Boolean(row))
      .sort((a, b) => (b.ovr ?? 55) - (a.ovr ?? 55) || a.full_name.localeCompare(b.full_name));

    const officialTotal = candidates.reduce((sum, player) => sum + player.contractLakh, 0);
    const estimatedTotal = extras.reduce((sum, row) => sum + estimatedContractLakh(row), 0);
    const allowance = Math.max(0, capLakh - officialTotal);
    const scale = estimatedTotal > allowance && estimatedTotal > 0 ? allowance / estimatedTotal : 1;

    let overseas = candidates.filter((player) => player.isOverseas).length;
    for (const row of extras) {
      if (candidates.length >= SQUAD_MAX) break;
      const isOverseas = row.is_overseas === 1;
      if (isOverseas && overseas >= OVERSEAS_MAX) continue;
      candidates.push({
        teamId: team.id,
        playerId: row.id,
        fullName: row.full_name,
        role: row.role,
        isOverseas,
        contractLakh: Math.max(30, Math.round((estimatedContractLakh(row) * scale) / 5) * 5),
        contractSource: "estimate",
        auctionPriceLakh: null,
        rating: row.ovr,
      });
      if (isOverseas) overseas += 1;
    }

    if (candidates.length === 0) continue;
    rosters.push({ teamId: team.id, name: team.name, shortName: team.short_name, players: candidates });
  }

  return rosters;
}

/**
 * The recommended core: the strongest players that fit a 55% retention budget.
 * Franchises normally keep 6-8 players; the cheapest remaining names top up a
 * short core so nobody starts the auction with fewer than six retentions.
 */
export function defaultRetentionIds(
  players: ContractPlayer[],
  capLakh: number,
  overseasMax: number,
  target = DEFAULT_RETENTION_TARGET,
): string[] {
  const count = Math.min(RETENTION_TARGET_MAX, Math.max(RETENTION_TARGET_MIN, target));
  const budget = Math.floor(capLakh * RETENTION_BUDGET_RATIO);
  const sorted = [...players].sort(
    (a, b) => strength(b) - strength(a) || b.contractLakh - a.contractLakh,
  );
  const picked: string[] = [];
  let spend = 0;
  let overseas = 0;
  for (const player of sorted) {
    if (picked.length >= count) break;
    if (player.isOverseas && overseas >= overseasMax) continue;
    if (spend + player.contractLakh > budget) continue;
    picked.push(player.playerId);
    spend += player.contractLakh;
    if (player.isOverseas) overseas += 1;
  }

  if (picked.length < RETENTION_TARGET_MIN) {
    const chosen = new Set(picked);
    const cheapest = sorted
      .filter((player) => !chosen.has(player.playerId))
      .sort((a, b) => a.contractLakh - b.contractLakh);
    for (const player of cheapest) {
      if (picked.length >= RETENTION_TARGET_MIN) break;
      if (player.isOverseas && overseas >= overseasMax) continue;
      if (spend + player.contractLakh > capLakh) continue;
      picked.push(player.playerId);
      spend += player.contractLakh;
      if (player.isOverseas) overseas += 1;
    }
  }
  return picked;
}

export function loadRetentionTeams(db: Db, asOfSeason: number, capLakh: number, overseasMax: number): RetentionTeam[] {
  return loadMini2027Rosters(db, asOfSeason, capLakh).map((team) => ({
    teamId: team.teamId,
    name: team.name,
    shortName: team.shortName,
    players: team.players.map((player) => ({
      playerId: player.playerId,
      name: player.fullName,
      role: player.role,
      isOverseas: player.isOverseas,
      contractLakh: player.contractLakh,
      source: player.contractSource,
      auctionPriceLakh: player.auctionPriceLakh,
    })),
    defaultIds: defaultRetentionIds(team.players, capLakh, overseasMax),
  }));
}

/**
 * Retained-player count held by the nine AI franchises when a given team is the
 * user's, so the lobby can show the exact auction pool before the first bid.
 */
export function mini2027AiRetainedByTeam(
  db: Db,
  capLakh: number,
  overseasMax: number,
  asOfSeason: number,
): Record<string, number> {
  const rosters = loadMini2027Rosters(db, asOfSeason);
  const aiPicks = new Map<string, Set<string>>();
  const userPicks = new Map<string, Set<string>>();
  for (const team of rosters) {
    aiPicks.set(
      team.teamId,
      new Set(defaultRetentionIds(team.players, capLakh, overseasMax, retentionTargetForTeam(team.teamId))),
    );
    userPicks.set(team.teamId, new Set(defaultRetentionIds(team.players, capLakh, overseasMax)));
  }

  const byTeam: Record<string, number> = {};
  for (const team of rosters) {
    const union = new Set(userPicks.get(team.teamId));
    for (const [teamId, picks] of aiPicks) {
      if (teamId === team.teamId) continue;
      for (const playerId of picks) union.add(playerId);
    }
    byTeam[team.teamId] = union.size - (userPicks.get(team.teamId)?.size ?? 0);
  }
  return byTeam;
}

export type RetentionSelection = {
  retainedByTeam: Map<string, RetainedPlayer[]>;
  retainedIds: Set<string>;
  rosters: TeamRoster[];
};

/**
 * Applies the user's choice for their own franchise and a 6-8 player core for
 * every other franchise. Unchecked players stay in the global auction pool.
 */
export function chooseMini2027Retentions(
  db: Db,
  args: {
    userTeamId: string;
    retainedPlayerIds?: string[] | null;
    capLakh: number;
    squadMax: number;
    overseasMax: number;
    asOfSeason: number;
  },
): RetentionSelection {
  const rosters = loadMini2027Rosters(db, args.asOfSeason);
  const userTeam = rosters.find((team) => team.teamId === args.userTeamId);
  if (!userTeam) {
    throw new AuctionError("TEAM_NOT_FOUND", "Choose one of the ten active franchises.", 400);
  }

  const byPlayer = new Map(userTeam.players.map((player) => [player.playerId, player]));
  const requested =
    args.retainedPlayerIds === undefined || args.retainedPlayerIds === null
      ? defaultRetentionIds(userTeam.players, args.capLakh, args.overseasMax)
      : [...new Set(args.retainedPlayerIds)];

  if (requested.length > args.squadMax) {
    throw new AuctionError(
      "RETENTION_TOO_MANY",
      `A squad can hold at most ${args.squadMax} players. Deselect ${requested.length - args.squadMax}.`,
      400,
    );
  }

  const retainedByTeam = new Map<string, RetainedPlayer[]>();
  const retainedIds = new Set<string>();
  let spend = 0;
  let overseas = 0;

  const selected: RetainedPlayer[] = [];
  for (const playerId of requested) {
    const player = byPlayer.get(playerId);
    if (!player) {
      throw new AuctionError(
        "RETENTION_INVALID",
        "A selected player is not part of your 2026 squad.",
        400,
      );
    }
    if (player.isOverseas && overseas >= args.overseasMax) {
      throw new AuctionError(
        "RETENTION_OVERSEAS",
        `A squad can retain at most ${args.overseasMax} overseas players.`,
        400,
      );
    }
    spend += player.contractLakh;
    if (player.isOverseas) overseas += 1;
    selected.push({
      teamId: player.teamId,
      playerId: player.playerId,
      fullName: player.fullName,
      role: player.role,
      priceLakh: player.contractLakh,
      rating: player.rating,
      verified: player.contractSource === "contract-2026",
    });
  }

  if (spend > args.capLakh) {
    throw new AuctionError(
      "RETENTION_OVER_CAP",
      "Those retentions cost more than the auction purse. Deselect a player.",
      400,
    );
  }
  retainedByTeam.set(userTeam.teamId, selected);
  for (const player of selected) retainedIds.add(player.playerId);

  for (const team of rosters) {
    if (team.teamId === userTeam.teamId) continue;
    const picked = defaultRetentionIds(
      team.players,
      args.capLakh,
      args.overseasMax,
      retentionTargetForTeam(team.teamId),
    );
    const byId = new Map(team.players.map((player) => [player.playerId, player]));
    const retained = picked.map((playerId) => {
      const player = byId.get(playerId) as ContractPlayer;
      return {
        teamId: team.teamId,
        playerId: player.playerId,
        fullName: player.fullName,
        role: player.role,
        priceLakh: player.contractLakh,
        rating: player.rating,
        verified: player.contractSource === "contract-2026",
      } satisfies RetainedPlayer;
    });
    retainedByTeam.set(team.teamId, retained);
    for (const player of retained) retainedIds.add(player.playerId);
  }

  return { retainedByTeam, retainedIds, rosters };
}
