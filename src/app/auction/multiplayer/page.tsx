import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Clock3, KeyRound, ShieldCheck, Users, Wifi } from "lucide-react";
import { CreateLobbyForm } from "@/components/auction/create-lobby-form";
import type { TeamOption } from "@/components/auction/create-auction-form";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { AUCTION_MODES } from "@/lib/auction/modes";
import { loadRetentionTeams } from "@/lib/auction/mini2027";
import { cachedStatic } from "@/lib/data/cache";
import { RULEBOOK_2027 } from "@/lib/rules";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Play with friends · Multiplayer auction",
  description:
    "Open a private IPL auction room, share a six-character code and fill all ten franchises with friends or AI managers.",
};

const STEPS = [
  {
    icon: KeyRound,
    title: "Open a room",
    body: "Pick a format and your franchise. The room is created instantly with a six-character code.",
  },
  {
    icon: Users,
    title: "Share the code",
    body: "Up to ten managers can claim a seat from any device. The same room, the same live bids.",
  },
  {
    icon: Bot,
    title: "AI fills the rest",
    body: "Every unclaimed franchise is managed by the AI, bidding to its own valuations and squad needs.",
  },
  {
    icon: Clock3,
    title: "One shared clock",
    body: "The server advances the auction. The host controls pace, pause and when the hammer comes down.",
  },
];

export default async function MultiplayerPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const teams = getDb()
    .prepare("SELECT id, name, short_name, city FROM teams WHERE active = 1 ORDER BY name")
    .all() as Array<{ id: string; name: string; short_name: string; city: string | null }>;
  const teamOptions: TeamOption[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.short_name,
    city: team.city ?? "",
  }));
  const retentionTeams = cachedStatic("mini2027-retention-teams", () =>
    loadRetentionTeams(getDb(), 2026, RULEBOOK_2027.purseCapLakh, RULEBOOK_2027.overseasMax),
  );

  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Multiplayer"
        title="Play with friends"
        description="A live auction room for up to ten managers. AI fills every open seat."
        actions={
          <>
            <Link href="/auction/join" className="btn btn-outline">
              <KeyRound size={16} /> Join with a code
            </Link>
            <Link href="/auction" className="btn btn-ghost">
              Solo auction <ArrowRight size={15} />
            </Link>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip">
              <Users size={12} /> 10 seats
            </span>
            <span className="chip">
              <Bot size={12} /> AI fills every gap
            </span>
            <span className="chip chip-success">
              <Wifi size={12} /> Live presence
            </span>
          </div>
        }
      />

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-5">
          <CreateLobbyForm
            modes={AUCTION_MODES}
            teams={teamOptions}
            retentionTeams={retentionTeams}
            initialMode={params.mode}
          />
        </div>

        <aside className="space-y-4">
          {STEPS.map((step, index) => (
            <div key={step.title} className="panel flex gap-3.5 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface2 text-accent2">
                <step.icon size={16} />
              </span>
              <div>
                <p className="font-display text-base font-semibold uppercase tracking-wide">
                  <span className="num mr-1.5 text-faint">0{index + 1}</span>
                  {step.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{step.body}</p>
              </div>
            </div>
          ))}

          <div className="surface-card p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-accent2" />
              <p className="font-display text-sm font-bold uppercase tracking-[0.12em]">Resume any device</p>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Reopen the room on this device and you land back in your franchise. A quiet manager is
              covered by AI autopilot until they return.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
