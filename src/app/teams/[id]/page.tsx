import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Gavel, Printer, Shield, Trophy, Users } from "lucide-react";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import { OvrBadge, RoleChip, SectionHeading, StatBlock } from "@/components/ui";
import { getTeamDetail, roleLabel } from "@/lib/data/queries";
import { formatLakh } from "@/lib/money";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const team = getTeamDetail(id);
  if (!team) return { title: "Franchise not found" };
  return {
    title: `${team.name} · Franchise dashboard`,
    description: `${team.name} (${team.shortName}) — 2026 roster, ratings depth and actual 2026 auction purchases.`,
  };
}

export default async function TeamPage({ params }: PageProps) {
  const { id } = await params;
  const team = getTeamDetail(id);
  if (!team) notFound();

  const record = team.played > 0 ? `${team.won}–${team.lost}${team.noResult ? `–${team.noResult}` : ""}` : "—";

  return (
    <div>
      <section className="relative overflow-hidden border-b border-line">
        <div
          className="absolute inset-0 opacity-35"
          style={{
            background: `radial-gradient(900px 380px at 16% -10%, ${team.primary}, transparent 62%), radial-gradient(700px 340px at 96% 8%, ${team.secondary}, transparent 70%)`,
          }}
        />
        <div className="container-page relative py-9 sm:py-12">
          <Link href="/teams" className="link-arrow text-xs">
            <ArrowLeft size={14} /> Franchise hub
          </Link>
          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-4 sm:gap-6">
              <TeamBadge teamId={team.id} size={82} />
              <div>
                <p className="eyebrow">{team.city ?? "IPL franchise"} · {team.shortName}</p>
                <h1 className="mt-2 font-display text-[clamp(2.1rem,5vw,3.9rem)] font-bold uppercase leading-[0.94] tracking-[0.01em]">
                  {team.name}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {team.isChampion2026 && (
                    <span className="chip chip-gold">
                      <Trophy size={12} /> 2026 champions
                    </span>
                  )}
                  {team.position !== null && <span className="chip">2026 · #{team.position}</span>}
                  <span className="chip">
                    {team.titles} {team.titles === 1 ? "title" : "titles"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/auction" className="btn btn-primary btn-sm">
                <Gavel size={15} /> Auction room
              </Link>
              <Link href={`/players?team=${team.id}`} className="btn btn-outline btn-sm">
                <Users size={15} /> Filter players
              </Link>
              <Link href={`/teams/${team.id}/sheet`} className="btn btn-ghost btn-sm">
                <Printer size={15} /> Team sheet
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="container-page py-8 sm:py-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatBlock label="2026 record" value={record} hint={`${team.points} points · NRR ${team.netRunRate !== null ? team.netRunRate.toFixed(3) : "—"}`} />
          <StatBlock label="2026 squad" value={team.squadCount2026} hint="Players with 2026 appearances" />
          <StatBlock label="Squad OVR" value={team.depth.squadOvr ?? "—"} hint="Mean of rated players" tone="var(--info)" />
          <StatBlock label="Best XI OVR" value={team.depth.bestXiOvr ?? "—"} hint="Role-constrained eleven" tone="var(--success)" />
          <StatBlock label="Average age" value={team.depth.averageAge ?? "—"} hint="From known birth dates" />
          <StatBlock label="2026 auction" value={formatLakh(team.auctionSpendLakh)} hint={`${team.auctionBuys} buys · actual supplied data`} tone="var(--gold)" />
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div className="min-w-0 space-y-10">
            <section>
              <SectionHeading
                eyebrow="2026 roster"
                title="Squad on the field"
                description="Players with 2026 appearances, ordered by analytical rating. Season figures come from ball-by-ball data."
                action={
                  <Link href={`/players?team=${team.id}`} className="link-arrow text-xs">
                    Open in explorer <ArrowRight size={13} />
                  </Link>
                }
              />
              <div className="surface-card mt-5 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data-table min-w-[620px]">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Role</th>
                        <th className="text-right">Runs</th>
                        <th className="text-right">Wkts</th>
                        <th className="text-right">OVR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.roster.map((player) => (
                        <tr key={player.id}>
                          <td>
                            <Link href={`/players/${player.id}`} className="group flex items-center gap-2.5">
                              <PlayerAvatar name={player.name} teamId={team.id} role={player.role} size="sm" />
                              <span className="min-w-0">
                                <span className="block truncate font-semibold group-hover:text-accent2">{player.name}</span>
                                <span className="text-[0.6rem] text-faint">
                                  {player.country ?? "Country unavailable"} {player.isOverseas ? "· Overseas" : ""}
                                  {player.age !== null ? ` · ${player.age}y` : ""}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td>
                            <RoleChip role={player.role} label={player.roleLabel} />
                          </td>
                          <td className="num text-right">{player.seasonRuns.toLocaleString("en-IN")}</td>
                          <td className="num text-right">{player.seasonWickets}</td>
                          <td className="text-right">
                            <span className="inline-flex justify-end">
                              <OvrBadge value={player.ovr} size="sm" />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>

          <aside className="min-w-0 space-y-5">
            <div className="surface-card p-5">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-accent2" />
                <h2 className="font-display text-lg font-bold uppercase tracking-wide">Squad shape</h2>
              </div>
              <p className="mt-1 text-[0.68rem] text-faint">Role mix among 2026 appearances.</p>
              <ul className="mt-4 space-y-3">
                {team.squadRoles.map((role) => {
                  const total = team.squadRoles.reduce((sum, entry) => sum + entry.count, 0);
                  return (
                    <li key={role.role}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">{role.label}</span>
                        <span className="num text-fg">{role.count}</span>
                      </div>
                      <div className="progress-track mt-1.5 h-1.5">
                        <div
                          className="progress-fill"
                          style={{ width: `${Math.max(4, (role.count / Math.max(total, 1)) * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-center">
                <div>
                  <p className="num font-display text-xl font-bold">{team.depth.bestXiOvr ?? "—"}</p>
                  <p className="text-[0.56rem] uppercase tracking-[0.12em] text-faint">Best XI OVR</p>
                </div>
                <div>
                  <p className="num font-display text-xl font-bold">{team.depth.squadOvr ?? "—"}</p>
                  <p className="text-[0.56rem] uppercase tracking-[0.12em] text-faint">Squad OVR</p>
                </div>
              </div>
            </div>

            <div className="surface-card p-5">
              <div className="flex items-center gap-2">
                <Gavel size={16} className="text-gold" />
                <h2 className="font-display text-lg font-bold uppercase tracking-wide">2026 auction buys</h2>
              </div>
              <p className="mt-1 text-[0.68rem] text-faint">
                Actual supplied outcomes · {formatLakh(team.auctionSpendLakh)} across {team.auctionBuys} players
              </p>
              {team.auctionPurchases.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No 2026 auction purchases recorded for this franchise.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line/60">
                  {team.auctionPurchases.map((purchase) => (
                    <li key={purchase.playerId} className="flex items-center justify-between gap-2 py-2.5">
                      <Link href={`/players/${purchase.playerId}`} className="min-w-0 text-sm hover:text-accent2">
                        <span className="block truncate font-semibold">{purchase.name}</span>
                        <span className="text-[0.6rem] text-faint">
                          {roleLabel(purchase.role)} · base {formatLakh(purchase.basePriceLakh)}
                          {purchase.basePriceVerified ? "" : " (est.)"}
                        </span>
                      </Link>
                      <span className="num shrink-0 text-sm font-semibold text-accent2">
                        {purchase.winningBidLakh !== null ? formatLakh(purchase.winningBidLakh) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
