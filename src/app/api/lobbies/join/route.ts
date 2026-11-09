import { NextResponse } from "next/server";
import { AuctionError } from "@/lib/auction/service";
import { joinLobby, previewLobby } from "@/lib/auction/lobby";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AuctionError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Lobby join error", error);
  return NextResponse.json(
    { error: "The room could not be joined.", code: "INTERNAL" },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "A room code is required.", code: "INVALID_CODE" }, { status: 400 });
  }
  try {
    return NextResponse.json({ room: previewLobby(code) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON body.", code: "BAD_JSON" }, { status: 400 });
  }
  const data = body as { code?: unknown; teamId?: unknown; displayName?: unknown } | null;
  if (!data || typeof data.code !== "string" || typeof data.teamId !== "string") {
    return NextResponse.json(
      { error: "code and teamId are required.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }
  try {
    const joined = joinLobby({
      code: data.code,
      teamId: data.teamId,
      displayName: typeof data.displayName === "string" ? data.displayName : "Manager",
    });
    return NextResponse.json(
      {
        sessionId: joined.sessionId,
        joinCode: joined.joinCode,
        participantToken: joined.token,
        participantId: joined.participantId,
        teamId: joined.teamId,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
