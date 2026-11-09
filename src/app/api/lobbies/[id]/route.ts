import { NextResponse } from "next/server";
import { AuctionError } from "@/lib/auction/service";
import {
  closeLobby,
  getLobbySnapshot,
  kickParticipant,
  leaveLobby,
  lobbyHeartbeat,
  nudgeLobby,
  postChat,
  postVoiceChat,
  setReady,
  startLobby,
  updateLobbySettings,
} from "@/lib/auction/lobby";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof AuctionError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Lobby action error", error);
  return NextResponse.json(
    { error: "The room action could not be applied.", code: "INTERNAL" },
    { status: 500 },
  );
}

function tokenFrom(request: Request, body?: Record<string, unknown> | null): string | null {
  const header = request.headers.get("x-participant-token");
  if (header) return header;
  const query = new URL(request.url).searchParams.get("token");
  if (query) return query;
  return typeof body?.token === "string" ? body.token : null;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const token = tokenFrom(request);
    const tick = new URL(request.url).searchParams.get("tick");
    const snapshot = lobbyHeartbeat(id, token, { advance: tick !== "0" });
    return NextResponse.json({ snapshot, lobby: snapshot.lobby });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Send a valid JSON body.", code: "BAD_JSON" }, { status: 400 });
  }
  const token = tokenFrom(request, body);
  if (!token) {
    return NextResponse.json({ error: "Take a seat before acting.", code: "SEAT_REQUIRED" }, { status: 401 });
  }
  const type = body.type;
  try {
    let snapshot;
    switch (type) {
      case "start":
        snapshot = startLobby(id, token);
        break;
      case "pause":
        updateLobbySettings(id, token, { paused: true });
        snapshot = getLobbySnapshot(id, token);
        break;
      case "resume":
        updateLobbySettings(id, token, { paused: false });
        snapshot = getLobbySnapshot(id, token);
        break;
      case "speed": {
        const tickMs = Number(body.tickMs);
        if (!Number.isFinite(tickMs)) {
          return NextResponse.json({ error: "Choose a valid room speed.", code: "INVALID_SPEED" }, { status: 400 });
        }
        updateLobbySettings(id, token, { tickMs });
        snapshot = getLobbySnapshot(id, token);
        break;
      }
      case "ready":
        setReady(id, token, body.ready !== false);
        snapshot = getLobbySnapshot(id, token);
        break;
      case "kick": {
        const participantId = typeof body.participantId === "string" ? body.participantId : "";
        if (!participantId) {
          return NextResponse.json({ error: "Choose a manager to remove.", code: "INVALID_INPUT" }, { status: 400 });
        }
        kickParticipant(id, token, participantId);
        snapshot = getLobbySnapshot(id, token);
        break;
      }
      case "chat": {
        const message = typeof body.body === "string" ? body.body : "";
        postChat(id, token, message, typeof body.kind === "string" ? body.kind : undefined);
        snapshot = getLobbySnapshot(id, token);
        break;
      }
      case "voice": {
        const encoded = typeof body.audio === "string" ? body.audio : "";
        if (!encoded) {
          return NextResponse.json({ error: "Record a voice note first.", code: "EMPTY_MESSAGE" }, { status: 400 });
        }
        if (encoded.length > 1_100_000) {
          return NextResponse.json(
            { error: "That voice note is too long — keep it under a minute.", code: "VOICE_TOO_LARGE" },
            { status: 413 },
          );
        }
        const audio = Buffer.from(encoded, "base64");
        postVoiceChat(
          id,
          token,
          audio,
          typeof body.mime === "string" ? body.mime : "audio/webm",
          Number(body.durationMs),
        );
        snapshot = getLobbySnapshot(id, token);
        break;
      }
      case "nudge":
        nudgeLobby(id, token);
        snapshot = getLobbySnapshot(id, token);
        break;
      case "leave": {
        const result = leaveLobby(id, token);
        return NextResponse.json({ ok: true, closed: result.closed });
      }
      case "close":
        closeLobby(id, token);
        return NextResponse.json({ ok: true, closed: true });
      default:
        return NextResponse.json(
          { error: "That room action is not recognised.", code: "INVALID_ACTION" },
          { status: 400 },
        );
    }
    return NextResponse.json({ snapshot, lobby: snapshot.lobby });
  } catch (error) {
    return errorResponse(error);
  }
}
