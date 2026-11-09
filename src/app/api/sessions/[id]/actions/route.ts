import { NextResponse } from "next/server";
import { AuctionError, actOnSession } from "@/lib/auction/service";
import { lobbyExists, resolveParticipantTeam } from "@/lib/auction/lobby";
import type { AuctionAction } from "@/lib/auction/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const TYPES = new Set<AuctionAction["type"]>([
  "tick",
  "bid",
  "rtm_invoke",
  "rtm_decline",
  "rtm_raise",
  "rtm_hold",
  "rtm_match",
  "rtm_decline_match",
]);

function parseAction(body: unknown): AuctionAction | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as { type?: unknown; amountLakh?: unknown };
  if (typeof raw.type !== "string" || !TYPES.has(raw.type as AuctionAction["type"])) return null;
  const type = raw.type as AuctionAction["type"];
  if (type === "bid") {
    if (!Number.isInteger(raw.amountLakh) || (raw.amountLakh as number) <= 0) return null;
    return { type, amountLakh: raw.amountLakh as number };
  }
  if (type === "rtm_raise") {
    if (raw.amountLakh === undefined || raw.amountLakh === null) return { type, amountLakh: null };
    if (!Number.isInteger(raw.amountLakh) || (raw.amountLakh as number) <= 0) return null;
    return { type, amountLakh: raw.amountLakh as number };
  }
  return { type } as AuctionAction;
}

function errorResponse(error: unknown) {
  if (error instanceof AuctionError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Auction action error", error);
  return NextResponse.json(
    { error: "The auction action could not be applied.", code: "INTERNAL" },
    { status: 500 },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON body.", code: "BAD_JSON" }, { status: 400 });
  }
  const action = parseAction(body);
  if (!action) {
    return NextResponse.json(
      { error: "That auction action is not recognised.", code: "INVALID_ACTION" },
      { status: 400 },
    );
  }
  try {
    const multiplayer = lobbyExists(id);
    const token =
      request.headers.get("x-participant-token") ??
      (typeof (body as { token?: unknown }).token === "string"
        ? ((body as { token: string }).token)
        : null);
    const teamId = multiplayer ? resolveParticipantTeam(id, token) : null;
    if (multiplayer && action.type !== "tick" && !teamId) {
      return NextResponse.json(
        { error: "Take a seat in this room before bidding.", code: "SEAT_REQUIRED" },
        { status: 401 },
      );
    }
    const snapshot = actOnSession(
      id,
      action,
      multiplayer && teamId ? teamId : undefined,
      multiplayer ? teamId : undefined,
    );
    return NextResponse.json({ snapshot });
  } catch (error) {
    return errorResponse(error);
  }
}
