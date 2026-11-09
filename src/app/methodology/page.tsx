import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Calculator, GitBranch, Layers, ShieldCheck } from "lucide-react";
import { OvrBadge, PageHeader, RoleChip, SectionHeading } from "@/components/ui";
import { getPlayerProfile, listPlayers } from "@/lib/data/queries";
import { getArchiveComposition } from "@/lib/data/quality";
import { RATING_FORMULA_VERSION, ratingRoleWeights } from "@/lib/ratings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rating Methodology",
  description:
    "How IPL Auction Arena turns ball-by-ball evidence into role-weighted batting, bowling, fielding and overall ratings — with peer percentiles, reliability shrinkage and no auction prices.",
};

const PRINCIPLES = [
  {
    title: "Evidence only",
    body: "Every input is derived from IPL ball-by-ball data. Auction prices, reputation, team results and social buzz are excluded from the formula.",
    icon: ShieldCheck,
  },
  {
    title: "Role-aware",
    body: "Batting, bowling and fielding are weighted by the player's role. A specialist bowler is not punished for low run output.",
    icon: Layers,
  },
  {
    title: "Peer-relative",
    body: "Each discipline is scored against the league distribution, so era and role inflation are handled by percentile, not raw totals.",
    icon: GitBranch,
  },
  {
    title: "Sample-honest",
    body: "Thin samples are shrunk toward the league median, and evidence is graded strong, moderate, limited or insufficient.",
    icon: Calculator,
  },
];

