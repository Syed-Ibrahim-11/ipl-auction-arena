import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LobbyRoom } from "@/components/auction/lobby-room";
import { getLobbySnapshot, lobbyExists } from "@/lib/auction/lobby";
import { AuctionError } from "@/lib/auction/service";
import type { AuctionSnapshot } from "@/lib/auction/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Multiplayer room",
  description: "Private IPL auction room with shared bids, live chat and AI-managed franchises.",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ id: string }> };

export default async function AuctionLobbyRoomPage({ params }: PageProps) {
  const { id } = await params;
  if (!lobbyExists(id)) redirect(`/auction/${id}`);
  let snapshot: AuctionSnapshot;
  try {
    snapshot = getLobbySnapshot(id, null);
  } catch (error) {
    if (error instanceof AuctionError && error.code === "SESSION_NOT_FOUND") notFound();
    throw error;
  }
  return <LobbyRoom initial={snapshot} />;
}
