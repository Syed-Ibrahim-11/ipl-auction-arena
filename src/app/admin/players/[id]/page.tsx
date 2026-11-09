import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleDollarSign, ShieldCheck, Sparkles } from "lucide-react";
import { AdminLogin } from "@/components/admin/admin-login";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import { EvidenceBadge, OvrBadge, RoleChip, SectionHeading, StatBlock } from "@/components/ui";
import { adminConfigured, isAdminAuthenticated } from "@/lib/admin/auth";
import { loadAdminPlayer } from "@/lib/admin/players";
import { formatLakh } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Player record",
  description: "Operator view of a single player: portrait, IPL career record, overall rating and fair price.",
  robots: { index: false, follow: false },
};

export default async function AdminPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return <AdminLogin configured={adminConfigured()} />;
  }

  const { id } = await params;
  const player = loadAdminPlayer(id);
  if (!player) notFound();

  const { career, fairValue } = player;
  const bowled = career.wickets > 0 || career.overs !== "0.0";

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/players" className="btn btn-ghost btn-sm">
          <ArrowLeft size={14} /> Player ledger
        </Link>
        <span className="chip chip-success">
          <ShieldCheck size={11} /> Operator view
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="surface-card h-fit p-4">
          <PlayerAvatar
            name={player.name}
            teamId={player.teamId}
            role={player.role}
            country={player.country}
            size="hero"
          />
          <div className="mt-4">
            <h1 className="font-display text-2xl font-black uppercase leading-tight tracking-wide">{player.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <RoleChip role={player.role} label={player.roleLabel} />
              {player.teamShort && (
                <span className="chip">
                  <TeamBadge teamId={player.teamId} size={14} /> {player.teamShort}
                </span>
              )}
              {player.isOverseas && <span className="chip chip-info">Overseas</span>}
              {player.capped === false && <span className="chip">Uncapped</span>}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-faint">
              {player.country ?? "Country unavailable"} ·{" "}
              {player.age === null ? "Age unverified" : `${player.age} years old`} ·{" "}
              {career.firstSeason && career.lastSeason
                ? `IPL ${career.firstSeason}–${career.lastSeason}`
                : "IPL seasons not recorded"}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
            <div className="panel flex flex-col items-center gap-2 p-3 text-center">
              <OvrBadge value={player.ovr} size="lg" />
              <span className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-faint">
                Overall rating
              </span>
            </div>
            <div className="panel flex flex-col items-center justify-center gap-1 p-3 text-center">
              <CircleDollarSign size={18} className="text-gold" />
              <p className="num font-display text-xl font-bold leading-none">
                {fairValue ? formatLakh(fairValue.valueLakh) : "—"}
              </p>
              <span className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-faint">
                Fair price
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="num text-sm font-semibold">{player.batting ?? "—"}</p>
              <p className="text-[0.52rem] uppercase tracking-[0.12em] text-faint">Bat</p>
            </div>
            <div>
              <p className="num text-sm font-semibold">{player.bowling ?? "—"}</p>
              <p className="text-[0.52rem] uppercase tracking-[0.12em] text-faint">Bowl</p>
            </div>
            <div>
              <p className="num text-sm font-semibold">{player.fielding ?? "—"}</p>
              <p className="text-[0.52rem] uppercase tracking-[0.12em] text-faint">Field</p>
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          <section>
            <SectionHeading
              eyebrow="IPL career"
              title="Career record"
              description="Aggregated from every IPL scorecard on file — the evidence the rating and fair price are built from."
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatBlock label="Matches" value={career.matches} hint={`${career.innings} batting innings`} />
              <StatBlock label="Runs" value={career.runs.toLocaleString("en-IN")} hint={`SR ${career.strikeRate?.toFixed(1) ?? "—"}`} />
              <StatBlock
                label="Batting average"
                value={career.average?.toFixed(2) ?? "—"}
                hint={`High score ${career.highScore ?? "—"}`}
              />
              <StatBlock
                label="Wickets"
                value={career.wickets}
                hint={career.bestBowling ? `Best ${career.bestBowling}` : "No IPL wickets"}
              />
            </div>

            <div className="surface-card mt-4 overflow-hidden">
              <div className="border-b border-line px-5 py-3">
                <h3 className="font-display text-sm font-bold uppercase tracking-wide">Full career sheet</h3>
              </div>
              <div className="grid gap-0 sm:grid-cols-2">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Batting</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Innings", String(career.innings)],
                      ["Runs", career.runs.toLocaleString("en-IN")],
                      ["Balls faced", career.ballsFaced.toLocaleString("en-IN")],
                      ["Strike rate", career.strikeRate?.toFixed(1) ?? "—"],
                      ["Average", career.average?.toFixed(2) ?? "—"],
                      ["High score", career.highScore ?? "—"],
                      ["Fifties", String(career.fifties)],
                      ["Hundreds", String(career.hundreds)],
                      ["Fours", String(career.fours)],
                      ["Sixes", String(career.sixes)],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td className="text-muted">{label}</td>
                        <td className="num text-right font-semibold">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <table className="data-table border-t border-line sm:border-l sm:border-t-0">
                  <thead>
                    <tr>
                      <th>Bowling</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Wickets", String(career.wickets)],
                      ["Overs", career.overs],
                      ["Economy", career.economy?.toFixed(2) ?? "—"],
                      ["Best bowling", career.bestBowling ?? "—"],
                      ["First IPL season", career.firstSeason ? String(career.firstSeason) : "—"],
                      ["Last IPL season", career.lastSeason ? String(career.lastSeason) : "—"],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td className="text-muted">{label}</td>
                        <td className="num text-right font-semibold">{value}</td>
                      </tr>
                    ))}
                    {!bowled && (
                      <tr>
                        <td colSpan={2} className="text-[0.68rem] text-faint">
                          No recorded IPL bowling workload.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section>
            <SectionHeading
              eyebrow="Fair price"
              title="Valuation sheet"
              description="The model's raw output, the 18% realism haircut and every multiplier applied to the rating curve."
            />
            {fairValue ? (
              <div className="surface-card mt-4 p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-faint">
                      Published fair price
                    </p>
                    <p className="num mt-1 font-display text-4xl font-black leading-none">
                      {formatLakh(fairValue.valueLakh)}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Range {formatLakh(fairValue.lowLakh)} – {formatLakh(fairValue.highLakh)} ·{" "}
                      <span className="font-semibold">{fairValue.tier}</span> band
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="chip chip-gold">
                      <Sparkles size={11} /> Model {formatLakh(fairValue.coreLakh)}
                    </span>
                    <span className="chip">−18% haircut</span>
                    <span className="chip chip-info">AI reference {formatLakh(fairValue.referenceLakh)}</span>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto rounded-xl border border-line">
                  <table className="data-table min-w-[520px]">
                    <thead>
                      <tr>
                        <th>Multiplier</th>
                        <th className="text-right">Factor</th>
                        <th>Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fairValue.factors.map((factor) => (
                        <tr key={factor.label}>
                          <td className="font-semibold">{factor.label}</td>
                          <td className="num text-right">×{factor.multiplier.toFixed(2)}</td>
                          <td className="text-muted">{factor.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <EvidenceBadge quality={player.evidenceQuality} />
                  <span className="chip">OVR {player.ovr ?? "—"}</span>
                  <span className="chip">{player.roleLabel}</span>
                  <span className="chip">{player.age === null ? "Age unverified" : `Age ${player.age}`}</span>
                </div>
                <p className="mt-3 text-[0.65rem] leading-relaxed text-faint">{fairValue.rationale}</p>
              </div>
            ) : (
              <div className="panel mt-4 p-5 text-sm text-muted">
                This player has no 2026 overall rating, so the model has no performance evidence to price. They trade
                near their auction base price.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
