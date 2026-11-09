import type { Metadata } from "next";
import Link from "next/link";
import { BrainCircuit, Coins, Gavel, ShieldCheck, Shuffle, Users } from "lucide-react";
import { TeamBadge } from "@/components/brand/team-badge";
import { PageHeader, RoleChip, SectionHeading } from "@/components/ui";
import { getTeamsOverview } from "@/lib/data/queries";
import { AI_PROFILES, profileForTeam, type AiProfileId } from "@/lib/auction/modes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Auction Managers",
  description:
    "The nine AI franchise managers in the auction room: how they value players, protect minimum-squad budgets and differ in aggression and discipline.",
};

const STYLES: Array<{ label: string; detail: string; icon: typeof BrainCircuit }> = [
  {
    label: "Evidence-based valuation",
    detail: "Every bid starts from the player's analytical OVR, role scarcity and evidence grade — never the real 2026 result.",
    icon: BrainCircuit,
  },
  {
    label: "Purse guardrails",
    detail: "AI managers reserve the minimum-squad cost before bidding, so they cannot leave an illegal squad behind.",
    icon: Coins,
  },
  {
    label: "Squad-need overlay",
    detail: "Wicketkeeper, all-rounder and depth needs shift valuations slightly; hoarding a seventh batter is penalised.",
    icon: Users,
  },
  {
    label: "Deterministic variance",
    detail: "A seeded hash adds stable, auditable variation — the same auction seed reproduces the same behaviour.",
    icon: Shuffle,
  },
];

