import { NextResponse } from "next/server";
import { AuctionError, createLobby } from "@/lib/auction/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AuctionError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Lobby create error", error);
  return NextResponse.json(
    { error: "The multiplayer room could not be created.", code: "INTERNAL" },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON body.", code: "BAD_JSON" }, { status: 400 });
  }
  const data = body as {
    modeId?: unknown;
    userTeamId?: unknown;
    name?: unknown;
    displayName?: unknown;
    tickMs?: unknown;
    retainedPlayerIds?: unknown;
    rtmEnabled?: unknown;
  } | null;
  if (!data || typeof data.modeId !== "string" || typeof data.userTeamId !== "string") {
    return NextResponse.json(
      { error: "modeId and userTeamId are required.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }
  try {
    const result = createLobby({
      modeId: data.modeId,
      userTeamId: data.userTeamId,
      name: typeof data.name === "string" ? data.name : null,
      displayName: typeof data.displayName === "string" ? data.displayName : "Host",
      tickMs: typeof data.tickMs === "number" ? data.tickMs : null,
      retainedPlayerIds: Array.isArray(data.retainedPlayerIds)
        ? data.retainedPlayerIds.filter((id): id is string => typeof id === "string")
        : null,
      rtmEnabled: typeof data.rtmEnabled === "boolean" ? data.rtmEnabled : null,
    });
    return NextResponse.json(
      {
        sessionId: result.lobby.sessionId,
        joinCode: result.lobby.joinCode,
        participantToken: result.lobby.token,
        participantId: result.lobby.participantId,
        snapshot: result.snapshot,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
