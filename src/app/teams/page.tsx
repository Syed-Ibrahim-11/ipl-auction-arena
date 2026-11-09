import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
import { TeamBadge } from "@/components/brand/team-badge";
import { FormPips, PageHeader, SectionHeading } from "@/components/ui";
import { getTeamsOverview } from "@/lib/data/queries";
import { formatCrore, formatLakh } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Franchise Hub",
  description:
    "All ten IPL franchises with 2026 standings, form, ratings depth and 2026 auction spend — linking to full squad and results dashboards.",
};

export default async function TeamsPage() {
  const teams = getTeamsOverview();
  const sorted = [...teams].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  const champion = teams.find((team) => team.isChampion2026);
  const totalSpend = teams.reduce((sum, team) => sum + team.auctionSpendLakh, 0);

  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Ten franchises · one archive"
        title="Franchise hub"
        description="Every active IPL franchise with its 2026 campaign, rated squad depth and actual 2026 auction spend. Open a dashboard for the full roster, season-by-season record and match results."
        actions={
          <>
            <Link href="/auction" className="btn btn-primary">
              Start an auction
            </Link>
            <Link href="/players" className="btn btn-outline">
              Player explorer
            </Link>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span className="chip chip-gold">2026 champion: {champion?.shortName ?? "—"}</span>
            <span className="chip">2026 auction spend: {formatLakh(totalSpend)}</span>
            <span className="chip">Ratings as of 2026</span>
          </div>
        }
      />

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map((team) => (
          <Link
            key={team.id}
            href={`/teams/${team.id}`}
            className="surface-card card-hover group relative overflow-hidden p-5"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.14]"
              style={{ background: `linear-gradient(135deg, ${team.primary}, transparent 58%, ${team.secondary})` }}
            />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <TeamBadge teamId={team.id} size={48} />
                  <div>
                    <p className="font-display text-xl font-bold uppercase leading-tight tracking-wide">{team.shortName}</p>
                    <p className="text-xs text-muted">{team.name}</p>
                    <p className="mt-0.5 text-[0.62rem] text-faint">{team.city ?? "City unavailable"}</p>
                  </div>
                </div>
                <div className="text-right">
                  {team.isChampion2026 ? (
                    <span className="chip chip-gold">
                      <Trophy size={11} /> 2026 champions
                    </span>
                  ) : team.position !== null ? (
                    <span className="chip">2026 · #{team.position}</span>
                  ) : (
                    <span className="chip">2026 · no table</span>
                  )}
                  <p className="num mt-2 text-[0.68rem] text-muted">
                    {team.won}W · {team.lost}L{team.noResult ? ` · ${team.noResult}NR` : ""} · {team.points} pts
                  </p>
                  <div className="mt-1 flex justify-end">
                    <FormPips form={team.form} />
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line/70 pt-3 text-center">
                <div>
                  <p className="num font-display text-lg font-bold">{team.squadCount2026}</p>
                  <p className="text-[0.56rem] uppercase tracking-[0.12em] text-faint">2026 players</p>
                </div>
                <div>
                  <p className="num font-display text-lg font-bold">{team.auctionBuys}</p>
                  <p className="text-[0.56rem] uppercase tracking-[0.12em] text-faint">Auction buys</p>
                </div>
                <div>
                  <p className="num font-display text-lg font-bold">{formatCrore(team.auctionSpendLakh)}</p>
                  <p className="text-[0.56rem] uppercase tracking-[0.12em] text-faint">Spend (₹ Cr)</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/70 pt-3">
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {team.topPlayers.length > 0 ? (
                    team.topPlayers.map((player) => (
                      <span key={player.id} className="chip max-w-full truncate text-[0.6rem]">
                        {player.name.split(" ").slice(-1)[0]} · {player.ovr ?? "—"}
                      </span>
                    ))
                  ) : (
                    <span className="text-[0.65rem] text-faint">No rated players</span>
                  )}
                </div>
                <span className="link-arrow shrink-0 text-[0.72rem]">
                  Dashboard <ArrowRight size={13} />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-12">
        <SectionHeading
          eyebrow="2026 season"
          title="Standings and money"
          description="Points table as supplied for the 2026 season, alongside the actual 2026 auction spend recorded in the sold-player dataset."
        />
        <div className="surface-card mt-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[820px]">
              <thead>
                <tr>
                  <th className="w-12">Pos</th>
                  <th>Franchise</th>
                  <th className="text-center">P</th>
                  <th className="text-center">W</th>
                  <th className="text-center">L</th>
                  <th className="text-center">NR</th>
                  <th className="text-right">NRR</th>
                  <th className="text-center">Pts</th>
                  <th className="text-center">Form</th>
                  <th className="text-right">2026 auction</th>
                  <th className="text-right">Top buy</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((team) => (
                  <tr key={team.id}>
                    <td className="num text-faint">{team.position ?? "—"}</td>
                    <td>
                      <Link href={`/teams/${team.id}`} className="flex items-center gap-2 font-semibold hover:text-accent2">
                        <TeamBadge teamId={team.id} size={22} />
                        {team.shortName}
                        <span className="hidden text-xs font-normal text-faint sm:inline">{team.name}</span>
                        {team.isChampion2026 && <Trophy size={13} className="text-gold" />}
                      </Link>
                    </td>
                    <td className="num text-center">{team.played}</td>
                    <td className="num text-center">{team.won}</td>
                    <td className="num text-center">{team.lost}</td>
                    <td className="num text-center">{team.noResult}</td>
                    <td className="num text-right">{team.netRunRate !== null ? team.netRunRate.toFixed(3) : "—"}</td>
                    <td className="num text-center font-semibold">{team.points}</td>
                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        <FormPips form={team.form} />
                      </span>
                    </td>
                    <td className="num text-right text-xs">
                      {team.auctionSpendLakh > 0 ? formatLakh(team.auctionSpendLakh) : "—"}
                      <span className="ml-1 text-faint">({team.auctionBuys})</span>
                    </td>
                    <td className="text-right text-xs">
                      {team.auctionTopBuy ? (
                        <>
                          <span className="block max-w-[140px] truncate">{team.auctionTopBuy.name}</span>
                          <span className="num text-faint">{formatLakh(team.auctionTopBuy.amountLakh)}</span>
                        </>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-faint">
          Crest designs on this site are original, unofficial marks. They are not official franchise logos.
        </p>
      </section>
    </div>
  );
}
