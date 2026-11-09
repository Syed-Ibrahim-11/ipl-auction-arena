import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bot, KeyRound, Users } from "lucide-react";
import { JoinLobbyForm } from "@/components/auction/join-lobby-form";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join a room · Multiplayer auction",
  description: "Enter a six-character room code and claim one of the ten IPL franchises.",
};

export default async function JoinLobbyPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Invite code"
        title="Join a room"
        description="Type the code from your host. Open seats can be claimed until the auction starts — after that you can still watch every lot live."
        actions={
          <>
            <Link href="/auction/multiplayer" className="btn btn-outline">
              <KeyRound size={16} /> Host a room
            </Link>
            <Link href="/auction" className="btn btn-ghost">
              <ArrowLeft size={15} /> Auction lobby
            </Link>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip">
              <Users size={12} /> ten franchises
            </span>
            <span className="chip">
              <Bot size={12} /> AI plays empty seats
            </span>
          </div>
        }
      />

      <div className="mx-auto mt-8 max-w-3xl">
        <JoinLobbyForm initialCode={params.code ?? ""} />
      </div>
    </div>
  );
}
