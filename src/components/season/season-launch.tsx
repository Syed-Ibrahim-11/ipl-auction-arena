"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CalendarDays, Loader2, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { TeamBadge } from "@/components/brand/team-badge";
import type { SeasonLaunchInfo } from "@/lib/season/snapshot";

export function SeasonLaunch({
  launch,
  userTeamId,
}: {
  launch: SeasonLaunchInfo;
  userTeamId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${launch.sessionId}/season`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The season could not be started.");
      router.push(`/auction/${launch.sessionId}/season`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The season could not be started.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="surface-card relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(700px_320px_at_15%_-10%,rgba(245,198,91,0.16),transparent_65%)]" />
        <div className="relative px-6 py-8 sm:px-8 sm:py-10">
          <p className="eyebrow">The auction is over. The season begins.</p>
          <h2 className="mt-3 font-display text-[clamp(2.2rem,4.5vw,3.6rem)] font-bold uppercase leading-[0.94] tracking-[0.01em]">
            Take the franchise
            <br />
            into the league
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            Your squad, {launch.userTeamName}, will be entered into a 74-match IPL 2026 season built
            from the real archive schedule. Every other franchise is run by its AI manager. You choose
            the XI, the batting order and the tactics — then take charge of your matches ball by ball,
            or simulate them and watch the table take shape.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <LaunchPoint icon={<CalendarDays size={16} />} title="74 fixtures" body="70 league matches plus the four-match playoff bracket." />
            <LaunchPoint icon={<ShieldCheck size={16} />} title="Your call" body="Pick the XI and captain. Change tactics between matches." />
            <LaunchPoint icon={<Trophy size={16} />} title="One champion" body="Points, NRR, playoffs, awards and a full season archive." />
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={busy}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {busy ? "Building the season" : "Start the 2026 season"}
            </button>
            <Link href={`/auction/${launch.sessionId}/recap`} className="btn btn-outline">
              Review the auction <ArrowRight size={15} />
            </Link>
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </section>

      <aside className="space-y-4">
        <div className="panel p-5">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-faint">Your franchise</p>
          <div className="mt-3 flex items-center gap-3">
            <TeamBadge teamId={userTeamId} size={44} />
            <div>
              <p className="font-display text-2xl font-bold uppercase leading-none">{launch.userTeamName}</p>
              <p className="mt-1 text-xs text-muted">Auction complete · squad submitted</p>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-muted">
            <p>
              <span className="font-semibold text-fg">Before you begin:</span> any squad below 11 players
              receives zero-fee season call-ups from the current IPL player pool. No fictional players
              are created, and every call-up appears in your squad list with its reason.
            </p>
            <p className="mt-2">
              Ratings are frozen at the auction&apos;s evidence cut-off. The season never uses hindsight
              from the 2026 archive results.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-gold">Schedule note: </span>
          the master prompt&apos;s fixtures.csv attachment was not supplied. The simulator uses the 2026
          match archive in this workspace for dates, venues and pairings, infers home sides from venue,
          and seeds the playoff bracket from your simulated league table.
        </div>
      </aside>
    </div>
  );
}

function LaunchPoint({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface2/60 p-3">
      <p className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-accent2">
        {icon} {title}
      </p>
      <p className="mt-2 text-[0.72rem] leading-snug text-muted">{body}</p>
    </div>
  );
}
