import { NextResponse } from "next/server";
import {
  AuctionError,
  createSession,
  listSessionSummaries,
  type CreateSessionInput,
} from "@/lib/auction/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AuctionError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Session API error", error);
  return NextResponse.json(
    { error: "Something went wrong while preparing the auction.", code: "INTERNAL" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    return NextResponse.json({ sessions: listSessionSummaries() });
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
  const data = body as Partial<CreateSessionInput> | null;
  if (!data || typeof data.modeId !== "string" || typeof data.userTeamId !== "string") {
    return NextResponse.json(
      { error: "modeId and userTeamId are required.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }
  try {
    const snapshot = createSession({
      modeId: data.modeId,
      userTeamId: data.userTeamId,
      name: typeof data.name === "string" ? data.name : null,
      retainedPlayerIds: Array.isArray(data.retainedPlayerIds)
        ? data.retainedPlayerIds.filter((id): id is string => typeof id === "string")
        : null,
      rtmEnabled: typeof data.rtmEnabled === "boolean" ? data.rtmEnabled : null,
    });
    return NextResponse.json({ session: snapshot.session, snapshot }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
