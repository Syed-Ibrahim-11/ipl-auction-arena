import { getDb } from "@/db";
import { AuctionError, asSessionStatus, loadSessionConfig } from "./internal";
import { getAuctionMode, type AuctionMode } from "./modes";
import type { AuctionSessionStatus } from "./types";

export type RecapLot = {
  id: string;
  lotNumber: number;
  setName: string;
  playerId: string;
  playerName: string;
  role: string;
  ovr: number | null;
  isOverseas: boolean | null;
  basePriceLakh: number;
  basePriceVerified: boolean;
  status: "sold" | "unsold" | "live" | "rtm" | "pending";
  finalPriceLakh: number | null;
  winningTeamId: string | null;
  winningTeamShort: string | null;
  winningTeamName: string | null;
  soldVia: string | null;
  rtmStatus: string | null;
  actualBuyerTeamId: string | null;
  actualBuyerTeamShort: string | null;
  actualBidLakh: number | null;
};

export type RecapSquadPlayer = {
  playerId: string;
  name: string;
  role: string;
  isOverseas: boolean | null;
  priceLakh: number;
  priceVerified: boolean;
  acquiredVia: string;
  ovr: number | null;
  age: number | null;
};

export type RecapTeam = {
  id: string;
  name: string;
  shortName: string;
  city: string | null;
  primary: string;
  secondary: string;
  ink: string;
  openingPurseLakh: number;
  purseLakh: number;
  spentLakh: number;
  preExistingValueLakh: number;
  rtmRemaining: number;
  aiProfile: string;
  isHuman: boolean;
  squad: RecapSquadPlayer[];
  overseasCount: number;
  averageOvr: number | null;
  topBuy: RecapSquadPlayer | null;
};

export type AuctionRecap = {
  session: {
    id: string;
    name: string;
    mode: AuctionMode | undefined;
    modeId: string;
    season: number;
    status: AuctionSessionStatus;
    userTeamId: string;
    userTeamName: string;
    createdAt: string;
    completedAt: string | null;
    totalLots: number;
    completedLots: number;
    rulebook: {
      id: string;
      name: string;
      purseCapLakh: number;
      squadMin: number;
      squadMax: number;
      overseasMax: number;
      rtmCards: number;
    };
    config: ReturnType<typeof loadSessionConfig>;
  };
  teams: RecapTeam[];
  userTeam: RecapTeam | null;
  lots: RecapLot[];
  totals: {
    sold: number;
    unsold: number;
    resolved: number;
    grossSpendLakh: number;
    highestPriceLakh: number;
    highestLotNumber: number | null;
    averagePriceLakh: number | null;
    rtmMatches: number;
    overseasSold: number;
  };
  actualComparison: {
    available: boolean;
    matchingBuyers: number;
    comparedLots: number;
    averageAbsDiffLakh: number | null;
    userMatches: number;
  };
};

interface TeamRow {
  id: string;
  name: string;
  short_name: string;
  city: string | null;
  primary_color: string;
  secondary_color: string;
  ink_color: string;
  opening_purse_lakh: number;
  purse_lakh: number;
  spent_lakh: number;
  pre_existing_value_lakh: number;
  rtm_remaining: number;
  ai_profile: string;
  is_human: number;
}

