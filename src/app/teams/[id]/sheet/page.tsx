import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { TeamBadge } from "@/components/brand/team-badge";
import { FormPips } from "@/components/ui";
import { getTeamDetail } from "@/lib/data/queries";
import { formatLakh } from "@/lib/money";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const team = getTeamDetail(id);
  if (!team) return { title: "Team sheet not found" };
  return {
    title: `${team.shortName} team sheet · 2026`,
    description: `Printable ${team.name} squad sheet with ratings, roles, 2026 season numbers and auction purchases.`,
  };
}

export default async function TeamSheetPage({ params }: PageProps) {
  const { id } = await params;
  const team = getTeamDetail(id);
  if (!team) notFound();

  const groups = [
    { label: "Batters", role: "batter" },
    { label: "Wicketkeepers", role: "wicketkeeper" },
    { label: "All-rounders", role: "all-rounder" },
    { label: "Bowlers", role: "bowler" },
    { label: "Unclassified", role: "unknown" },
  ]
    .map((group) => ({ ...group, players: team.roster.filter((player) => player.role === group.role) }))
    .filter((group) => group.players.length > 0);

  const overseas = team.roster.filter((player) => player.isOverseas).length;

  return (
    <div className="container-page py-8 print:py-0">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/teams/${team.id}`} className="link-arrow text-xs">
          <ArrowLeft size={14} /> Back to {team.shortName} dashboard
        </Link>
        <div className="flex gap-2">
          <Link href={`/teams/${team.id}`} className="btn btn-ghost btn-sm no-print">
            Dashboard
          </Link>
          <PrintButton />
        </div>
      </div>

      <article className="surface-card mt-5 overflow-hidden print:mt-0 print:border-0">
        <header
          className="flex flex-col gap-4 border-b border-line p-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${team.primary} 22%, transparent), transparent 70%)` }}
        >
          <div className="flex items-center gap-4">
            <TeamBadge teamId={team.id} size={64} />
            <div>
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-faint">IPL Auction Arena · Team sheet</p>
              <h1 className="mt-1 font-display text-3xl font-bold uppercase leading-none tracking-wide sm:text-4xl">{team.name}</h1>
              <p className="mt-1 text-xs text-muted">
                {team.city ?? "—"} · 2026 season · {team.roster.length} listed players · {overseas} overseas
              </p>
            </div>
          </div>
          <div className="text-sm sm:text-right">
            <p className="num font-display text-2xl font-bold">{team.won}W–{team.lost}L{team.noResult ? `–${team.noResult}NR` : ""}</p>
            <p className="text-xs text-muted">
              {team.points} points{team.position !== null ? ` · table #${team.position}` : ""}
              {team.isChampion2026 ? " · champions" : ""}
            </p>
            <div className="mt-2 flex gap-1 sm:justify-end">
              <FormPips form={team.form} />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
          {[
            ["2026 auction spend", formatLakh(team.auctionSpendLakh)],
            ["Auction buys", String(team.auctionBuys)],
            ["Squad OVR", String(team.depth.squadOvr ?? "—")],
            ["Best XI OVR", String(team.depth.bestXiOvr ?? "—")],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface p-3.5">
              <p className="text-[0.56rem] font-semibold uppercase tracking-[0.14em] text-faint">{label}</p>
              <p className="num mt-1 font-display text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <div className="p-6">
          {groups.map((group) => (
            <section key={group.role} className="mb-6 last:mb-0">
              <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-accent2">{group.label}</h2>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="data-table mt-2">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th className="hidden sm:table-cell">Country</th>
                    <th className="text-center">Age</th>
                    <th className="text-center">2026 M</th>
                    <th className="text-right">Runs</th>
                    <th className="text-right">Wkts</th>
                    <th className="text-right">OVR</th>
                  </tr>
                </thead>
                <tbody>
                  {group.players.map((player) => (
                    <tr key={player.id}>
                      <td className="font-semibold">
                        {player.name}
                        {player.isOverseas && <span className="ml-1.5 text-[0.6rem] font-normal text-info">OS</span>}
                      </td>
                      <td className="hidden text-xs text-muted sm:table-cell">{player.country ?? "—"}</td>
                      <td className="num text-center">{player.age ?? "—"}</td>
                      <td className="num text-center">{player.seasonMatches}</td>
                      <td className="num text-right">{player.seasonRuns.toLocaleString("en-IN")}</td>
                      <td className="num text-right">{player.seasonWickets}</td>
                      <td className="num text-right font-semibold">{player.ovr ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </section>
          ))}

          <section>
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-accent2">2026 auction purchases</h2>
            {team.auctionPurchases.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No 2026 auction purchases recorded.</p>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="data-table mt-2">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Role</th>
                      <th className="text-right">Base</th>
                      <th className="text-right">Price</th>
                      <th className="text-center">Verified base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.auctionPurchases.map((purchase) => (
                      <tr key={purchase.playerId}>
                        <td className="font-semibold">{purchase.name}</td>
                        <td className="text-xs capitalize text-muted">{purchase.role.replace("-", " ")}</td>
                        <td className="num text-right">{formatLakh(purchase.basePriceLakh)}</td>
                        <td className="num text-right font-semibold">{purchase.winningBidLakh !== null ? formatLakh(purchase.winningBidLakh) : "—"}</td>
                        <td className="text-center text-xs">{purchase.basePriceVerified ? "Yes" : "Estimated"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <footer className="border-t border-line px-6 py-4 text-[0.6rem] leading-relaxed text-faint">
          Generated by IPL Auction Arena · squad from supplied 2026 appearance data · auction prices from the supplied
          2026 sold-player dataset · ratings analytical, as of 2026 · crests are original unofficial marks.
          <span className="print-only"> Printed {new Date().toLocaleDateString("en-IN", { dateStyle: "medium" })}.</span>
        </footer>
      </article>
    </div>
  );
}
