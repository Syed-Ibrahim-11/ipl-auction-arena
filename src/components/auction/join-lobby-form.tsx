"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertCircle, ArrowRight, Bot, Loader2, Search, Users } from "lucide-react";
import { SeatGrid } from "@/components/auction/lobby-shared";
import { loadManagerName, saveSeat } from "@/lib/auction/seat-storage";
import type { SnapshotSeat } from "@/lib/auction/types";
import { cn } from "@/lib/cn";

function subscribeNothing(): () => void {
  return () => {};
}

type LobbyPreview = {
  sessionId: string;
  joinCode: string;
  name: string;
  modeName: string;
  status: "lobby" | "live" | "closed";
  joinable: boolean;
  seats: SnapshotSeat[];
  humanCount: number;
};

export function JoinLobbyForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const storedName = useSyncExternalStore(subscribeNothing, loadManagerName, () => "");
  const [code, setCode] = useState(initialCode.toUpperCase().slice(0, 10));
  const [preview, setPreview] = useState<LobbyPreview | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayName = nameInput ?? storedName;

  async function lookup(raw?: string) {
    const value = (raw ?? code).trim().toUpperCase();
    if (!value) return;
    setLooking(true);
    setError(null);
    setPreview(null);
    setTeamId(null);
    try {
      const response = await fetch(`/api/lobbies/join?code=${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { room?: LobbyPreview; error?: string };
      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? "That room could not be found.");
      }
      setCode(payload.room.joinCode);
      setPreview(payload.room);
      const firstOpen = payload.room.seats.find((seat) => seat.isAi);
      setTeamId(firstOpen?.teamId ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That room could not be found.");
    } finally {
      setLooking(false);
    }
  }

  useEffect(() => {
    if (initialCode.trim().length < 4) return;
    const timer = window.setTimeout(() => void lookup(initialCode), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function join() {
    if (!preview || !teamId || joining) return;
    setJoining(true);
    setError(null);
    const finalName = displayName.trim() || "Manager";
    try {
      const response = await fetch("/api/lobbies/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: preview.joinCode,
          teamId,
          displayName: finalName,
        }),
      });
      const payload = (await response.json()) as {
        sessionId?: string;
        participantToken?: string;
        teamId?: string;
        error?: string;
      };
      if (!response.ok || !payload.sessionId || !payload.participantToken) {
        throw new Error(payload.error ?? "That seat could not be claimed.");
      }
      saveSeat(payload.sessionId, {
        token: payload.participantToken,
        teamId: payload.teamId ?? teamId,
        displayName: finalName,
      });
      router.push(`/auction/lobby/${payload.sessionId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That seat could not be claimed.");
      setJoining(false);
    }
  }

  return (
    <div className="space-y-5">
      <form
        className="surface-card overflow-hidden"
        onSubmit={(event) => {
          event.preventDefault();
          void lookup();
        }}
      >
        <div className="border-b border-line px-5 py-4 sm:px-7">
          <p className="eyebrow">Have an invite?</p>
          <h2 className="mt-2 font-display text-2xl font-bold uppercase tracking-wide">Enter a room code</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Codes are six characters and never case-sensitive. Ask the host to copy it from the room.
          </p>
        </div>
        <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-end sm:px-7">
          <div className="flex-1">
            <label htmlFor="join-code" className="field-label">
              Room code
            </label>
            <input
              id="join-code"
              className="input join-code-input"
              value={code}
              maxLength={10}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="7KQ4ZP"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={looking || code.trim().length < 4}>
            {looking ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Find room
          </button>
        </div>
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 border-t border-danger/30 bg-danger/5 px-5 py-3 text-xs text-danger sm:px-7"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>

      {preview && (
        <div className="surface-card animate-fade-up overflow-hidden">
          <div className="stadium-hero border-b border-line px-5 py-5 sm:px-7">
            <div className="relative flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent2">
                  {preview.modeName}
                </p>
                <h3 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">{preview.name}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.68rem] text-muted">
                  <span className="chip">
                    <Users size={12} /> {preview.humanCount} human
                    {preview.humanCount === 1 ? "" : "s"}
                  </span>
                  <span className="chip">
                    <Bot size={12} /> AI fills {10 - preview.humanCount} seat
                    {10 - preview.humanCount === 1 ? "" : "s"}
                  </span>
                  <span className={cn("chip", preview.status === "lobby" ? "chip-success" : "chip-gold")}>
                    {preview.status === "lobby" ? "Doors open" : preview.status === "live" ? "In progress" : "Closed"}
                  </span>
                </div>
              </div>
              <span className="join-code-display">{preview.joinCode}</span>
            </div>
          </div>

          {preview.joinable ? (
            <>
              <div className="border-b border-line px-5 py-4 sm:px-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="field-label mb-0">Pick an unclaimed franchise</p>
                  <span className="text-[0.62rem] uppercase tracking-[0.1em] text-faint">
                    {preview.seats.filter((seat) => seat.isAi).length} open
                  </span>
                </div>
                <div className="mt-3">
                  <SeatGrid
                    seats={preview.seats}
                    selectedTeamId={teamId}
                    onSelect={setTeamId}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
                <div className="w-full sm:max-w-xs">
                  <label htmlFor="join-manager" className="field-label">
                    Your manager name
                  </label>
                  <input
                    id="join-manager"
                    className="input"
                    value={displayName}
                    maxLength={24}
                    onChange={(event) => setNameInput(event.target.value)}
                    placeholder="e.g. Auction Shark"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void join()}
                  disabled={joining || !teamId}
                >
                  {joining ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  Claim this seat
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <p className="text-sm leading-relaxed text-muted">
                Seats locked when the auction started. You can still open the room and watch the hammer
                fall.
              </p>
              <Link href={`/auction/lobby/${preview.sessionId}`} className="btn btn-outline">
                Spectate the room <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
