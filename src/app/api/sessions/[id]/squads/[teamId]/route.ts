import { NextResponse } from "next/server";
import { AuctionError } from "@/lib/auction/service";
import { buildTeamSquad } from "@/lib/auction/snapshot";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; teamId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id, teamId } = await context.params;
  try {
    const squad = buildTeamSquad(getDb(), id, teamId);
    if (!squad) {
      return NextResponse.json(
        { error: "That franchise is not part of this auction.", code: "TEAM_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json(squad);
  } catch (error) {
    if (error instanceof AuctionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Team squad error", error);
    return NextResponse.json(
      { error: "The franchise squad could not be loaded.", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
