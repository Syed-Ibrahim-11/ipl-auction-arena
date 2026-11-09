import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { CURRENT_PLAYER_SQL, roleLabel } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

type PlayerSearchRow = {
  id: string;
  full_name: string;
  short_name: string;
  role: string;
  country: string | null;
  is_overseas: number | null;
  ovr: number | null;
  team_id: string | null;
  team_name: string | null;
  team_short: string | null;
  base_price_lakh: number | null;
  winning_bid_lakh: number | null;
};

type TeamSearchRow = {
  id: string;
  name: string;
  short_name: string;
  city: string | null;
  primary_color: string;
  secondary_color: string;
  ink_color: string;
  active: number;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 60) ?? "";
  const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ players: [], teams: [], lots: [] });
  }

  const db = getDb();

  if (sessionId) {
    const lots = db
      .prepare(
        `SELECT l.id, l.lot_number, l.set_name, l.base_price_lakh, l.player_id, p.full_name, p.role
         FROM auction_lots l
         JOIN players p ON p.id = l.player_id
         WHERE l.session_id = ? AND l.status = 'pending'
           AND (p.full_name LIKE ? OR p.short_name LIKE ?)
         ORDER BY l.lot_number
         LIMIT 20`,
      )
      .all(sessionId, `%${query}%`, `%${query}%`) as Array<{
      id: string;
      lot_number: number;
      set_name: string | null;
      base_price_lakh: number;
      player_id: string;
      full_name: string;
      role: string;
    }>;
    return NextResponse.json({
      players: [],
      teams: [],
      lots: lots.map((row) => ({
        id: row.player_id,
        lotId: row.id,
        playerName: row.full_name,
        role: row.role,
        roleLabel: roleLabel(row.role),
        setName: row.set_name,
        basePriceLakh: row.base_price_lakh,
      })),
    });
  }

  const like = `%${query}%`;
  const prefix = `${query}%`;

  const players = db
    .prepare(
      `SELECT p.id, p.full_name, p.short_name, p.role, p.country, p.is_overseas,
              r.ovr,
              (SELECT ps.team_id FROM player_season_stats ps
               WHERE ps.player_id = p.id AND ps.season = 2026
               ORDER BY ps.matches DESC LIMIT 1) AS team_id,
              t.name AS team_name, t.short_name AS team_short,
              a.base_price_lakh, a.winning_bid_lakh
       FROM players p
       LEFT JOIN player_ratings r ON r.player_id = p.id AND r.as_of_season = 2026
       LEFT JOIN auction_players a ON a.player_id = p.id AND a.auction_year = 2026
       LEFT JOIN teams t ON t.id = (
         SELECT ps.team_id FROM player_season_stats ps
         WHERE ps.player_id = p.id AND ps.season = 2026
         ORDER BY ps.matches DESC LIMIT 1
       )
       WHERE (p.full_name LIKE ? OR p.short_name LIKE ?) AND ${CURRENT_PLAYER_SQL}
       ORDER BY
         CASE
           WHEN p.full_name LIKE ? THEN 0
           WHEN p.short_name LIKE ? THEN 1
           ELSE 2
         END,
         r.ovr DESC NULLS LAST,
         p.full_name ASC
       LIMIT 8`,
    )
    .all(like, like, prefix, prefix) as PlayerSearchRow[];

  const teams = db
    .prepare(
      `SELECT id, name, short_name, city, primary_color, secondary_color, ink_color, active
       FROM teams
       WHERE name LIKE ? OR short_name LIKE ? OR city LIKE ?
       ORDER BY active DESC, name ASC
       LIMIT 5`,
    )
    .all(like, like, like) as TeamSearchRow[];

  return NextResponse.json({
    players: players.map((row) => ({
      id: row.id,
      name: row.full_name,
      shortName: row.short_name,
      role: row.role,
      roleLabel: roleLabel(row.role),
      country: row.country,
      isOverseas: row.is_overseas === 1,
      ovr: row.ovr,
      teamId: row.team_id,
      teamName: row.team_name,
      teamShort: row.team_short,
      basePriceLakh: row.base_price_lakh,
      winningBidLakh: row.winning_bid_lakh,
    })),
    teams: teams.map((row) => ({
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      city: row.city,
      active: row.active === 1,
      primary: row.primary_color,
      secondary: row.secondary_color,
      ink: row.ink_color,
    })),
    lots: [],
  });
}
