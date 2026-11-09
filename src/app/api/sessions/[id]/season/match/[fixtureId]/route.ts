import { NextResponse } from "next/server";
import { getMatchScorecard, getSeasonSnapshotForSession } from "@/lib/season/service";
import { SeasonError } from "@/lib/season/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; fixtureId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof SeasonError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Match scorecard error", error);
  return NextResponse.json(
    { error: "The match scorecard could not be loaded.", code: "INTERNAL" },
    { status: 500 },
  );
}

export async function GET(request: Request, context: RouteContext) {
  const { id, fixtureId } = await context.params;
  const token =
    request.headers.get("x-participant-token") ?? new URL(request.url).searchParams.get("token");
  try {
    const scorecard = getMatchScorecard(id, fixtureId);
    if (!scorecard) {
      return NextResponse.json({ error: "That match has not started.", code: "MATCH_NOT_STARTED" }, { status: 404 });
    }
    return NextResponse.json({
      scorecard,
      snapshot: getSeasonSnapshotForSession(id, token),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
