import { NextResponse } from "next/server";
import {
  AuctionError,
  abandonSession,
  getSessionSnapshot,
  getSessionSummary,
} from "@/lib/auction/service";
import {
  closeLobby,
  findParticipant,
  lobbyExists,
  resolveParticipantTeam,
} from "@/lib/auction/lobby";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof AuctionError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Session detail error", error);
  return NextResponse.json(
    { error: "The auction session could not be loaded.", code: "INTERNAL" },
    { status: 500 },
  );
}

function tokenFrom(request: Request): string | null {
  return (
    request.headers.get("x-participant-token") ??
    new URL(request.url).searchParams.get("token")
  );
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const multiplayer = lobbyExists(id);
    const teamId = multiplayer ? resolveParticipantTeam(id, tokenFrom(request)) : undefined;
    return NextResponse.json({
      summary: getSessionSummary(id),
      snapshot: getSessionSnapshot(id, multiplayer ? teamId : undefined),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    if (lobbyExists(id)) {
      const token = tokenFrom(request);
      const participant = findParticipant(id, token);
      if (!participant || participant.is_host !== 1) {
        return NextResponse.json(
          { error: "Only the host can close this multiplayer room.", code: "HOST_ONLY" },
          { status: 403 },
        );
      }
      closeLobby(id, token as string);
      return NextResponse.json({ ok: true });
    }
    abandonSession(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