export default function MethodologyPage() {
  const top = listPlayers({ sort: "ovr", pageSize: 1 }).players[0];
  const example = top ? getPlayerProfile(top.id) : null;
  const breakdown = example?.rating?.breakdown ?? null;
  const weights = example?.rating ? ratingRoleWeights(example.rating.role as Parameters<typeof ratingRoleWeights>[0]) : null;
  const archive = getArchiveComposition();
  const unclassified = archive.byRole.find((entry) => entry.role === "unknown")?.count ?? 0;

  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow={`Rating methodology · ${RATING_FORMULA_VERSION}`}
        title="How the numbers are built"
        description="The OVR is a transparent analytical model, not an official rating. This page shows the exact inputs, weights, thresholds and shrinkage so you can audit — or disagree with — every score."
        actions={
          <>
            <Link href="/players" className="btn btn-primary">
              Browse ratings <ArrowRight size={15} />
            </Link>
            <Link href="/sources" className="btn btn-outline">
              Data sources
            </Link>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-success">Season-end snapshots 2024–2026</span>
            <span className="chip">Ball-by-ball inputs</span>
            <span className="chip chip-gold">No auction data</span>
          </div>
        }
      />

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PRINCIPLES.map((principle) => {
          const Icon = principle.icon;
          return (
            <div key={principle.title} className="surface-card p-5">
              <Icon size={20} className="text-accent2" />
              <p className="mt-3 font-display text-base font-bold uppercase tracking-wide">{principle.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{principle.body}</p>
            </div>
          );
        })}
      </section>

      <section className="mt-14">
        <SectionHeading
          eyebrow="The pipeline"
          title="From deliveries to OVR"
          description="Six steps, applied independently for each season snapshot."
        />
        <ol className="mt-6 space-y-3">
          {[
            {
              title: "Aggregate the right matches",
              body: "Career evidence uses every IPL match up to the snapshot season. The 2026 snapshots use 2008–2025 for the auction pool, so nothing that happened after the auction leaks into a pre-auction rating. The live profile rating uses data through 2026.",
            },
            {
              title: "Build discipline inputs",
              body: "Batting: strike rate, average and boundary-ball percentage. Bowling: economy, strike rate and dot-ball percentage. Fielding: catches, stumpings (weighted 1.5) and run-outs per match. A discipline needs at least 30 balls faced / bowled, or three matches for fielding, to be scored.",
            },
            {
              title: "Compare with peer medians",
              body: "Each component is divided by the league median for players who meet the pool threshold (300 balls faced, 300 balls bowled, 10 matches). Ratios above 1.0 beat the peer median; economy and bowling strike rate are inverted so lower is better.",
            },
            {
              title: "Convert to percentile and shrink",
              body: "The weighted ratio becomes a percentile. Reliability is balls/(balls+240) for batting and bowling, and matches/(matches+12) for fielding. The adjusted percentile pulls small samples halfway toward the league median.",
            },
            {
              title: "Map to a 25–99 scale",
              body: "Rating = 32 + 66 × adjusted percentile, clamped to 25–99. A league-median player lands around 65; elite peer-relative output approaches the high 90s.",
            },
            {
              title: "Blend recent form",
              body: "When the last two seasons provide at least 60 balls, a separate form percentile is computed and blended at 10–15% depending on the recent volume. Career evidence remains the anchor.",
            },
          ].map((step, index) => (
            <li key={step.title} className="panel flex gap-4 p-4 sm:p-5">
              <span className="num-pill h-8 min-w-8 shrink-0">{index + 1}</span>
              <div>
                <p className="font-display text-base font-bold uppercase tracking-wide">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14">
        <SectionHeading
          eyebrow="Role weights"
          title="Different jobs, different weights"
          description="Base weights are renormalised when a discipline has no valid sample, so a missing score never acts as a zero."
        />
        <div className="surface-card mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[560px]">
              <thead>
                <tr>
                  <th>Role</th>
                  <th className="text-right">Batting</th>
                  <th className="text-right">Bowling</th>
                  <th className="text-right">Fielding</th>
                </tr>
              </thead>
              <tbody>
                {(["batter", "bowler", "all-rounder", "wicketkeeper", "unknown"] as const).map((role) => {
                  const weight = ratingRoleWeights(role);
                  return (
                    <tr key={role}>
                      <td>
                        <RoleChip role={role} label={role === "unknown" ? "Unclassified" : role.replace("-", " ")} />
                      </td>
                      <td className="num text-right">{Math.round(weight.batting * 100)}%</td>
                      <td className="num text-right">{Math.round(weight.bowling * 100)}%</td>
                      <td className="num text-right">{Math.round(weight.fielding * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          Role labels come from the supplied player registry or are inferred during import. {unclassified.toLocaleString("en-IN")} of{" "}
          {archive.total.toLocaleString("en-IN")} players in the archive remain unclassified; they receive the default split
          and a clear label in the UI rather than a fabricated role.
        </p>
      </section>

      <section className="mt-14">
        <SectionHeading
          eyebrow="Worked example"
          title={example ? `Inside ${example.player.name}'s OVR` : "Inside an OVR"}
          description="A live record from the database, showing every component, peer median and reliability figure the model used."
        />
        {example?.rating && breakdown ? (
          <div className="surface-card mt-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <OvrBadge value={example.rating.ovr} size="lg" />
                <div>
                  <Link href={`/players/${example.player.id}`} className="font-display text-2xl font-bold uppercase tracking-wide hover:text-accent2">
                    {example.player.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <RoleChip role={example.rating.role} label={example.player.roleLabel} />
                    <span className="text-xs text-faint">
                      {example.rating.evidenceQuality} evidence · as of {example.rating.asOfSeason} · #{example.rating.rank} of{" "}
                      {example.rating.ratedPlayers}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="chip">Bat {example.rating.batting ?? "—"}</span>
                <span className="chip">Bowl {example.rating.bowling ?? "—"}</span>
                <span className="chip">Field {example.rating.fielding ?? "—"}</span>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {(
                [
                  ["Batting", breakdown.batting],
                  ["Bowling", breakdown.bowling],
                  ["Fielding", breakdown.fielding],
                ] as const
              ).map(([label, discipline]) => (
                <div key={label} className="panel p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">{label}</p>
                    <p className="num font-display text-xl font-bold">{discipline?.rating ?? "—"}</p>
                  </div>
                  {discipline ? (
                    <>
                      <p className="num mt-1 text-[0.6rem] text-faint">
                        percentile {discipline.percentile !== null ? `${Math.round(discipline.percentile * 100)}th` : "—"} · reliability{" "}
                        {discipline.reliability !== null ? `${Math.round(discipline.reliability * 100)}%` : "—"}
                        {discipline.formRating !== null ? ` · form ${discipline.formRating}` : ""}
                      </p>
                      <table className="data-table mt-2">
                        <thead>
                          <tr>
                            <th>Input</th>
                            <th className="text-right">Player</th>
                            <th className="text-right">Peer</th>
                            <th className="text-right">Ratio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {discipline.components.map((component) => (
                            <tr key={component.label}>
                              <td className="text-[0.68rem]">{component.label}</td>
                              <td className="num text-right text-[0.68rem]">{component.value ?? "—"}</td>
                              <td className="num text-right text-[0.68rem] text-faint">{component.peerMedian ?? "—"}</td>
                              <td className="num text-right text-[0.68rem]">{component.ratio?.toFixed(2) ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : (
                    <p className="mt-2 text-[0.68rem] leading-relaxed text-faint">
                      Below the minimum sample for this discipline, so it carries no weight.
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="panel p-4 text-xs">
                <p className="font-semibold">Effective weights in this OVR</p>
                <ul className="mt-2 space-y-1 text-muted">
                  <li>Batting: {Math.round((breakdown.effectiveWeights?.batting ?? 0) * 100)}%</li>
                  <li>Bowling: {Math.round((breakdown.effectiveWeights?.bowling ?? 0) * 100)}%</li>
                  <li>Fielding: {Math.round((breakdown.effectiveWeights?.fielding ?? 0) * 100)}%</li>
                </ul>
                {weights && (
                  <p className="mt-2 text-[0.62rem] text-faint">
                    Base role weights: {Math.round(weights.batting * 100)} / {Math.round(weights.bowling * 100)} /{" "}
                    {Math.round(weights.fielding * 100)}. Missing disciplines are removed and the remainder renormalised.
                  </p>
                )}
              </div>
              <div className="panel p-4 text-xs">
                <p className="font-semibold">Peer pool</p>
                <ul className="mt-2 space-y-1 text-muted">
                  <li>Batting pool: {breakdown.pools?.batting ?? "—"} qualified players</li>
                  <li>Bowling pool: {breakdown.pools?.bowling ?? "—"} qualified players</li>
                  <li>Fielding pool: {breakdown.pools?.fielding ?? "—"} qualified players</li>
                  <li>Median SR: {breakdown.medians?.strikeRate ?? "—"} · median economy: {breakdown.medians?.economy ?? "—"}</li>
                </ul>
              </div>
            </div>
            <p className="mt-4 text-[0.62rem] text-faint">
              Formula {example.rating.formulaVersion} · snapshot {example.rating.asOfSeason}. The numbers above are the exact
              values stored with the rating, not a retrospective illustration.
            </p>
          </div>
        ) : (
          <div className="panel mt-6 p-5 text-sm text-muted">The rating example is unavailable in the current database.</div>
        )}
      </section>

      <section className="mt-14">
        <SectionHeading
          eyebrow="Team strength"
          title="Beyond a flat squad average"
          description="Franchise dashboards use two complementary measures, because a star-heavy XI and a deep squad are different things."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="surface-card p-5">
            <p className="font-display text-lg font-bold uppercase tracking-wide text-success">Best XI OVR</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              The model selects the highest-rated eleven that still contains at least one wicketkeeper and four bowling
              options. All-rounders count on both sides. The result rewards a balanced XI rather than eleven stacked
              specialist batters, and it discards bench noise.
            </p>
          </div>
          <div className="surface-card p-5">
            <p className="font-display text-lg font-bold uppercase tracking-wide text-info">Squad OVR</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              The mean of every rated player in the 2026 appearance roster. This measures depth: a lower Best XI OVR
              with a strong Squad OVR suggests a roster with cover; the reverse suggests a top-heavy squad.
            </p>
          </div>
        </div>
        <div className="panel mt-4 p-4 text-xs leading-relaxed text-faint">
          Team scores are descriptive, not predictive. They do not simulate match results, account for playing-time
          distribution or claim to reproduce an official franchise ranking.
        </div>
      </section>

      <section className="mt-14">
        <SectionHeading
          eyebrow="Honesty"
          title="What the model does not see"
          description="The following are deliberate exclusions, not oversights."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="panel p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle size={15} className="text-gold" /> Not modelled
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
              <li>· Batting position, team situation, pressure, target and pitch conditions</li>
              <li>· Bowling phases beyond overall figures, match-ups, captaincy and field placement</li>
              <li>· Injuries, availability, temperament, training and dressing-room impact</li>
              <li>· Contract values, auction prices, brand value and retention decisions</li>
              <li>· Domestic form, international form and non-IPL competitions</li>
            </ul>
          </div>
          <div className="panel p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={15} className="text-success" /> Guardrails
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
              <li>· Each snapshot is season-bounded; no future matches leak backwards.</li>
              <li>· Auction outcomes are stored separately and never join the rating query.</li>
              <li>· Season simulation uses the auction-cutoff rating snapshot; simulated results never rewrite it.</li>
              <li>· Evidence quality is displayed on every rated profile and comparison.</li>
              <li>· Unrated players are shown as unrated, never given a placeholder OVR.</li>
              <li>· Missing components are dropped and the remaining weights renormalised.</li>
            </ul>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/admin" className="btn btn-ghost btn-sm">
            Data quality dashboard
          </Link>
          <Link href="/sources" className="btn btn-ghost btn-sm">
            Sources & licences
          </Link>
        </div>
      </section>
    </div>
  );
}
