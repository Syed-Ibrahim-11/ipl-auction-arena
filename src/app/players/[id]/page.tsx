import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BarChart3, Gavel } from "lucide-react";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import { DisciplineCard, RatingRadar, SeasonTrend } from "@/components/player/rating-viz";
import { EvidenceBadge, RoleChip, SectionHeading } from "@/components/ui";
import { getPlayerBrand } from "@/lib/brand-assets";
import { getPlayerProfile, isCurrentPlayer, roleLabel } from "@/lib/data/queries";
import { formatLakh } from "@/lib/money";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = getPlayerProfile(id);
  if (!profile) return { title: "Player not found" };
  const { player } = profile;
  return {
    title: `${player.name} · Player profile`,
    description: `${player.name} — ${player.roleLabel.toLowerCase()}${player.teamShort ? ` for ${player.teamShort}` : ""}. IPL career evidence, season splits and 2026 auction context.`,
  };
}

function statOrDash(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export default async function PlayerPage({ params }: PageProps) {
  const { id } = await params;
  const profile = getPlayerProfile(id);
  if (!profile) notFound();

  const {
    player,
    rating,
    career,
    seasonStats,
    auctionHistory,
    similar,
    evidence,
  } = profile;
  const current = isCurrentPlayer(player.id);
  const brand = getPlayerBrand(player.id, player.name);
  const latestAuction = auctionHistory[0] ?? null;
  const careerSpan =
    career.firstSeason !== null && career.lastSeason !== null
      ? career.firstSeason === career.lastSeason
        ? `${career.firstSeason}`
        : `${career.firstSeason}–${career.lastSeason}`
      : null;

  return (
    <div className="container-page py-8 sm:py-12">
      <Link href="/players" className="link-arrow text-xs">
        <ArrowLeft size={14} /> Back to player explorer
      </Link>

      {!current && (
        <div className="mt-4 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-gold">Historical profile. </span>
          {player.name} is not in the current IPL 2026 pool, so they cannot be signed or selected in
          new auctions and seasons. The career record is kept for archive and evidence purposes.
        </div>
      )}

      <section className="surface-card mt-5 overflow-hidden">
        <div
          className="relative p-5 sm:p-7"
          style={{
            background: "linear-gradient(120deg, color-mix(in srgb, var(--accent) 13%, transparent), transparent 58%)",
          }}
        >
          <div className="grid gap-6 md:grid-cols-[170px_1fr_auto] md:items-start">
            <div className="max-w-[190px]">
              <PlayerAvatar
                name={player.name}
                teamId={player.primaryTeamId}
                role={player.role}
                country={player.country}
                size="hero"
                showNote
              />
              <p className="mt-2 text-center text-[0.58rem] uppercase tracking-[0.14em] text-faint">
                {brand ? "Official squad portrait · iplt20.com" : "Illustrated fallback portrait"}
              </p>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <RoleChip role={player.role} label={player.roleLabel} />
                {brand?.jersey && <span className="chip">No. {brand.jersey}</span>}
                {player.isOverseas !== null && (
                  <span className={player.isOverseas ? "chip chip-info" : "chip"}>{player.isOverseas ? "Overseas" : "Domestic"}</span>
                )}
                {player.capped !== null && (
                  <span className="chip">{player.capped ? "Capped" : "Uncapped"}</span>
                )}
                {rating && <EvidenceBadge quality={rating.evidenceQuality} />}
              </div>

              <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.8rem)] font-bold uppercase leading-[0.94] tracking-[0.01em]">
                {player.name}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                {player.teamId ? (
                  <Link href={`/teams/${player.teamId}`} className="flex items-center gap-2 font-semibold text-fg hover:text-accent2">
                    <TeamBadge teamId={player.teamId} size={22} />
                    {player.teamName} <span className="text-faint">({player.teamShort})</span>
                  </Link>
                ) : (
                  <span>Franchise unavailable</span>
                )}
                <span>{player.country ?? "Country unavailable"}</span>
                {player.age !== null && <span>{player.age} years</span>}
                {careerSpan && <span className="num">IPL {careerSpan}</span>}
              </div>

              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
                {player.battingStyle && <span>Bat: {player.battingStyle}</span>}
                {player.bowlingStyle && <span>Bowl: {player.bowlingStyle}</span>}
                {player.nationality && <span>Nationality: {player.nationality}</span>}
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/compare?p=${player.id}`} className="btn btn-primary btn-sm">
                  <BarChart3 size={15} /> Compare this player
                </Link>
                {player.teamId && (
                  <Link href={`/teams/${player.teamId}`} className="btn btn-ghost btn-sm">
                    Team dashboard <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            </div>

          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Matches", value: career.matches.toLocaleString("en-IN") },
            { label: "Runs", value: career.runs.toLocaleString("en-IN") },
            { label: "Strike rate", value: statOrDash(career.strikeRate, 1) },
            { label: "Wickets", value: career.wickets.toLocaleString("en-IN") },
            { label: "Economy", value: statOrDash(career.economy) },
            {
              label: "2026 price",
              value: latestAuction?.winningBidLakh ? formatLakh(latestAuction.winningBidLakh) : "Not sold",
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface p-4">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-faint">{stat.label}</p>
              <p className="stat-value mt-1.5 text-xl">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.55fr_1fr]">
        <div className="min-w-0 space-y-10">
          <section>
            <SectionHeading
              eyebrow="The evidence"
              title="How the rating is built"
              description="Performance-only inputs, weighted by role and adjusted for sample reliability. Auction prices never enter the formula."
            />
            {rating?.breakdown ? (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-[240px_1fr]">
                  <div className="panel flex flex-col items-center justify-center p-4">
                    <RatingRadar batting={rating.batting} bowling={rating.bowling} fielding={rating.fielding} />
                    <div className="mt-2 grid w-full grid-cols-3 gap-1 text-center">
                      {[
                        { label: "Bat", value: rating.batting, color: "var(--info)" },
                        { label: "Bowl", value: rating.bowling, color: "var(--danger)" },
                        { label: "Field", value: rating.fielding, color: "var(--success)" },
                      ].map((entry) => (
                        <div key={entry.label}>
                          <p className="text-[0.56rem] uppercase tracking-[0.12em] text-faint">{entry.label}</p>
                          <p className="num font-display text-lg font-bold" style={{ color: entry.value === null ? "var(--faint)" : entry.color }}>
                            {entry.value ?? "—"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DisciplineCard title="Batting" discipline={rating.breakdown.batting ?? null} accent="var(--info)" />
                    <DisciplineCard title="Bowling" discipline={rating.breakdown.bowling ?? null} accent="var(--danger)" />
                    <DisciplineCard title="Fielding" discipline={rating.breakdown.fielding ?? null} accent="var(--success)" />
                    <div className="panel p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">Role weights</p>
                      <ul className="mt-3 space-y-2 text-xs">
                        {(
                          [
                            ["batting", rating.breakdown.effectiveWeights?.batting ?? rating.breakdown.weights?.batting, "var(--info)"],
                            ["bowling", rating.breakdown.effectiveWeights?.bowling ?? rating.breakdown.weights?.bowling, "var(--danger)"],
                            ["fielding", rating.breakdown.effectiveWeights?.fielding ?? rating.breakdown.weights?.fielding, "var(--success)"],
                          ] as const
                        ).map(([label, weight, color]) => (
                          <li key={label} className="flex items-center justify-between gap-2">
                            <span className="capitalize text-muted">{label}</span>
                            <span className="num text-fg">{weight !== null && weight !== undefined ? `${Math.round(weight * 100)}%` : "—"}</span>
                            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface3">
                              <span
                                className="block h-full rounded-full"
                                style={{ width: `${Math.min(100, (weight ?? 0) * 100)}%`, background: color }}
                              />
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 border-t border-line pt-2 text-[0.6rem] leading-relaxed text-faint">
                        Formula {rating.formulaVersion} · rated as of {rating.asOfSeason}
                        {rating.sample?.matches !== undefined
                          ? ` · ${rating.sample.matches} matches in sample`
                          : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="panel mt-5 p-5 text-sm text-muted">
                This player does not have enough role-relevant IPL evidence for a rated profile yet. They remain in
                the registry and auction pool without a published overall score.
              </div>
            )}
          </section>

          <section>
            <SectionHeading
              eyebrow="Season by season"
              title="Career arc"
              description="Runs and wickets per IPL season, including every franchise stint in the archive."
            />
            <div className="surface-card mt-5 p-5">
              <SeasonTrend seasons={seasonStats.map((row) => ({ season: row.season, runs: row.runs, wickets: row.wickets, matches: row.matches }))} />
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-5">
          <div className="surface-card p-5">
            <div className="flex items-center gap-2">
              <Gavel size={16} className="text-accent2" />
              <h2 className="font-display text-lg font-bold uppercase tracking-wide">2026 auction</h2>
            </div>
            {latestAuction ? (
              <>
                <p className="mt-3 font-display text-3xl font-bold text-accent2">
                  {latestAuction.winningBidLakh !== null ? formatLakh(latestAuction.winningBidLakh) : "Unsold"}
                </p>
                <p className="mt-1 text-xs text-faint">
                  {latestAuction.basePriceVerified ? "Verified" : "Estimated"} base {formatLakh(latestAuction.basePriceLakh)}
                  {latestAuction.cappedLabel ? ` · ${latestAuction.cappedLabel}` : ""}
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  {latestAuction.buyerTeamId ? (
                    <>
                      <TeamBadge teamId={latestAuction.buyerTeamId} size={22} />
                      <span className="font-semibold">{latestAuction.buyerName}</span>
                    </>
                  ) : (
                    <span className="text-muted">No 2026 buyer recorded</span>
                  )}
                </div>
                <p className="mt-4 border-t border-line pt-3 text-[0.65rem] leading-relaxed text-faint">
                  This is the actual supplied auction outcome, shown as context only. It is hidden inside live auction
                  rooms and excluded from the rating formula.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">
                This player was not part of the supplied 2026 sold-player list. Their rating still uses IPL
                performance data only.
              </p>
            )}
          </div>

          {auctionHistory.length > 0 && (
            <div className="surface-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="font-display text-lg font-bold uppercase tracking-wide">Auction history</h2>
                <span className="chip chip-compact">{auctionHistory.length} years</span>
              </div>
              <ul className="divide-y divide-line">
                {auctionHistory.map((entry) => {
                  const premium =
                    entry.winningBidLakh !== null && entry.basePriceLakh > 0
                      ? ((entry.winningBidLakh / entry.basePriceLakh - 1) * 100)
                      : null;
                  return (
                    <li key={entry.year} className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="num-pill">{entry.year}</span>
                        <span className="ml-auto num text-sm font-semibold">
                          {entry.winningBidLakh !== null ? formatLakh(entry.winningBidLakh) : "Unsold"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.65rem] text-faint">
                        {entry.buyerTeamId ? (
                          <span className="flex items-center gap-1.5 text-muted">
                            <TeamBadge teamId={entry.buyerTeamId} size={14} />
                            {entry.buyerName ?? "Franchise"}
                          </span>
                        ) : (
                          <span>No buyer</span>
                        )}
                        <span>· base {formatLakh(entry.basePriceLakh)}</span>
                        {premium !== null && (
                          <span className={premium >= 0 ? "text-success" : "text-danger"}>
                            · {premium >= 0 ? "+" : ""}
                            {premium.toFixed(0)}%
                          </span>
                        )}
                        {!entry.basePriceVerified && <span>· estimated base</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="surface-card p-5">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide">Career ledger</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
              {[
                ["Innings", career.inningsBat],
                ["High score", `${career.highScore}${career.highScoreNotOut ? "*" : ""}`],
                ["Average", statOrDash(career.average)],
                ["Fours", career.fours],
                ["Sixes", career.sixes],
                ["Fifties", career.fifties],
                ["Hundreds", career.hundreds],
                ["Overs bowled", career.overs],
                ["Bowling avg", statOrDash(career.bowlingAverage)],
                ["Bowl SR", statOrDash(career.bowlingStrikeRate, 1)],
                ["Dot balls", statOrDash(career.dotPercent, 1) + (career.dotPercent !== null ? "%" : "")],
                ["Catches", career.catches],
                ["Stumpings", career.stumpings],
                ["Run-outs", career.runOuts],
                ["Boundary share", evidence.boundaryPercent !== null ? `${evidence.boundaryPercent.toFixed(1)}%` : "—"],
              ]
                .filter(([, value]) => value !== null)
                .map(([label, value]) => (
                  <div key={String(label)} className="flex items-baseline justify-between gap-2 border-b border-line/50 pb-1.5">
                    <dt className="text-faint">{label}</dt>
                    <dd className="num font-semibold">{value === "" ? "—" : String(value)}</dd>
                  </div>
                ))}
            </dl>
            <p className="mt-3 text-[0.6rem] text-faint">
              Dismissals counted from ball-by-ball data · {career.matches} matches · {career.wickets} wickets
            </p>
          </div>

          {similar.length > 0 && (
            <div className="surface-card p-5">
              <h2 className="font-display text-lg font-bold uppercase tracking-wide">Similar profiles</h2>
              <p className="mt-1 text-[0.68rem] text-faint">Same role, comparable career output.</p>
              <ul className="mt-3 divide-y divide-line/60">
                {similar.map((entry) => (
                  <li key={entry.id}>
                    <Link href={`/players/${entry.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-accent2">
                      <span className="flex min-w-0 items-center gap-2">
                        <PlayerAvatar name={entry.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{entry.name}</span>
                          <span className="text-[0.62rem] text-faint">
                            {roleLabel(entry.role)}
                            {entry.teamShort ? ` · ${entry.teamShort}` : ""}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel p-4 text-[0.62rem] leading-relaxed text-faint">
            <strong className="text-muted">Evidence sources:</strong> Cricsheet ball-by-ball IPL archive (ODC-BY
            1.0){player.wikidataId ? ", Wikidata identity fields (CC0)" : ""}.{" "}
            {brand
              ? "Squad portrait and jersey number retrieved from iplt20.com and remain the property of their owners."
              : "Illustrated fallback portrait — no official photograph is bundled for this player."}{" "}
            Ratings are analytical, not official.
          </div>
        </aside>
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <Link href="/players" className="btn btn-ghost btn-sm">
          <ArrowLeft size={14} /> All players
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link href={`/compare?p=${player.id}`} className="btn btn-outline btn-sm">
            Compare
          </Link>
        </div>
      </div>
    </div>
  );
}
