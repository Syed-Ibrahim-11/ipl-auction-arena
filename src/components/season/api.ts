import type { SeasonAction } from "@/lib/season/service";
import type { MatchScorecard, SeasonSnapshot } from "@/lib/season/types";

export class SeasonApiError extends Error {
  code: string;

  constructor(message: string, code = "INTERNAL") {
    super(message);
    this.name = "SeasonApiError";
    this.code = code;
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new SeasonApiError("The server returned an unreadable response.", "BAD_RESPONSE");
  }
}

function messageFrom(payload: Record<string, unknown>, fallback: string): SeasonApiError {
  const error = typeof payload.error === "string" ? payload.error : fallback;
  const code = typeof payload.code === "string" ? payload.code : "INTERNAL";
  return new SeasonApiError(error, code);
}

export async function postSeasonAction(
  sessionId: string,
  action: SeasonAction,
  token?: string | null,
): Promise<SeasonSnapshot> {
  const result = await postMatchAction(sessionId, action, token);
  return result.snapshot;
}

function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-participant-token"] = token;
  return headers;
}

export async function postMatchAction(
  sessionId: string,
  action: SeasonAction,
  token?: string | null,
): Promise<{ snapshot: SeasonSnapshot; scorecard: MatchScorecard | null }> {
  const response = await fetch(`/api/sessions/${sessionId}/season/actions`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(action),
  });
  const payload = await readJson(response);
  if (!response.ok) throw messageFrom(payload, "The season action could not be applied.");
  return {
    snapshot: payload.snapshot as SeasonSnapshot,
    scorecard: (payload.scorecard as MatchScorecard | null) ?? null,
  };
}

export async function fetchSeasonSnapshot(
  sessionId: string,
  token?: string | null,
): Promise<SeasonSnapshot | null> {
  const response = await fetch(`/api/sessions/${sessionId}/season`, {
    cache: "no-store",
    headers: token ? { "x-participant-token": token } : undefined,
  });
  const payload = await readJson(response);
  if (!response.ok) throw messageFrom(payload, "The season could not be loaded.");
  return (payload.snapshot as SeasonSnapshot | null) ?? null;
}

export async function fetchMatchCentre(
  sessionId: string,
  fixtureId: string,
  token?: string | null,
): Promise<{ scorecard: MatchScorecard; snapshot: SeasonSnapshot }> {
  const response = await fetch(`/api/sessions/${sessionId}/season/match/${fixtureId}`, {
    cache: "no-store",
    headers: token ? { "x-participant-token": token } : undefined,
  });
  const payload = await readJson(response);
  if (!response.ok) throw messageFrom(payload, "The match scorecard could not be loaded.");
  return {
    scorecard: payload.scorecard as MatchScorecard,
    snapshot: payload.snapshot as SeasonSnapshot,
  };
}

export function formatSeasonDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

export function formatLongSeasonDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
