import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MatchCentre } from "@/components/season/match-centre";
import { getMatchScorecard, getSeasonSnapshotForSession } from "@/lib/season/service";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string; fixtureId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, fixtureId } = await params;
  try {
    const snapshot = getSeasonSnapshotForSession(id);
    const fixture = snapshot?.fixtures.find((entry) => entry.id === fixtureId);
    if (!fixture) return { title: "Season match" };
    const label =
      fixture.stage === "league"
        ? `Match ${fixture.matchNumber}`
        : fixture.stage;
    return {
      title: `${fixture.homeTeamShort ?? "TBD"} vs ${fixture.awayTeamShort ?? "TBD"} · ${label}`,
      description: fixture.resultSummary
        ? `${fixture.resultSummary} Simulated IPL 2026 fixture from the archive schedule.`
        : `${fixture.homeTeamName ?? "TBD"} face ${fixture.awayTeamName ?? "TBD"} at ${fixture.venue ?? "a venue to be confirmed"}.`,
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: "Season match" };
  }
}

export default async function SeasonMatchPage({ params }: PageProps) {
  const { id, fixtureId } = await params;
  const snapshot = getSeasonSnapshotForSession(id);
  if (!snapshot) redirect(`/auction/${id}/season`);
  const fixture = snapshot.fixtures.find((entry) => entry.id === fixtureId);
  if (!fixture) notFound();
  const scorecard = getMatchScorecard(id, fixtureId);
  return (
    <div className="container-page py-8 sm:py-10">
      <MatchCentre initialSnapshot={snapshot} initialScorecard={scorecard} fixtureId={fixtureId} />
    </div>
  );
}
