import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, LockKeyhole, Trophy } from "lucide-react";
import { SeasonHub } from "@/components/season/season-hub";
import { SeasonLaunch } from "@/components/season/season-launch";
import { PageHeader } from "@/components/ui";
import {
  getSeasonLaunchInfo,
  getSeasonSnapshotForSession,
} from "@/lib/season/service";
import { SeasonError } from "@/lib/season/types";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const launch = getSeasonLaunchInfo(id);
    const snapshot = getSeasonSnapshotForSession(id);
    return {
      title: snapshot
        ? `${snapshot.userTeam?.name ?? "Season"} · IPL 2026 season`
        : `${launch.sessionName} · The season`,
      description: snapshot
        ? `${snapshot.progress.stageLabel}: ${snapshot.progress.leaguePlayed} of ${snapshot.progress.leagueTotal} league matches played. A deterministic, independently simulated IPL 2026 season.`
        : `Start the post-auction season for ${launch.sessionName}.`,
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: "Season" };
  }
}

export default async function SeasonPage({ params }: PageProps) {
  const { id } = await params;
  let launch;
  try {
    launch = getSeasonLaunchInfo(id);
  } catch (error) {
    if (error instanceof SeasonError && error.code === "SESSION_NOT_FOUND") notFound();
    throw error;
  }
  if (launch.sessionStatus === "abandoned") notFound();
  const snapshot = getSeasonSnapshotForSession(id);

  if (snapshot) {
    return (
      <div className="container-page py-8 sm:py-10">
        <SeasonHub initial={snapshot} />
      </div>
    );
  }

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Franchise Director · Post-auction"
        title="The season"
        description="Turn the auction room into a title race. Your squad is ready; the next decision is yours."
        actions={
          <>
            <Link href={`/auction/${id}/recap`} className="btn btn-outline">
              <ArrowLeft size={15} /> Auction recap
            </Link>
            {launch.sessionStatus === "active" && (
              <Link href={`/auction/${id}`} className="btn btn-primary">
                Return to the auction <ArrowRight size={15} />
              </Link>
            )}
          </>
        }
      />
      <div className="mt-8">
        {launch.canStart ? (
          <SeasonLaunch launch={launch} userTeamId={launch.userTeamId} />
        ) : (
          <section className="surface-card mx-auto max-w-2xl p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
                {launch.sessionStatus === "completed" ? <Trophy size={22} /> : <LockKeyhole size={22} />}
              </span>
              <div>
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">
                  Season locked
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold uppercase">Finish the auction first</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {launch.blockedReason ??
                "The season can begin once the auction has resolved every lot for all ten franchises."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/auction/${id}`} className="btn btn-primary">
                Return to the auction room <ArrowRight size={15} />
              </Link>
              <Link href={`/auction/${id}/recap`} className="btn btn-outline">
                View current recap
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