function meter(value: number, max: number, color: string) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-surface3">
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.max(4, Math.min(100, (value / max) * 100))}%`, background: color }}
      />
    </span>
  );
}

export default async function ManagersPage() {
  const teams = [...getTeamsOverview()].sort((a, b) => a.name.localeCompare(b.name));
  const profiles = Object.values(AI_PROFILES);

  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Nine rivals · one human seat"
        title="AI auction managers"
        description="You take one franchise. Nine simulated managers bid against you, each with a distinct temperament but the same hard rules. They value players from the evidence — never from the actual 2026 price list."
        actions={
          <>
            <Link href="/auction" className="btn btn-primary">
              <Gavel size={15} /> Enter the room
            </Link>
            <Link href="/rulebook" className="btn btn-outline">
              Read the rules
            </Link>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            {profiles.map((profile) => (
              <span
                key={profile.id}
                className="chip"
                style={{
                  borderColor: `color-mix(in srgb, ${profile.color} 40%, transparent)`,
                  color: profile.color,
                }}
              >
                {profile.short}
              </span>
            ))}
          </div>
        }
      />

      <section className="mt-8">
        <SectionHeading
          eyebrow="The bidding brain"
          title="How the AI decides"
          description="The managers are not scripted to chase names. Each decision is a valuation plus a budget guardrail plus a reproducible personality overlay."
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STYLES.map((style) => {
            const Icon = style.icon;
            return (
              <div key={style.label} className="surface-card p-5">
                <Icon size={20} className="text-accent2" />
                <p className="mt-3 font-display text-base font-bold uppercase tracking-wide">{style.label}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{style.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-14">
        <SectionHeading
          eyebrow="The room"
          title="Who is bidding against you"
          description="Each franchise carries one of five manager archetypes. The assigned style is visible in the auction room and on the team board."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const profile = profileForTeam(team.id);
            return (
              <div key={team.id} className="surface-card relative overflow-hidden p-5">
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.12]"
                  style={{ background: `linear-gradient(135deg, ${team.primary}, transparent 60%, ${team.secondary})` }}
                />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <TeamBadge teamId={team.id} size={42} />
                      <div>
                        <p className="font-display text-lg font-bold uppercase leading-tight tracking-wide">{team.shortName}</p>
                        <p className="text-[0.68rem] text-faint">{team.name}</p>
                      </div>
                    </div>
                    <span
                      className="chip"
                      style={{
                        borderColor: `color-mix(in srgb, ${profile.color} 40%, transparent)`,
                        color: profile.color,
                      }}
                    >
                      {profile.short}
                    </span>
                  </div>

                  <p className="mt-3 text-xs font-semibold">{profile.label}</p>
                  <p className="mt-1 text-[0.68rem] leading-relaxed text-muted">{profile.description}</p>

                  <div className="mt-4 space-y-2.5">
                    <div>
                      <div className="flex items-center justify-between text-[0.6rem] text-faint">
                        <span>Aggression</span>
                        <span className="num">{profile.aggression.toFixed(2)}×</span>
                      </div>
                      {meter(profile.aggression, 1.2, profile.color)}
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[0.6rem] text-faint">
                        <span>Discipline</span>
                        <span className="num">{profile.discipline.toFixed(2)}×</span>
                      </div>
                      {meter(profile.discipline, 1.2, "var(--info)")}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-3">
                    <div className="flex items-center gap-1.5">
                      {team.topPlayers.slice(0, 2).map((player) => (
                        <span key={player.id} className="chip max-w-[110px] truncate text-[0.58rem]">
                          {player.name.split(" ").slice(-1)[0]} · {player.ovr ?? "—"}
                        </span>
                      ))}
                    </div>
                    <span className="num text-[0.62rem] text-faint">{team.points} pts in 2026</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-14">
        <SectionHeading
          eyebrow="Personality matrix"
          title="Five archetypes"
          description="Aggression scales valuations; discipline tightens the randomised band and RTM behaviour. Neither overrides purse or squad rules."
        />
        <div className="surface-card mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Manager</th>
                  <th>Style</th>
                  <th className="text-right">Aggression</th>
                  <th className="text-right">Discipline</th>
                  <th>Franchises</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile: (typeof AI_PROFILES)[AiProfileId]) => {
                  const assigned = teams.filter((team) => profileForTeam(team.id).id === profile.id);
                  return (
                    <tr key={profile.id}>
                      <td>
                        <span className="flex items-center gap-2 font-semibold">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: profile.color }} />
                          {profile.label}
                        </span>
                      </td>
                      <td className="max-w-[280px] text-xs text-muted">{profile.description}</td>
                      <td className="num text-right">{profile.aggression.toFixed(2)}×</td>
                      <td className="num text-right">{profile.discipline.toFixed(2)}×</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {assigned.length === 0 ? (
                            <span className="text-xs text-faint">Unassigned</span>
                          ) : (
                            assigned.map((team) => (
                              <span key={team.id} className="chip text-[0.6rem]">
                                {team.shortName}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="panel p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={15} className="text-success" /> Fair play guarantees
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
              <li>· AI managers see the same rules, purse and pool as the human manager.</li>
              <li>· They never read the supplied 2026 winning bids before a lot resolves.</li>
              <li>· Every bid passes through the same server-side atomic transaction.</li>
              <li>· The seed is stored with the session, so an auction can be audited or replayed deterministically.</li>
            </ul>
          </div>
          <div className="panel p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Gavel size={15} className="text-accent2" /> Pick your rivals
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Create an auction and choose your franchise. The other nine managers fill the room automatically, each
              with its assigned profile and a visible purse. You can inspect every squad and every purchase after the
              hammer.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/auction" className="btn btn-primary btn-sm">
                Create an auction
              </Link>
              <Link href="/auction?mode=rtm-2025-practice" className="btn btn-ghost btn-sm">
                RTM Lab
              </Link>
            </div>
          </div>
        </div>

        <div className="panel mt-4 flex flex-wrap items-center gap-2 p-4 text-[0.62rem] text-faint">
          <span className="font-semibold text-muted">Role mix matters:</span>
          {(["batter", "bowler", "all-rounder", "wicketkeeper"] as const).map((role) => (
            <RoleChip key={role} role={role} label={role.replace("-", " ")} />
          ))}
          <span>Valuations adjust slightly when a squad is stacked or short in a role.</span>
        </div>
      </section>
    </div>
  );
}
