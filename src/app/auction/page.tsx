import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Database,
  KeyRound,
  Users,
} from "lucide-react";
import { CreateAuctionForm, type TeamOption } from "@/components/auction/create-auction-form";
import { SavedSessions } from "@/components/auction/saved-sessions";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { AUCTION_MODES } from "@/lib/auction/modes";
import { loadRetentionTeams, mini2027AiRetainedByTeam } from "@/lib/auction/mini2027";
import { mini2027PoolUniverseSize } from "@/lib/auction/pool";
import { listSessionSummaries } from "@/lib/auction/service";
import { cachedStatic } from "@/lib/data/cache";
import { RULEBOOK_2027 } from "@/lib/rules";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Auction Room",
  description:
    "Create an IPL auction, claim a franchise and contest every lot against nine AI managers.",
};

export default async function AuctionLobbyPage({
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
  const activeModeIds = new Set<string>(AUCTION_MODES.map((mode) => mode.id));
  const sessions = listSessionSummaries().filter((session) => activeModeIds.has(session.mode));
  const retentionTeams = cachedStatic("mini2027-retention-teams", () =>
    loadRetentionTeams(getDb(), 2026, RULEBOOK_2027.purseCapLakh, RULEBOOK_2027.overseasMax),
  );
  const poolUniverseSize = cachedStatic("mini2027-pool-universe", () =>
    mini2027PoolUniverseSize(getDb()),
  );
  const aiRetainedByTeam = cachedStatic("mini2027-ai-retained", () =>
    mini2027AiRetainedByTeam(
      getDb(),
      RULEBOOK_2027.purseCapLakh,
      RULEBOOK_2027.overseasMax,
      2026,
    ),
  );

  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="The room is open"
        title="Auction lobby"
        description="Pick a format, claim a franchise and let nine AI managers contest every lot."
        actions={
          <Link href="/managers" className="btn btn-ghost">
            <Bot size={16} /> Meet the managers
          </Link>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip">
              <Users size={12} /> 10 franchises
            </span>
            <span className="chip">
              <Database size={12} /> {AUCTION_MODES.reduce((max, mode) => Math.max(max, mode.expectedLots), 0)} full-pool
              lots
            </span>
            <span className="chip chip-success">Auto-saved sessions</span>
          </div>
        }
      />

      <div className="mt-8 grid gap-3 md:grid-cols-2">
        <Link
          href="/auction/multiplayer"
          className="surface-card stadium-hero card-hover group flex items-center gap-4 p-5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-accent2">
            <Users size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl font-bold uppercase tracking-wide">
              Play with friends
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">
              Open a private room, share a code and let AI managers fill every unclaimed franchise.
            </span>
          </span>
          <ArrowRight
            size={18}
            className="shrink-0 text-faint transition-transform group-hover:translate-x-1 group-hover:text-accent2"
          />
        </Link>
        <Link
          href="/auction/join"
          className="surface-card card-hover group flex items-center gap-4 p-5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface2 text-accent2">
            <KeyRound size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl font-bold uppercase tracking-wide">
              Join with a code
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">
              Already invited? Enter the six-character room code and claim an open seat.
            </span>
          </span>
          <ArrowRight
            size={18}
            className="shrink-0 text-faint transition-transform group-hover:translate-x-1 group-hover:text-accent2"
          />
        </Link>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_0.85fr]">
        <div className="space-y-6">
          <CreateAuctionForm
            modes={AUCTION_MODES}
            teams={teamOptions}
            retentionTeams={retentionTeams}
            poolUniverseSize={poolUniverseSize}
            aiRetainedByTeam={aiRetainedByTeam}
            initialMode={params.mode}
          />
        </div>

        <aside className="space-y-6">
          <div className="surface-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold uppercase tracking-wide">Your rooms</h2>
              <span className="chip">{sessions.length}</span>
            </div>
            <p className="mt-1.5 text-xs text-faint">Saved auctions on this device.</p>
            <div className="mt-4 max-h-[540px] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
              <SavedSessions sessions={sessions} />
            </div>
          </div>

          <div className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-display text-lg font-bold uppercase tracking-wide">Format at a glance</h2>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Format</th>
                  <th className="text-right">Lots</th>
                  <th className="text-right">RTM</th>
                  <th className="text-right">Opening</th>
                </tr>
              </thead>
              <tbody>
                {AUCTION_MODES.map((mode) => (
                  <tr key={mode.id}>
                    <td className="font-medium">{mode.name}</td>
                    <td className="num text-right">{mode.expectedLots}</td>
                    <td className="text-right text-xs text-muted">
                      {mode.rtmOptional ? "Optional" : mode.rtmEnabled ? "6 cards" : "Off"}
                    </td>
                    <td className="text-right text-xs text-muted">
                      {mode.retentionKind === "contract-2026"
                        ? "2026 contracts"
                        : mode.retainedSquads
                          ? "Retained"
                          : "Empty"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </aside>
      </div>
    </div>
  );
}
