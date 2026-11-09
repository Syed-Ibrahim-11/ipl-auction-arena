import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AuctionRoom } from "@/components/auction/auction-room";
import { lobbyExists } from "@/lib/auction/lobby";
import { AuctionError, getSessionSnapshot, getSessionSummary } from "@/lib/auction/service";
import type { AuctionSnapshot } from "@/lib/auction/types";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const summary = getSessionSummary(id);
    return {
      title: `${summary.name} · Live auction`,
      description: `${summary.modeName} in progress: ${summary.completedLots} of ${summary.totalLots} lots resolved for ${summary.userTeamName}.`,
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: "Auction room" };
  }
}

export default async function AuctionRoomPage({ params }: PageProps) {
  const { id } = await params;
  if (lobbyExists(id)) redirect(`/auction/lobby/${id}`);
  let snapshot: AuctionSnapshot;
  try {
    snapshot = getSessionSnapshot(id);
  } catch (error) {
    if (error instanceof AuctionError && error.code === "SESSION_NOT_FOUND") notFound();
    throw error;
  }
  if (snapshot.session.status === "abandoned") notFound();
  return <AuctionRoom initial={snapshot} />;
}
