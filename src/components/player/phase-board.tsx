import { AlertTriangle, Gauge, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import type { PlayerProfile } from "@/lib/data/queries";
import { roleLabel } from "@/lib/data/queries";
import { marketValueFor, valueSurplusLakh } from "@/lib/market-value";
import { formatLakh } from "@/lib/money";
import { ovrTier } from "@/components/ui";
import { cn } from "@/lib/cn";

type Phases = PlayerProfile["phases"];

const PHASE_NOTE = "Powerplay = overs 1–6 · middle = 7–15 · death = 16–20. Career ball-by-ball totals.";

export function PhaseBoard({ phases }: { phases: Phases }) {
  if (phases.batting.length === 0 && phases.bowling.length === 0) {
    return (
      <div className="panel mt-5 p-5 text-sm text-muted">
        No phase split is available for this player. The archival ball-by-ball sample does not carry enough
        deliveries by phase.
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      {phases.batting.length > 0 && (
        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-info" />
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.12em]">Batting by phase</h3>
            <span className="ml-auto text-[0.58rem] uppercase tracking-[0.12em] text-faint">Strike rate</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {phases.batting.map((phase) => {
              const width = Math.max(3, Math.min(100, ((phase.strikeRate ?? 0) / 200) * 100));
              return (
                <div key={phase.key} className="rounded-xl border border-line bg-surface2/40 p-3.5">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-faint">
                    {phase.label}
                  </p>
                  <p className="num mt-1 font-display text-2xl font-bold text-info">
                    {phase.strikeRate !== null ? phase.strikeRate.toFixed(1) : "—"}
                  </p>
                  <div className="progress-track mt-2 h-1.5">
                    <div className="h-full rounded-full bg-info" style={{ width: `${width}%` }} />
                  </div>
                  <p className="num mt-2 text-[0.62rem] text-muted">
                    {phase.runs.toLocaleString("en-IN")} runs · {phase.balls} balls
                  </p>
                  <p className="num text-[0.6rem] text-faint">
                    Avg {phase.average !== null ? phase.average.toFixed(1) : "—"} · Boundary{" "}
                    {phase.boundaryPercent !== null ? `${phase.boundaryPercent.toFixed(0)}%` : "—"}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[0.58rem] text-faint">{PHASE_NOTE}</p>
        </div>
      )}

      {phases.bowling.length > 0 && (
        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <Gauge size={15} className="text-danger" />
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.12em]">Bowling by phase</h3>
            <span className="ml-auto text-[0.58rem] uppercase tracking-[0.12em] text-faint">Economy</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {phases.bowling.map((phase) => {
              const width = Math.max(3, Math.min(100, phase.dotPercent ?? 0));
              return (
                <div key={phase.key} className="rounded-xl border border-line bg-surface2/40 p-3.5">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-faint">
                    {phase.label}
                  </p>
                  <p className="num mt-1 font-display text-2xl font-bold text-danger">
                    {phase.economy !== null ? phase.economy.toFixed(2) : "—"}
                  </p>
                  <div className="progress-track mt-2 h-1.5">
                    <div className="h-full rounded-full bg-danger" style={{ width: `${width}%` }} />
                  </div>
                  <p className="num mt-2 text-[0.62rem] text-muted">
                    {phase.wickets} wkts · {Math.floor(phase.balls / 6)}.
                    {phase.balls % 6} overs
                  </p>
                  <p className="num text-[0.6rem] text-faint">
                    Dot {phase.dotPercent !== null ? `${phase.dotPercent.toFixed(0)}%` : "—"} · bar = dot share
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[0.58rem] text-faint">{PHASE_NOTE}</p>
        </div>
      )}
    </div>
  );
}

function buildScoutingReport(profile: PlayerProfile): { headline: string; strengths: string[]; risks: string[] } {
  const { player, rating, career, phases, auctionHistory, evidence } = profile;
  const tier = ovrTier(rating?.ovr);
  const strengths: string[] = [];
  const risks: string[] = [];

  const bestBatting = [...phases.batting]
    .filter((phase) => phase.balls >= 60 && phase.strikeRate !== null)
    .sort((a, b) => (b.strikeRate ?? 0) - (a.strikeRate ?? 0))[0];
  const bestBowling = [...phases.bowling]
    .filter((phase) => phase.balls >= 60 && phase.economy !== null)
    .sort((a, b) => (a.economy ?? 99) - (b.economy ?? 99))[0];
  const worstBowling = [...phases.bowling]
    .filter((phase) => phase.balls >= 60 && phase.economy !== null)
    .sort((a, b) => (b.economy ?? 0) - (a.economy ?? 0))[0];

  if (bestBatting?.strikeRate) {
    strengths.push(
      `Scores at ${bestBatting.strikeRate.toFixed(1)} per 100 balls in the ${bestBatting.label.toLowerCase()} (${bestBatting.balls} balls).`,
    );
  }
  if (bestBowling && bestBowling.economy !== null) {
    strengths.push(
      `Bowls the ${bestBowling.label.toLowerCase()} at ${bestBowling.economy.toFixed(2)} an over with ${bestBowling.wickets} wickets.`,
    );
  }
  if (evidence.boundaryPercent !== null && evidence.boundaryPercent >= 45) {
    strengths.push(
      `Boundary runs make up ${evidence.boundaryPercent.toFixed(0)}% of career runs — a genuine scoring-rate lever.`,
    );
  }
  if (career.catches + career.stumpings + career.runOuts >= 40) {
    strengths.push(
      `${career.catches + career.stumpings + career.runOuts} fielding dismissals across ${career.matches} matches.`,
    );
  }
  if (rating?.evidenceQuality === "strong") {
    strengths.push(`Strong rated sample: ${rating.sample?.matches ?? career.matches} matches of role-relevant evidence.`);
  }
  if (strengths.length === 0) {
    strengths.push("Registered IPL career evidence supplies the baseline rating even where the sample is thin.");
  }

  if (rating?.evidenceQuality && rating.evidenceQuality !== "strong") {
    risks.push(
      `${rating.evidenceQuality === "limited" ? "Limited" : "Thin"} evidence — ${rating.sample?.matches ?? career.matches} matches in the rated sample.`,
    );
  }
  if (worstBowling && worstBowling.economy !== null && worstBowling.economy >= 9.5) {
    risks.push(
      `Concedes ${worstBowling.economy.toFixed(2)} an over in the ${worstBowling.label.toLowerCase()} — a phase to protect.`,
    );
  }
  if (career.ballsFaced >= 200 && career.strikeRate !== null && career.strikeRate < 128) {
    risks.push(`Career strike rate of ${career.strikeRate.toFixed(1)} caps scoring upside in a high-tempo auction.`);
  }
  if (player.age !== null && player.age >= 36) {
    risks.push(`Age ${player.age} — a short-term signing rather than a multi-season build.`);
  }
  if (!latestAuctionPrice(auctionHistory)) {
    risks.push("No verified 2026 auction price to anchor the market.");
  }
  if (player.isOverseas) {
    risks.push("Occupies an overseas slot, which caps how many franchises can bid.");
  }
  if (risks.length === 0) {
    risks.push("No material evidence risk flagged — the market will price the role premium.");
  }

  const headline = rating?.ovr
    ? `${tier.label} ${roleLabel(player.role).toLowerCase()} at ${rating.ovr} OVR`
    : `${roleLabel(player.role)} without a rated OVR sample`;

  return { headline, strengths: strengths.slice(0, 3), risks: risks.slice(0, 3) };
}

function latestAuctionPrice(history: PlayerProfile["auctionHistory"]): number | null {
  return history.find((entry) => entry.winningBidLakh !== null)?.winningBidLakh ?? null;
}

export function ScoutingReport({ profile }: { profile: PlayerProfile }) {
  const { headline, strengths, risks } = buildScoutingReport(profile);
  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-accent2" />
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">Scouting report</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">{headline}.</p>
      </div>
      <div className="grid gap-5 p-5 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-success">
            <ShieldCheck size={12} /> Strengths
          </p>
          <ul className="mt-2.5 space-y-2 text-[0.72rem] leading-relaxed text-muted">
            {strengths.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-gold">
            <AlertTriangle size={12} /> Watch
          </p>
          <ul className="mt-2.5 space-y-2 text-[0.72rem] leading-relaxed text-muted">
            {risks.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="border-t border-line px-5 py-3 text-[0.58rem] leading-relaxed text-faint">
        Generated from the same evidence that builds the rating. It is an analytical summary, not a scouting
        opinion, and auction prices never enter it.
      </p>
    </div>
  );
}

const GAUGE_MAX_LAKH = 3_000;

export function MarketValueGauge({ profile }: { profile: PlayerProfile }) {
  const player = profile.player;
  const market = marketValueFor({
    ovr: profile.rating?.ovr ?? null,
    batting: profile.rating?.batting ?? null,
    bowling: profile.rating?.bowling ?? null,
    role: profile.rating?.role ?? player.role,
    age: player.age,
    evidenceQuality: profile.rating?.evidenceQuality ?? null,
    isOverseas: player.isOverseas,
    basePriceLakh: player.auctionBaseLakh,
    seasons: profile.rating?.sample?.seasons ?? null,
    lastSeason: profile.rating?.sample?.lastSeason ?? null,
    asOfSeason: profile.rating?.asOfSeason ?? null,
  });
  const actual = latestAuctionPrice(profile.auctionHistory);
  const surplus = actual !== null ? valueSurplusLakh(actual, market.valueLakh) : null;
  const delta = surplus !== null && market.valueLakh > 0 ? (surplus / market.valueLakh) * 100 : null;
  const percent = Math.max(1, Math.min(100, (market.valueLakh / GAUGE_MAX_LAKH) * 100));
  const lowPercent = Math.max(1, Math.min(100, (market.lowLakh / GAUGE_MAX_LAKH) * 100));
  const highPercent = Math.max(1, Math.min(100, (market.highLakh / GAUGE_MAX_LAKH) * 100));

  return (
    <div className="surface-card p-5">
      <div className="flex items-center gap-2">
        <Gauge size={16} className="text-accent2" />
        <h2 className="font-display text-lg font-bold uppercase tracking-wide">Fair market value</h2>
        <span className="ml-auto rounded-full border border-accent2/40 bg-accent2/10 px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.14em] text-accent2">
          {market.tier}
        </span>
      </div>
      <p className="stat-value mt-3 text-3xl text-accent2">{formatLakh(market.valueLakh)}</p>
      <p className="mt-1 text-xs text-faint">
        Exact worth-for-money estimate
        {profile.rating?.ovr ? ` from ${profile.rating.ovr} OVR` : ""}
        {player.age !== null ? `, age ${player.age}` : ", age unverified"}. Expected range{" "}
        {formatLakh(market.lowLakh)} – {formatLakh(market.highLakh)}.
      </p>
      <div className="relative mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-surface3">
          <div
            className="absolute h-2 rounded-full bg-accent2/25"
            style={{ left: `${lowPercent}%`, width: `${Math.max(1, highPercent - lowPercent)}%` }}
          />
          <div
            className="relative h-full rounded-full"
            style={{ width: `${percent}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }}
          />
        </div>
        <span
          className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-fg shadow"
          style={{ left: `calc(${percent}% - 2px)` }}
          aria-hidden="true"
        />
        <div className="mt-1.5 flex justify-between text-[0.55rem] text-faint">
          <span>₹0</span>
          <span>₹15 Cr</span>
          <span>₹30 Cr</span>
        </div>
      </div>
      <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[0.68rem]">
        {market.factors.map((factor) => (
          <div key={factor.label} className="flex items-baseline gap-2">
            <dt className="shrink-0 font-semibold text-muted">{factor.label}</dt>
            <dd className="num shrink-0 text-faint">×{factor.multiplier.toFixed(2)}</dd>
            <dd className="truncate text-faint" title={factor.note}>
              {factor.note}
            </dd>
          </div>
        ))}
      </dl>
      {actual !== null && (
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs">
          <span className="text-faint">Actual 2026 price</span>
          <span className="num font-semibold">{formatLakh(actual)}</span>
          {delta !== null && (
            <span className={cn("num font-semibold", delta <= 0 ? "text-success" : "text-danger")}>
              {surplus !== null && surplus > 0 ? "overpaid " : "saved "}
              {Math.abs(delta).toFixed(0)}%
            </span>
          )}
        </div>
      )}
      <p className="mt-3 text-[0.58rem] leading-relaxed text-faint">
        {market.rationale}. The AI managers anchor their bidding to this fair value, then adjust for their own
        aggression, squad needs and purse pressure — it is not a prediction of the hammer price.
      </p>
    </div>
  );
}
