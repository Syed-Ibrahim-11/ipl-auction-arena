import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { RecapLedger } from "@/components/auction/recap-ledger";
import { PrintButton } from "@/components/print-button";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import { OvrBadge, StatBlock } from "@/components/ui";
import { AI_PROFILES, type AiProfileId } from "@/lib/auction/modes";
import { getAuctionRecap } from "@/lib/auction/recap";
import { AuctionError } from "@/lib/auction/service";
import { getSeasonSnapshotForSession } from "@/lib/season/service";
import { formatLakh } from "@/lib/money";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const recap = getAuctionRecap(id);
    return {
      title: `${recap.session.name} · Auction recap`,
      description: `Results and team sheets from ${recap.session.name}: ${recap.totals.sold} players sold, ${formatLakh(recap.totals.grossSpendLakh)} gross spend.`,
    };
  } catch {
    return { title: "Auction recap" };
  }
}

export default async function RecapPage({ params }: PageProps) {
  const { id } = await params;
  let recap;
  try {
    recap = getAuctionRecap(id);
  } catch (error) {
    if (error instanceof AuctionError) notFound();
    throw error;
  }
  const user = recap.userTeam;
  const mode = recap.session.mode;
  const date = recap.session.completedAt ?? recap.session.createdAt;
  const totalRetention = recap.teams.reduce((sum, team) => sum + team.preExistingValueLakh, 0);
  const totalSpent = recap.teams.reduce((sum, team) => sum + team.spentLakh, 0);
  const reconciled = recap.totals.grossSpendLakh + totalRetention === totalSpent;
  const playingSquad = user?.squad.filter((player) => !player.acquiredVia.startsWith("retained-")) ?? [];
  const retained = user?.squad.filter((player) => player.acquiredVia.startsWith("retained-")) ?? [];
  const shortfall = recap.session.rulebook.squadMin - (user?.squad.length ?? 0);
  const season = getSeasonSnapshotForSession(id);

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 text-xs">
        <Link href={recap.session.status === "active" ? `/auction/${id}` : "/auction"} className="link-arrow text-muted hover:text-fg">
          <ArrowLeft size={14} /> {recap.session.status === "active" ? "Back to the room" : "Auction lobby"}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton label="Print recap" />
          <Link href={`/api/sessions/${id}/export?type=results`} className="btn btn-ghost btn-sm">
            <Download size={14} /> Results CSV
          </Link>
          <Link href={`/api/sessions/${id}/export?type=squad`} className="btn btn-ghost btn-sm">
            <FileSpreadsheet size={14} /> My squad CSV
          </Link>
          <Link href={`/api/sessions/${id}/export?type=team-sheet`} className="btn btn-ghost btn-sm">
            All team sheets
          </Link>
        </div>
      </div>

      <header className="mt-6 border-b border-line pb-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">{mode?.name ?? recap.session.modeId}</p>
            <h1 className="mt-3 font-display text-[clamp(2.5rem,5vw,4.4rem)] font-bold uppercase leading-[0.92] tracking-[0.01em]">
              {recap.session.name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
              {user && (
                <span className="flex items-center gap-2">
                  <TeamBadge teamId={user.id} size={24} />
                  <span className="font-semibold text-fg">{user.name}</span>
                </span>
              )}
              <span>·</span>
              <span>{recap.session.rulebook.name}</span>
              <span>·</span>
              <span>
                {new Date(date).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={cn("chip", recap.session.status === "completed" ? "chip-success" : "chip-accent")}>
                {recap.session.status === "completed" ? "Completed" : "In progress"}
              </span>
              <span className="chip">
                {recap.totals.resolved} / {recap.session.totalLots} lots resolved
              </span>
              <span className={cn("chip", reconciled ? "chip-success" : "chip-danger")}>
                <ShieldCheck size={12} /> {reconciled ? "Ledger reconciled" : "Ledger mismatch"}
              </span>
              {recap.session.config.simulatedRetention && <span className="chip chip-gold">Simulated retentions</span>}
              {recap.session.config.simulatedBasePrices && <span className="chip chip-gold">Modelled base prices</span>}
            </div>
          </div>
          {recap.session.status === "active" ? (
            <Link href={`/auction/${id}`} className="btn btn-primary">
              Continue bidding <ArrowRight size={16} />
            </Link>
          ) : season ? (
            <Link href={`/auction/${id}/season`} className="btn btn-primary">
              <Trophy size={16} /> {season.season.status === "completed" ? "Season archive" : "Season hub"}
            </Link>
          ) : (
            <Link href={`/auction/${id}/season`} className="btn btn-primary">
              <Trophy size={16} /> Start the season <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </header>

      {recap.session.status === "active" && (
        <div className="no-print mt-6 flex items-start gap-3 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-sm text-muted">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-info" />
          <p>
            This auction is still live. The recap shows resolved lots only; return to the room to
            continue. Exporting now produces a partial team sheet.
          </p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatBlock label="Players sold" value={recap.totals.sold} hint={`${recap.totals.unsold} unsold`} />
        <StatBlock label="Gross spend" value={formatLakh(recap.totals.grossSpendLakh)} hint="Hammer prices only" />
        <StatBlock
          label="Highest sale"
          value={formatLakh(recap.totals.highestPriceLakh)}
          hint={
            recap.lots.find((lot) => lot.lotNumber === recap.totals.highestLotNumber)?.playerName ?? "—"
          }
        />
        <StatBlock
          label="Average price"
          value={formatLakh(recap.totals.averagePriceLakh)}
          hint={`${recap.totals.overseasSold} overseas players sold`}
        />
        <StatBlock
          label="RTM matches"
          value={recap.totals.rtmMatches}
          hint={recap.session.rulebook.rtmCards > 0 ? "Cards used to match" : "Not enabled"}
        />
        <StatBlock label="Your squad" value={user?.squad.length ?? 0} hint={`Minimum ${recap.session.rulebook.squadMin}`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="surface-card min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-faint">Your team sheet</p>
              <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">{user?.name ?? "No team"}</h2>
            </div>
            {user && <TeamBadge teamId={user.id} size={40} />}
          </div>
          {user ? (
            <>
              <div className="grid grid-cols-2 gap-3 border-b border-line px-5 py-4 sm:grid-cols-4">
                <MiniStat label="Purse spent" value={formatLakh(user.spentLakh)} />
                <MiniStat label="Purse left" value={formatLakh(user.purseLakh)} tone="text-accent2" />
                <MiniStat label="Overseas" value={`${user.overseasCount} / ${recap.session.rulebook.overseasMax}`} />
                <MiniStat label="Avg OVR" value={user.averageOvr ?? "—"} />
              </div>
              {shortfall > 0 && recap.session.status === "completed" && (
                <div className="border-b border-line bg-gold/5 px-5 py-3 text-xs leading-relaxed text-muted">
                  <span className="font-semibold text-gold">Squad shortfall: </span>
                  {shortfall} player{shortfall === 1 ? "" : "s"} below the minimum. The available lot pool was
                  exhausted; no fictional players were added.
                </div>
              )}
              <div className="px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  {(["wicketkeeper", "batter", "all-rounder", "bowler", "unknown"] as const).map((role) => {
                    const count = user.squad.filter((player) => player.role === role).length;
                    if (count === 0) return null;
                    const labels: Record<string, string> = {
                      wicketkeeper: "Wicketkeepers",
                      batter: "Batters",
                      "all-rounder": "All-rounders",
                      bowler: "Bowlers",
                      unknown: "Unclassified",
                    };
                    return (
                      <span key={role} className="chip">
                        {labels[role]} · {count}
                      </span>
                    );
                  })}
                  {retained.length > 0 && <span className="chip chip-gold">{retained.length} retained</span>}
                </div>
                <ul className="mt-4 max-h-[24rem] divide-y divide-line overflow-y-auto scrollbar-thin">
                  {user.squad.map((player) => (
                    <li key={player.playerId} className="flex items-center gap-3 py-2.5">
                      <PlayerAvatar name={player.name} teamId={user.id} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/players/${player.playerId}`} className="block truncate text-sm font-medium hover:text-accent2">
                          {player.name}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.62rem] text-faint">
                          <span>{player.role}</span>
                          {player.isOverseas && <span className="text-info">Overseas</span>}
                          {player.acquiredVia === "retained-contract" ? (
                            <span className="text-gold">Official retention</span>
                          ) : player.acquiredVia === "retained-simulated" ? (
                            <span className="text-gold">Simulated retention</span>
                          ) : player.acquiredVia === "rtm-match" ? (
                            <span className="text-violet">RTM match</span>
                          ) : null}
                          {player.age !== null && <span>{player.age} yrs</span>}
                        </p>
                      </div>
                      <span className="num text-sm font-semibold">{formatLakh(player.priceLakh)}</span>
                      <OvrBadge value={player.ovr} size="sm" />
                    </li>
                  ))}
                  {user.squad.length === 0 && (
                    <li className="py-8 text-center text-sm text-faint">No players were acquired.</li>
                  )}
                </ul>
                {playingSquad.length > 0 && (
                  <p className="mt-3 text-[0.65rem] leading-relaxed text-faint">
                    Team sheet includes {playingSquad.length} auction purchase{playingSquad.length === 1 ? "" : "s"}
                    {retained.length > 0
                      ? ` and ${retained.length} retention${retained.length === 1 ? "" : "s"}${
                          retained.every((player) => player.acquiredVia === "retained-contract")
                            ? " at official 2026 contract value"
                            : " at estimated contract value"
                        }.`
                      : "."}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="px-5 py-8 text-sm text-muted">No user franchise was recorded for this session.</p>
          )}
        </section>

        <div className="min-w-0 space-y-6">
          <section className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="font-display text-lg font-bold uppercase tracking-wide">Spend by franchise</p>
              <span className="chip">{recap.teams.length} teams</span>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[520px]">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th className="text-center">Players</th>
                    <th className="text-center">OS</th>
                    <th className="text-right">Spent</th>
                    <th className="text-right">Left</th>
                  </tr>
                </thead>
                <tbody>
                  {[...recap.teams]
                    .sort((a, b) => b.spentLakh - a.spentLakh)
                    .map((team) => (
                      <tr key={team.id} className={cn(team.isHuman && "bg-accent/5")}>
                        <td>
                          <span className="flex items-center gap-2">
                            <TeamBadge teamId={team.id} size={20} />
                            <span className="font-medium">{team.shortName}</span>
                            {team.isHuman && <span className="chip chip-accent">You</span>}
                            <span className="text-[0.6rem] uppercase tracking-[0.06em] text-faint">
                              {AI_PROFILES[team.aiProfile as AiProfileId]?.short ?? "AI"}
                            </span>
                          </span>
                        </td>
                        <td className="num text-center">{team.squad.length}</td>
                        <td className="num text-center">{team.overseasCount}</td>
                        <td className="num text-right font-semibold">{formatLakh(team.spentLakh)}</td>
                        <td className="num text-right text-muted">{formatLakh(team.purseLakh)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <section className="surface-card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="eyebrow">Full ledger</p>
            <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">Auction ledger</h2>
          </div>
          <span className="chip chip-success">
            <ShieldCheck size={12} /> {reconciled ? "Purses reconcile with hammer prices" : "Reconciliation needs review"}
          </span>
        </div>
        <RecapLedger lots={recap.lots} userTeamId={recap.session.userTeamId} />
      </section>

      <div className="print-only mt-6 text-xs text-gray-600">
        <p>IPL Auction Arena · auction {recap.session.id} · {recap.session.name}.</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div>
      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className={cn("num mt-1 font-display text-lg font-bold", tone)}>{value}</p>
    </div>
  );
}
