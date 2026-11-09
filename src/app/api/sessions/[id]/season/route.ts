import { NextResponse } from "next/server";
import {
  getSeasonLaunchInfo,
  getSeasonSnapshotForSession,
  startSeason,
} from "@/lib/season/service";
import { SeasonError } from "@/lib/season/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof SeasonError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Season error", error);
  return NextResponse.json(
    { error: "The season request could not be completed.", code: "INTERNAL" },
    { status: 500 },
  );
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const token =
    request.headers.get("x-participant-token") ?? new URL(request.url).searchParams.get("token");
  try {
    return NextResponse.json({
      launch: getSeasonLaunchInfo(id),
      snapshot: getSeasonSnapshotForSession(id, token),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return NextResponse.json({ snapshot: startSeason(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
