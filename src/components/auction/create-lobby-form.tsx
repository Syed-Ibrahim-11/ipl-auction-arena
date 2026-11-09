"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { AlertCircle, ArrowRight, Bot, Loader2, Users } from "lucide-react";
import { TeamBadge } from "@/components/brand/team-badge";
import { RetentionPicker } from "@/components/auction/retention-picker";
import type { TeamOption } from "@/components/auction/create-auction-form";
import type { AuctionMode } from "@/lib/auction/modes";
import type { RetentionTeam } from "@/lib/auction/mini2027";
import { loadManagerName, saveSeat } from "@/lib/auction/seat-storage";
import { RULEBOOK_2027 } from "@/lib/rules";
import { cn } from "@/lib/cn";

function subscribeNothing(): () => void {
  return () => {};
}

export function CreateLobbyForm({
  modes,
  teams,
  retentionTeams,
  initialMode,
}: {
  modes: AuctionMode[];
  teams: TeamOption[];
  retentionTeams: RetentionTeam[];
  initialMode?: string;
}) {
  const router = useRouter();
  const storedName = useSyncExternalStore(subscribeNothing, loadManagerName, () => "");
  const [modeId, setModeId] = useState(
    modes.some((mode) => mode.id === initialMode) ? (initialMode as string) : modes[0].id,
  );
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [retainedByTeam, setRetainedByTeam] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const team of retentionTeams) initial[team.teamId] = team.defaultIds;
    return initial;
  });
  const [timerSeconds, setTimerSeconds] = useState(5);
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayName = nameInput ?? storedName;
  const retentionMode = modeId === "mini-2027";
  const retentionTeam = retentionTeams.find((team) => team.teamId === teamId) ?? null;
  const retainedIds = retainedByTeam[teamId] ?? [];

  async function createRoom() {
    if (starting || !teamId) return;
    setStarting(true);
    setError(null);
    const finalName = displayName.trim() || "Host";
    try {
      const response = await fetch("/api/lobbies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modeId,
          userTeamId: teamId,
          name: name.trim() || null,
          displayName: finalName,
          tickMs: Math.min(120, Math.max(1, Math.round(timerSeconds))) * 1000,
          retainedPlayerIds: retentionMode ? (retainedByTeam[teamId] ?? []) : undefined,
        }),
      });
      const payload = (await response.json()) as {
        sessionId?: string;
        participantToken?: string;
        error?: string;
      };
      if (!response.ok || !payload.sessionId || !payload.participantToken) {
        throw new Error(payload.error ?? "The room could not be created.");
      }
      saveSeat(payload.sessionId, {
        token: payload.participantToken,
        teamId,
        displayName: finalName,
      });
      router.push(`/auction/lobby/${payload.sessionId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The room could not be created.");
      setStarting(false);
    }
  }

  return (
    <form
      className="surface-card overflow-hidden"
      onSubmit={(event) => {
        event.preventDefault();
        void createRoom();
      }}
    >
      <div className="border-b border-line px-5 py-4 sm:px-7">
        <p className="eyebrow">Host a private room</p>
        <h2 className="mt-2 font-display text-2xl font-bold uppercase tracking-wide">Open the doors</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          You start in the room and hold host controls. Share the six-character code and up to nine
          friends can claim the other seats.
        </p>
      </div>

      <fieldset className="border-b border-line px-5 py-5 sm:px-7">
        <legend className="field-label">Auction format</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {modes.map((entry) => {
            const active = entry.id === modeId;
            return (
              <label
                key={entry.id}
                className={cn(
                  "relative cursor-pointer rounded-xl border p-3.5 transition-colors",
                  active
                    ? "border-accent/60 bg-accent/5"
                    : "border-line bg-surface2/40 hover:border-lineStrong hover:bg-surface2",
                )}
              >
                <input
                  type="radio"
                  name="lobby-mode"
                  value={entry.id}
                  checked={active}
                  onChange={() => setModeId(entry.id)}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-semibold uppercase leading-tight tracking-wide">
                    {entry.name}
                  </span>
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border"
                    style={{
                      borderColor: active ? entry.accent : "var(--lineStrong)",
                      background: active ? entry.accent : "transparent",
                      boxShadow: active ? "inset 0 0 0 2px var(--surface)" : undefined,
                    }}
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1 block text-[0.72rem] leading-relaxed text-muted">{entry.tagline}</span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  <span className="chip">{entry.expectedLots} lots</span>
                  {entry.rtmEnabled && <span className="chip chip-gold">RTM</span>}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="border-b border-line px-5 py-5 sm:px-7">
        <legend className="field-label">Your franchise</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {teams.map((team) => {
            const active = team.id === teamId;
            return (
              <label
                key={team.id}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors",
                  active
                    ? "border-accent/60 bg-accent/5"
                    : "border-line bg-surface2/40 hover:border-lineStrong",
                )}
              >
                <input
                  type="radio"
                  name="lobby-team"
                  value={team.id}
                  checked={active}
                  onChange={() => setTeamId(team.id)}
                  className="sr-only"
                />
                <TeamBadge teamId={team.id} size={30} />
                <span className="text-[0.7rem] font-semibold leading-tight">{team.shortName}</span>
                <span className="text-[0.55rem] uppercase tracking-[0.08em] text-faint">{team.city}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {retentionMode && retentionTeam && (
        <fieldset className="border-b border-line px-5 py-5 sm:px-7">
          <legend className="field-label">Retentions</legend>
          <RetentionPicker
            team={retentionTeam}
            selectedIds={retainedIds}
            onChange={(next) => setRetainedByTeam((current) => ({ ...current, [teamId]: next }))}
            capLakh={RULEBOOK_2027.purseCapLakh}
            squadMax={RULEBOOK_2027.squadMax}
            overseasMax={RULEBOOK_2027.overseasMax}
          />
        </fieldset>
      )}

      <fieldset className="border-b border-line px-5 py-5 sm:px-7">
        <legend className="field-label">Bid timer</legend>
        <p className="text-[0.68rem] leading-relaxed text-faint">
          How long the room waits between auction steps. The host can change it at any time.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[5, 10, 20, 30].map((seconds) => {
            const active = timerSeconds === seconds;
            return (
              <button
                key={seconds}
                type="button"
                className={cn(
                  "rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "border-accent/60 bg-accent/10 text-accent2"
                    : "border-line bg-surface2/50 text-muted hover:border-lineStrong",
                )}
                onClick={() => setTimerSeconds(seconds)}
                aria-pressed={active}
              >
                {seconds}s
              </button>
            );
          })}
          <label className="flex items-center gap-2 rounded-lg border border-line bg-surface2/50 px-3 py-1.5">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-faint">Custom</span>
            <input
              type="number"
              min={1}
              max={120}
              value={timerSeconds}
              onChange={(event) => {
                const next = Number(event.target.value);
                setTimerSeconds(Number.isFinite(next) ? Math.min(120, Math.max(1, Math.round(next))) : 5);
              }}
              className="w-16 bg-transparent text-sm font-semibold outline-none"
              aria-label="Custom bid timer in seconds"
            />
            <span className="text-xs text-faint">s</span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 border-b border-line px-5 py-5 sm:grid-cols-2 sm:px-7">
        <div>
          <label htmlFor="manager-name" className="field-label">
            Your manager name
          </label>
          <input
            id="manager-name"
            className="input"
            value={displayName}
            maxLength={24}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="e.g. The Professor"
          />
        </div>
        <div>
          <label htmlFor="lobby-name" className="field-label">
            Room name <span className="font-normal normal-case tracking-normal text-faint">(optional)</span>
          </label>
          <input
            id="lobby-name"
            className="input"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Sunday night war room"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex flex-wrap items-center gap-2 text-[0.68rem] text-faint">
          <span className="chip">
            <Users size={12} /> 10 seats
          </span>
          <span className="chip">
            <Bot size={12} /> AI fills empty seats
          </span>
          <span className="chip chip-success">Share with a code</span>
        </div>
        <button type="submit" className="btn btn-primary" disabled={starting || !teamId}>
          {starting ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Opening the room…
            </>
          ) : (
            <>
              Create room <ArrowRight size={16} />
            </>
          )}
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
  );
}