export function getAuctionRecap(sessionId: string): AuctionRecap {
  const db = getDb();
  const session = db
    .prepare(
      `SELECT s.*, u.name AS user_team_name, r.name AS rulebook_name, r.purse_cap_lakh,
              r.squad_min, r.squad_max, r.overseas_max, r.rtm_cards
       FROM auction_sessions s
       LEFT JOIN teams u ON u.id = s.user_team_id
       JOIN rulebooks r ON r.id = s.rulebook_id
       WHERE s.id = ?`,
    )
    .get(sessionId) as
    | (Record<string, unknown> & {
        id: string;
        name: string;
        mode: string;
        season: number;
        status: string;
        user_team_id: string | null;
        user_team_name: string | null;
        created_at: string;
        completed_at: string | null;
        total_lots: number;
        completed_lots: number;
        config_json: string | null;
        rulebook_id: string;
        rulebook_name: string;
        purse_cap_lakh: number;
        squad_min: number;
        squad_max: number;
        overseas_max: number;
        rtm_cards: number;
      })
    | undefined;
  if (!session) {
    throw new AuctionError("SESSION_NOT_FOUND", "That auction session could not be found.", 404);
  }

  const mode = getAuctionMode(session.mode);
  const config = loadSessionConfig({
    id: session.id,
    mode: session.mode,
    season: session.season,
    rulebook_id: session.rulebook_id,
    config_json: session.config_json,
  } as Parameters<typeof loadSessionConfig>[0]);

  const teamRows = db
    .prepare(
      `SELECT t.id, t.name, t.short_name, t.city, t.primary_color, t.secondary_color, t.ink_color,
              st.opening_purse_lakh, st.purse_lakh, st.spent_lakh, st.pre_existing_value_lakh,
              st.rtm_remaining, st.ai_profile, st.is_human
       FROM session_teams st JOIN teams t ON t.id = st.team_id
       WHERE st.session_id = ? ORDER BY t.name`,
    )
    .all(sessionId) as TeamRow[];

  const lotRows = db
    .prepare(
      `SELECT l.id, l.lot_number, l.set_name, l.player_id, p.full_name, p.role, p.is_overseas,
              p.birth_date, r.ovr, l.base_price_lakh, l.base_price_verified, l.status,
              l.final_price_lakh, l.winning_team_id, wt.name AS winning_name, wt.short_name AS winning_short,
              l.sold_via, l.rtm_status,
              a.buyer_team_id AS actual_team_id, at.short_name AS actual_short,
              a.winning_bid_lakh AS actual_bid
       FROM auction_lots l
       JOIN players p ON p.id = l.player_id
       LEFT JOIN player_rating_versions r ON r.player_id = p.id AND r.as_of_season = ?
       LEFT JOIN teams wt ON wt.id = l.winning_team_id
       LEFT JOIN auction_players a ON a.player_id = l.player_id AND a.auction_year = 2026
       LEFT JOIN teams at ON at.id = a.buyer_team_id
       WHERE l.session_id = ?
       ORDER BY l.lot_number`,
    )
    .all(config.asOfSeason, sessionId) as Array<{
    id: string;
    lot_number: number;
    set_name: string | null;
    player_id: string;
    full_name: string;
    role: string;
    is_overseas: number | null;
    birth_date: string | null;
    ovr: number | null;
    base_price_lakh: number;
    base_price_verified: number;
    status: string;
    final_price_lakh: number | null;
    winning_team_id: string | null;
    winning_name: string | null;
    winning_short: string | null;
    sold_via: string | null;
    rtm_status: string | null;
    actual_team_id: string | null;
    actual_short: string | null;
    actual_bid: number | null;
  }>;

  const squadRows = db
    .prepare(
      `SELECT sq.team_id, sq.player_id, sq.price_lakh, sq.price_verified, sq.acquired_via,
              p.full_name, p.role, p.is_overseas, p.birth_date, r.ovr
       FROM session_squads sq
       JOIN players p ON p.id = sq.player_id
       LEFT JOIN player_rating_versions r ON r.player_id = p.id AND r.as_of_season = ?
       WHERE sq.session_id = ?
       ORDER BY sq.price_lakh DESC, p.full_name`,
    )
    .all(config.asOfSeason, sessionId) as Array<{
    team_id: string;
    player_id: string;
    price_lakh: number;
    price_verified: number;
    acquired_via: string;
    full_name: string;
    role: string;
    is_overseas: number | null;
    birth_date: string | null;
    ovr: number | null;
  }>;

  const squadsByTeam = new Map<string, RecapSquadPlayer[]>();
  for (const row of squadRows) {
    const list = squadsByTeam.get(row.team_id) ?? [];
    list.push({
      playerId: row.player_id,
      name: row.full_name,
      role: row.role,
      isOverseas: row.is_overseas === null ? null : row.is_overseas === 1,
      priceLakh: row.price_lakh,
      priceVerified: row.price_verified === 1,
      acquiredVia: row.acquired_via,
      ovr: row.ovr,
      age: ageFromBirthDate(row.birth_date),
    });
    squadsByTeam.set(row.team_id, list);
  }

  const teams: RecapTeam[] = teamRows.map((row) => {
    const squad = squadsByTeam.get(row.id) ?? [];
    const rated = squad.map((player) => player.ovr).filter((ovr): ovr is number => ovr !== null);
    const topBuy = [...squad]
      .filter((player) => !player.acquiredVia.startsWith("retained-"))
      .sort((a, b) => b.priceLakh - a.priceLakh)[0] ?? null;
    return {
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      city: row.city,
      primary: row.primary_color,
      secondary: row.secondary_color,
      ink: row.ink_color,
      openingPurseLakh: row.opening_purse_lakh,
      purseLakh: row.purse_lakh,
      spentLakh: row.spent_lakh,
      preExistingValueLakh: row.pre_existing_value_lakh,
      rtmRemaining: row.rtm_remaining,
      aiProfile: row.ai_profile,
      isHuman: row.is_human === 1,
      squad,
      overseasCount: squad.filter((player) => player.isOverseas).length,
      averageOvr:
        rated.length > 0
          ? Math.round((rated.reduce((sum, ovr) => sum + ovr, 0) / rated.length) * 10) / 10
          : null,
      topBuy,
    };
  });

  const lots: RecapLot[] = lotRows.map((row) => ({
    id: row.id,
    lotNumber: row.lot_number,
    setName: row.set_name ?? "Auction lot",
    playerId: row.player_id,
    playerName: row.full_name,
    role: row.role,
    ovr: row.ovr,
    isOverseas: row.is_overseas === null ? null : row.is_overseas === 1,
    basePriceLakh: row.base_price_lakh,
    basePriceVerified: row.base_price_verified === 1,
    status: row.status as RecapLot["status"],
    finalPriceLakh: row.final_price_lakh,
    winningTeamId: row.winning_team_id,
    winningTeamShort: row.winning_short,
    winningTeamName: row.winning_name,
    soldVia: row.sold_via,
    rtmStatus: row.rtm_status,
    actualBuyerTeamId: row.actual_team_id,
    actualBuyerTeamShort: row.actual_short,
    actualBidLakh: row.actual_bid,
  }));

  const sold = lots.filter((lot) => lot.status === "sold");
  const unsold = lots.filter((lot) => lot.status === "unsold");
  const highest = sold.reduce<RecapLot | null>(
    (best, lot) => (!best || (lot.finalPriceLakh ?? 0) > (best.finalPriceLakh ?? 0) ? lot : best),
    null,
  );
  const compared = sold.filter((lot) => lot.actualBuyerTeamId !== null && lot.actualBidLakh !== null);
  const matchingBuyers = compared.filter((lot) => lot.winningTeamId === lot.actualBuyerTeamId).length;
  const diffs = compared.map((lot) => Math.abs((lot.finalPriceLakh ?? 0) - (lot.actualBidLakh ?? 0)));
  const userMatches = compared.filter(
    (lot) => lot.winningTeamId === session.user_team_id && lot.actualBuyerTeamId === session.user_team_id,
  ).length;

  return {
    session: {
      id: session.id,
      name: session.name,
      mode,
      modeId: session.mode,
      season: session.season,
      status: asSessionStatus(session.status),
      userTeamId: session.user_team_id ?? "",
      userTeamName: session.user_team_name ?? "Unassigned",
      createdAt: session.created_at,
      completedAt: session.completed_at,
      totalLots: session.total_lots,
      completedLots: session.completed_lots,
      rulebook: {
        id: session.rulebook_id,
        name: session.rulebook_name,
        purseCapLakh: session.purse_cap_lakh,
        squadMin: session.squad_min,
        squadMax: session.squad_max,
        overseasMax: session.overseas_max,
        rtmCards: session.rtm_cards,
      },
      config,
    },
    teams,
    userTeam: teams.find((team) => team.id === session.user_team_id) ?? null,
    lots,
    totals: {
      sold: sold.length,
      unsold: unsold.length,
      resolved: sold.length + unsold.length,
      grossSpendLakh: sold.reduce((sum, lot) => sum + (lot.finalPriceLakh ?? 0), 0),
      highestPriceLakh: highest?.finalPriceLakh ?? 0,
      highestLotNumber: highest?.lotNumber ?? null,
      averagePriceLakh:
        sold.length > 0
          ? Math.round(sold.reduce((sum, lot) => sum + (lot.finalPriceLakh ?? 0), 0) / sold.length)
          : null,
      rtmMatches: sold.filter((lot) => lot.soldVia === "rtm-match").length,
      overseasSold: sold.filter((lot) => lot.isOverseas).length,
    },
    actualComparison: {
      available: compared.length > 0,
      matchingBuyers,
      comparedLots: compared.length,
      averageAbsDiffLakh:
        diffs.length > 0 ? Math.round(diffs.reduce((sum, value) => sum + value, 0) / diffs.length) : null,
      userMatches,
    },
  };
}

function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date("2026-10-25T00:00:00Z");
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const month = now.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}
