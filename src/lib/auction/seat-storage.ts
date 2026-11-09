export type StoredSeat = {
  token: string;
  teamId?: string;
  displayName?: string;
};

const PREFIX = "ipl-arena:seat:";
const NAME_KEY = "ipl-arena:manager-name";

export function seatKey(sessionId: string): string {
  return `${PREFIX}${sessionId}`;
}

export function saveSeat(sessionId: string, seat: StoredSeat): void {
  try {
    window.localStorage.setItem(seatKey(sessionId), JSON.stringify(seat));
    if (seat.displayName) window.localStorage.setItem(NAME_KEY, seat.displayName);
  } catch {
    // Private mode can reject storage; the caller keeps the token in memory.
  }
}

export function loadSeat(sessionId: string): StoredSeat | null {
  try {
    const raw = window.localStorage.getItem(seatKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSeat> | null;
    if (!parsed || typeof parsed.token !== "string") return null;
    return {
      token: parsed.token,
      teamId: typeof parsed.teamId === "string" ? parsed.teamId : undefined,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : undefined,
    };
  } catch {
    return null;
  }
}

export function clearSeat(sessionId: string): void {
  try {
    window.localStorage.removeItem(seatKey(sessionId));
  } catch {
    // Ignore.
  }
}

export function loadManagerName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
