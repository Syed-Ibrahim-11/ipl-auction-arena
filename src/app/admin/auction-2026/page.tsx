import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { AdminLogin } from "@/components/admin/admin-login";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import { PageHeader, RoleChip } from "@/components/ui";
import { getDb } from "@/db";
import { adminConfigured, isAdminAuthenticated } from "@/lib/admin/auth";
import { formatLakh } from "@/lib/money";
import { roleLabel } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · 2026 sold prices",
  description: "The supplied 2026 IPL auction sold-player list, with every winning bid used for 2027 retention values.",
  robots: { index: false, follow: false },
};

type SoldRow = {
  player_id: string;
  full_name: string;
  role: string;
  is_overseas: number | null;
  capped_label: string | null;
  nationality_label: string | null;
  base_price_lakh: number;
  winning_bid_lakh: number | null;
  buyer_team_id: string | null;
  buyer_team_name: string | null;
  buyer_short: string | null;
  source: string;
};

export default async function AdminAuction2026Page() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return <AdminLogin configured={adminConfigured()} />;
  }

  const rows = getDb()
    .prepare(
      `SELECT ap.player_id, p.full_name, p.role, p.is_overseas,
              ap.capped_label, ap.nationality_label, ap.base_price_lakh,
              ap.winning_bid_lakh, ap.buyer_team_id,
              t.name AS buyer_team_name, t.short_name AS buyer_short, ap.source
       FROM auction_players ap
       JOIN players p ON p.id = ap.player_id
       LEFT JOIN teams t ON t.id = ap.buyer_team_id
       WHERE ap.auction_year = 2026
       ORDER BY ap.winning_bid_lakh DESC NULLS LAST, p.full_name`,
    )
    .all() as SoldRow[];

  const sold = rows.filter((row) => row.winning_bid_lakh !== null);
  const totalSpend = sold.reduce((sum, row) => sum + (row.winning_bid_lakh ?? 0), 0);
  const highest = sold[0]?.winning_bid_lakh ?? 0;
  const median =
    sold.length === 0
      ? 0
      : [...sold].sort((a, b) => (a.winning_bid_lakh ?? 0) - (b.winning_bid_lakh ?? 0))[
          Math.floor(sold.length / 2)
        ].winning_bid_lakh ?? 0;

  const teamTotals = new Map<string, { name: string; short: string; count: number; spend: number }>();
  for (const row of sold) {
    if (!row.buyer_team_id) continue;
    const entry =
      teamTotals.get(row.buyer_team_id) ?? {
        name: row.buyer_team_name ?? row.buyer_team_id,
        short: row.buyer_short ?? "",
        count: 0,
        spend: 0,
      };
    entry.count += 1;
    entry.spend += row.winning_bid_lakh ?? 0;
    teamTotals.set(row.buyer_team_id, entry);
  }
  const teams = [...teamTotals.entries()].sort((a, b) => b[1].spend - a[1].spend);

  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Operator reference"
        title="2026 sold prices"
        description="Every winning bid in the supplied 2026 auction list. These figures are used verbatim as the existing contract value when a player is retained for 2027."
        actions={
          <Link href="/admin" className="btn btn-outline">
            <ChevronLeft size={14} /> Control room
          </Link>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-success">
              <ShieldCheck size={11} /> Supplied list
            </span>
            <span className="chip">{sold.length} sold players</span>
            <span className="chip">Total {formatLakh(totalSpend)}</span>
            <span className="chip">Top {formatLakh(highest)}</span>
            <span className="chip">Median {formatLakh(median)}</span>
          </div>
        }
      />

      <div className="mt-8 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="surface-card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-display text-base font-bold uppercase tracking-wide">Sold-player ledger</h2>
            <p className="mt-1 text-[0.68rem] text-faint">
              Source: {rows[0]?.source ?? "supplied_2026_sold_csv"} · base and winning bid in lakh.
            </p>
          </div>
          <div className="max-h-[70vh] overflow-auto scrollbar-thin">
            <table className="data-table min-w-[760px]">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  <th className="w-10">#</th>
                  <th>Player</th>
                  <th>Role</th>
                  <th>Team</th>
                  <th className="text-right">Base</th>
                  <th className="text-right">Sold</th>
                </tr>
              </thead>
              <tbody>
                {sold.map((row, index) => (
                  <tr key={row.player_id}>
                    <td className="text-faint">{index + 1}</td>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <PlayerAvatar
                          name={row.full_name}
                          teamId={row.buyer_team_id}
                          role={row.role}
                          size="sm"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{row.full_name}</span>
                          <span className="text-[0.58rem] text-faint">
                            {row.nationality_label ?? (row.is_overseas === 1 ? "Overseas" : "Indian")}
                            {row.capped_label ? ` · ${row.capped_label}` : ""}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <RoleChip role={row.role} label={roleLabel(row.role)} />
                    </td>
                    <td>
                      {row.buyer_team_id ? (
                        <span className="flex items-center gap-1.5 text-xs">
                          <TeamBadge teamId={row.buyer_team_id} size={18} />
                          {row.buyer_short ?? row.buyer_team_name}
                        </span>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                    <td className="num text-right text-xs text-muted">{formatLakh(row.base_price_lakh)}</td>
                    <td className="num text-right font-semibold">{formatLakh(row.winning_bid_lakh ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-display text-base font-bold uppercase tracking-wide">Spend by franchise</h2>
              <p className="mt-1 text-[0.68rem] text-faint">Total official 2026 auction spend per franchise.</p>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Franchise</th>
                  <th className="text-right">Buys</th>
                  <th className="text-right">Spend</th>
                </tr>
              </thead>
              <tbody>
                {teams.map(([teamId, entry]) => (
                  <tr key={teamId}>
                    <td>
                      <span className="flex items-center gap-1.5 text-xs">
                        <TeamBadge teamId={teamId} size={18} />
                        {entry.short || entry.name}
                      </span>
                    </td>
                    <td className="num text-right">{entry.count}</td>
                    <td className="num text-right font-semibold">{formatLakh(entry.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel p-4 text-xs leading-relaxed text-faint">
            <p className="font-semibold text-fg">How this is used</p>
            <p className="mt-2">
              In the 2027 mini auction a retained player keeps this exact winning bid as his contract
              value, and that value is deducted from the franchise purse. Squad members who were not in
              this sold list carry a labelled simulator estimate instead.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
