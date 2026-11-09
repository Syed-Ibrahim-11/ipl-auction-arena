import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { AuctionError, getSessionSummary } from "@/lib/auction/service";

type RouteContext = { params: Promise<{ id: string }> };

type Cell = string | number | null | undefined;

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(header: string[], rows: Cell[][]): string {
  return `\uFEFF${[header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`;
}

function filename(name: string, suffix: string): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "auction";
  return `${safe}-${suffix}.csv`;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "results";
  const db = getDb();

  try {
    const summary = getSessionSummary(id);
    if (summary.status === "abandoned") {
      return NextResponse.json({ error: "This auction was abandoned." }, { status: 410 });
    }

    let header: string[];
    let rows: Cell[][];
    let suffix: string;

    if (type === "squad" || type === "team-sheet") {
      const teams = type === "squad" ? [summary.userTeamId] : null;
      const params: string[] = [id];
      let teamClause = "";
      if (teams) {
        teamClause = "AND sq.team_id = ?";
        params.push(teams[0]);
      }
      const squadRows = db
        .prepare(
          `SELECT t.name AS team_name, t.short_name, p.full_name, p.role, p.is_overseas,
                  sq.price_lakh, sq.acquired_via, sq.price_verified, r.ovr
           FROM session_squads sq
           JOIN teams t ON t.id = sq.team_id
           JOIN players p ON p.id = sq.player_id
           LEFT JOIN player_ratings r ON r.player_id = p.id AND r.as_of_season = 2026
           WHERE sq.session_id = ? ${teamClause}
           ORDER BY t.name, sq.price_lakh DESC, p.full_name`,
        )
        .all(...params) as Array<{
        team_name: string;
        short_name: string;
        full_name: string;
        role: string;
        is_overseas: number | null;
        price_lakh: number;
        acquired_via: string;
        price_verified: number;
        ovr: number | null;
      }>;
      header = [
        "team",
        "short_name",
        "player",
        "role",
        "overseas",
        "price_lakh",
        "acquired_via",
        "price_verified",
        "rating_2026",
      ];
      rows = squadRows.map((row) => [
        row.team_name,
        row.short_name,
        row.full_name,
        row.role,
        row.is_overseas === 1 ? "yes" : row.is_overseas === 0 ? "no" : "",
        row.price_lakh,
        row.acquired_via,
        row.price_verified === 1 ? "yes" : "no",
        row.ovr,
      ]);
      suffix = teams ? "squad" : "all-teams";
    } else if (type === "events") {
      const events = db
        .prepare(
          `SELECT id, type, message, lot_id, created_at FROM auction_events
           WHERE session_id = ? ORDER BY id ASC`,
        )
        .all(id) as Array<{
        id: number;
        type: string;
        message: string;
        lot_id: string | null;
        created_at: string;
      }>;
      header = ["event_id", "type", "message", "lot_id", "created_at"];
      rows = events.map((event) => [event.id, event.type, event.message, event.lot_id, event.created_at]);
      suffix = "event-log";
    } else if (type === "results") {
      const lots = db
        .prepare(
          `SELECT l.lot_number, l.set_name, p.full_name, p.role, p.is_overseas,
                  l.base_price_lakh, l.base_price_verified, l.status, l.current_bid_lakh,
                  l.revised_price_lakh, l.final_price_lakh, l.sold_via,
                  wt.name AS winning_team, wt.short_name AS winning_short,
                  l.rtm_status,
                  at.name AS actual_team, a.winning_bid_lakh AS actual_bid_lakh
           FROM auction_lots l
           JOIN players p ON p.id = l.player_id
           LEFT JOIN teams wt ON wt.id = l.winning_team_id
           LEFT JOIN auction_players a ON a.player_id = l.player_id AND a.auction_year = 2026
           LEFT JOIN teams at ON at.id = a.buyer_team_id
           WHERE l.session_id = ? AND l.status IN ('sold', 'unsold')
           ORDER BY l.lot_number`,
        )
        .all(id) as Array<{
        lot_number: number;
        set_name: string | null;
        full_name: string;
        role: string;
        is_overseas: number | null;
        base_price_lakh: number;
        base_price_verified: number;
        status: string;
        current_bid_lakh: number | null;
        revised_price_lakh: number | null;
        final_price_lakh: number | null;
        sold_via: string | null;
        winning_team: string | null;
        winning_short: string | null;
        rtm_status: string | null;
        actual_team: string | null;
        actual_bid_lakh: number | null;
      }>;
      header = [
        "lot",
        "set",
        "player",
        "role",
        "overseas",
        "base_price_lakh",
        "base_price_verified",
        "status",
        "final_bid_lakh",
        "winning_team",
        "sold_via",
        "rtm_status",
        "actual_2026_team",
        "actual_2026_bid_lakh",
      ];
      rows = lots.map((row) => [
        row.lot_number,
        row.set_name,
        row.full_name,
        row.role,
        row.is_overseas === 1 ? "yes" : row.is_overseas === 0 ? "no" : "",
        row.base_price_lakh,
        row.base_price_verified === 1 ? "yes" : "no",
        row.status,
        row.final_price_lakh ?? row.revised_price_lakh ?? row.current_bid_lakh,
        row.winning_team ?? "",
        row.sold_via ?? "",
        row.rtm_status ?? "",
        row.actual_team ?? "",
        row.actual_bid_lakh,
      ]);
      suffix = "results";
    } else {
      return NextResponse.json(
        { error: "Unknown export type. Use results, squad, team-sheet or events." },
        { status: 400 },
      );
    }

    return new NextResponse(toCsv(header, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename(summary.name, suffix)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuctionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Export error", error);
    return NextResponse.json({ error: "The export could not be created." }, { status: 500 });
  }
}
