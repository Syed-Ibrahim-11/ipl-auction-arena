import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LineupEditor } from "@/components/season/lineup-editor";
import { getSeasonSnapshotForSession } from "@/lib/season/service";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const snapshot = getSeasonSnapshotForSession(id);
  return {
    title: snapshot?.userTeam
      ? `${snapshot.userTeam.name} · XI and tactics`
      : "XI and tactics",
    robots: { index: false, follow: false },
  };
}

export default async function SquadPage({ params }: PageProps) {
  const { id } = await params;
  const snapshot = getSeasonSnapshotForSession(id);
  if (!snapshot) redirect(`/auction/${id}/season`);
  return (
    <div className="container-page py-8 sm:py-10">
      <LineupEditor initial={snapshot} />
    </div>
  );
}
