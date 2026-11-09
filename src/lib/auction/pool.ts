import type { AuctionMode } from "./modes";
import { simulatedBasePriceLakh } from "./valuation";
import type { Db } from "./internal";
import { hashUnit } from "./valuation";
import { CURRENT_PLAYER_SQL } from "@/lib/data/queries";
import { OFFICIAL_2026_DEALS } from "./official-2026-deals";

const OFFICIAL_BASE_PRICE_LAKH = new Map(
  OFFICIAL_2026_DEALS.filter((deal) => deal.basePriceLakh !== null).map((deal) => [
    deal.playerId,
    deal.basePriceLakh as number,
  ]),
);

/**
 * Released players must always reach the auction, so the 2027 pool also accepts
 * every player on an official 2026 squad even if he never batted or bowled that
 * season (Dhoni, for example).
 */
const OFFICIAL_DEAL_IDS = [...new Set(OFFICIAL_2026_DEALS.map((deal) => deal.playerId))];

/** Every player who can be called in the 2027 mini auction before retentions. */
export function mini2027PoolUniverseSize(db: Db): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM players p
       WHERE ${CURRENT_PLAYER_SQL} OR p.id IN (${OFFICIAL_DEAL_IDS.map(() => "?").join(",")})`,
    )
    .get(...OFFICIAL_DEAL_IDS) as { n: number } | undefined;
  return row?.n ?? 0;
}

export interface PoolEntry {
  playerId: string;
  fullName: string;
  role: string;
  capped: boolean | null;
  isOverseas: boolean | null;
  basePriceLakh: number;
  basePriceVerified: boolean;
  originalTeamId: string | null;
  rtmAvailable: boolean;
  setName: string;
  starScore: number;
  orderKey: number;
}

interface PoolRow {
  id: string;
  full_name: string;
  role: string;
  capped: number | null;
  is_overseas: number | null;
  ovr: number | null;
  auction_base_lakh: number | null;
  auction_base_verified: number | null;
  capped_label: string | null;
}

const ROLE_TITLE: Record<string, string> = {
  batter: "Batters",
  bowler: "Bowlers",
  "all-rounder": "All-rounders",
  wicketkeeper: "Wicketkeepers",
  unknown: "Uncategorised",
};

const ROLE_ORDER: Record<string, number> = {
  batter: 0,
  "all-rounder": 1,
  wicketkeeper: 2,
  bowler: 3,
  unknown: 4,
};

function setFor(row: PoolRow, marquee: boolean): string {
  if (marquee) return "Marquee";
  const role = ROLE_TITLE[row.role] ?? ROLE_TITLE.unknown;
  const capped =
    row.capped === 1 || row.capped_label === "Capped"
      ? "Capped"
      : row.capped === 0 || row.capped_label === "Uncapped"
        ? "Uncapped"
        : "Open pool";
  return `${capped} · ${role}`;
}

function setRank(setName: string): number {
  if (setName === "Marquee") return 0;
  const [status, role] = setName.split(" · ");
  const statusRank = status === "Capped" ? 0 : status === "Uncapped" ? 1 : 2;
  return 1 + statusRank * 5 + (ROLE_ORDER[role] ?? 4);
}

export function buildPool(
  db: Db,
  mode: AuctionMode,
  seed: number,
  activeTeamIds: Set<string>,
  excludedPlayerIds: Set<string> = new Set(),
): PoolEntry[] {
  const poolFilter =
    mode.pool === "auction-2026"
      ? "ap.player_id IS NOT NULL"
      : mode.pool === "released-2027"
        ? `(${CURRENT_PLAYER_SQL} OR p.id IN (${OFFICIAL_DEAL_IDS.map(() => "?").join(",")}))`
        : CURRENT_PLAYER_SQL;

  const rows = db
    .prepare(
      `SELECT p.id, p.full_name, p.role, p.capped, p.is_overseas, r.ovr,
              ap.base_price_lakh AS auction_base_lakh,
              ap.base_price_verified AS auction_base_verified,
              ap.capped_label
       FROM players p
       LEFT JOIN auction_players ap ON ap.player_id = p.id AND ap.auction_year = 2026
       LEFT JOIN player_rating_versions r ON r.player_id = p.id AND r.as_of_season = ?
       WHERE ${poolFilter}
       ORDER BY p.full_name`,
    )
    .all(
      mode.asOfSeason,
      ...(mode.pool === "released-2027" ? OFFICIAL_DEAL_IDS : []),
    ) as PoolRow[];

  const eligible = excludedPlayerIds.size > 0
    ? rows.filter((row) => !excludedPlayerIds.has(row.id))
    : rows;

  const originalTeams = new Map<string, string>();
  if (mode.rtmEnabled) {
    // RTM eligibility follows the player's most recent official franchise.
    // The 2026 squad list is authoritative for the 2026 mega draft; older
    // datasets fall back to the latest 2025 appearance.
    for (const deal of OFFICIAL_2026_DEALS) originalTeams.set(deal.playerId, deal.teamId);
    const latest = db
      .prepare(
        `WITH appearances AS (
           SELECT pm.player_id, pm.team_id,
                  ROW_NUMBER() OVER (
                    PARTITION BY pm.player_id ORDER BY pm.date DESC, pm.match_id DESC
                  ) AS rn
           FROM player_match_stats pm
           WHERE pm.season = 2025
         )
         SELECT player_id, team_id FROM appearances WHERE rn = 1`,
      )
      .all() as Array<{ player_id: string; team_id: string }>;
    for (const row of latest) {
      if (!originalTeams.has(row.player_id)) originalTeams.set(row.player_id, row.team_id);
    }
  }

  const cappedFlags = new Map<string, boolean | null>();
  for (const row of eligible) {
    const label = row.capped_label;
    cappedFlags.set(
      row.id,
      row.capped !== null
        ? row.capped === 1
        : label === "Capped"
          ? true
          : label === "Uncapped"
            ? false
            : null,
    );
  }

  const ranked = eligible
    .map((row) => {
      const capped = cappedFlags.get(row.id) ?? null;
      const officialBase = OFFICIAL_BASE_PRICE_LAKH.get(row.id) ?? null;
      const basePriceLakh =
        officialBase ??
        (row.auction_base_lakh !== null
          ? row.auction_base_lakh
          : simulatedBasePriceLakh({
              ovr: row.ovr,
              capped,
              role: row.role,
              isOverseas: row.is_overseas === null ? null : row.is_overseas === 1,
            }));
      const starScore =
        row.ovr ??
        (row.auction_base_lakh !== null
          ? 48 + Math.min(12, row.auction_base_lakh / 20)
          : 45);
      return {
        row,
        capped,
        basePriceLakh,
        basePriceVerified:
          officialBase !== null || (row.auction_base_lakh !== null && row.auction_base_verified === 1),
        starScore,
      };
    })
    .sort((a, b) => b.starScore - a.starScore || a.row.full_name.localeCompare(b.row.full_name));

  const marqueeIds = new Set(ranked.slice(0, 12).map((entry) => entry.row.id));

  const entries = ranked.map((entry) => {
    const originalTeamId = originalTeams.get(entry.row.id) ?? null;
    const setName = setFor(entry.row, marqueeIds.has(entry.row.id));
    return {
      playerId: entry.row.id,
      fullName: entry.row.full_name,
      role: entry.row.role,
      capped: entry.capped,
      isOverseas: entry.row.is_overseas === null ? null : entry.row.is_overseas === 1,
      basePriceLakh: entry.basePriceLakh,
      basePriceVerified: entry.basePriceVerified,
      originalTeamId,
      rtmAvailable:
        mode.rtmEnabled && originalTeamId !== null && activeTeamIds.has(originalTeamId),
      setName,
      starScore: entry.starScore,
      orderKey: hashUnit(seed, entry.row.id, "lot-order"),
    } satisfies PoolEntry;
  });

  entries.sort((a, b) => {
    const rank = setRank(a.setName) - setRank(b.setName);
    if (rank !== 0) return rank;
    if (a.setName === "Marquee") {
      return b.starScore - a.starScore || a.fullName.localeCompare(b.fullName);
    }
    return a.orderKey - b.orderKey || a.fullName.localeCompare(b.fullName);
  });

  return entries;
}
