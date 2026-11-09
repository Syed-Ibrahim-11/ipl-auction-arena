import { NextResponse } from "next/server";
import { applySeasonAction, getMatchScorecard, type SeasonAction } from "@/lib/season/service";
import { SeasonError, type LineupInput, type TeamTactics } from "@/lib/season/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const AMOUNTS = new Set(["ball", "over", "innings", "match"]);
const SCOPES = new Set(["other", "matchday", "league", "season"]);
const TACTICS = new Set<TeamTactics>(["attack", "balanced", "defend"]);

function stringArray(value: unknown, length?: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= 80) &&
    (length === undefined || value.length === length)
  );
}

function parseAction(body: unknown): SeasonAction | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw.type !== "string") return null;

  if (raw.type === "start-match" || raw.type === "ready-check") {
    if (typeof raw.fixtureId !== "string" || raw.fixtureId.length > 80) return null;
    return { type: raw.type, fixtureId: raw.fixtureId };
  }
  if (raw.type === "simulate") {
    if (typeof raw.fixtureId !== "string" || raw.fixtureId.length > 80) return null;
    if (typeof raw.amount !== "string" || !AMOUNTS.has(raw.amount)) return null;
    const optionalId = (value: unknown) =>
      value === undefined || value === null
        ? null
        : typeof value === "string" && value.length > 0 && value.length <= 80
          ? value
          : undefined;
    const bowlerId = optionalId(raw.bowlerId);
    const nextBatterId = optionalId(raw.nextBatterId);
    if (bowlerId === undefined || nextBatterId === undefined) return null;
    return {
      type: "simulate",
      fixtureId: raw.fixtureId,
      amount: raw.amount as "ball",
      bowlerId,
      nextBatterId,
    };
  }
  if (raw.type === "advance") {
    if (typeof raw.scope !== "string" || !SCOPES.has(raw.scope)) return null;
    return { type: "advance", scope: raw.scope as "matchday" };
  }
  if (raw.type === "set-lineup") {
    const lineup = raw.lineup as Partial<LineupInput> | undefined;
    if (!lineup || typeof lineup !== "object") return null;
    if (!stringArray(lineup.playerIds, 11) || !stringArray(lineup.battingOrder, 11)) return null;
    if (typeof lineup.captainId !== "string" || typeof lineup.keeperId !== "string") return null;
    return {
      type: "set-lineup",
      lineup: {
        playerIds: lineup.playerIds,
        battingOrder: lineup.battingOrder,
        captainId: lineup.captainId,
        keeperId: lineup.keeperId,
      },
    };
  }
  if (raw.type === "auto-lineup") {
    return { type: "auto-lineup" };
  }
  if (raw.type === "set-tactics") {
    if (typeof raw.tactics !== "string" || !TACTICS.has(raw.tactics as TeamTactics)) return null;
    const aggression = (value: unknown) =>
      value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
    if (!aggression(raw.battingAggression) || !aggression(raw.bowlingAggression)) return null;
    return {
      type: "set-tactics",
      tactics: raw.tactics as TeamTactics,
      battingAggression: raw.battingAggression as number | undefined,
      bowlingAggression: raw.bowlingAggression as number | undefined,
    };
  }
  return null;
}

function errorResponse(error: unknown) {
  if (error instanceof SeasonError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Season action error", error);
  return NextResponse.json(
    { error: "The season action could not be applied.", code: "INTERNAL" },
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
      { error: "That season action is not recognised.", code: "INVALID_ACTION" },
      { status: 400 },
    );
  }
  const token =
    request.headers.get("x-participant-token") ??
    (typeof (body as Record<string, unknown>).token === "string"
      ? ((body as Record<string, unknown>).token as string)
      : null);
  try {
    const snapshot = applySeasonAction(id, action, token);
    const scorecard =
      action.type === "simulate" || action.type === "start-match" || action.type === "ready-check"
        ? getMatchScorecard(id, action.fixtureId)
        : null;
    return NextResponse.json({ snapshot, scorecard });
  } catch (error) {
    return errorResponse(error);
  }
}
