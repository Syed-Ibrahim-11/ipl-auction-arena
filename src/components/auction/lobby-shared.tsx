"use client";

import { useRef, useState } from "react";
import { Bot, Check, Crown, Pause, Play, UserMinus, Wifi } from "lucide-react";
import { TeamBadge } from "@/components/brand/team-badge";
import { getFranchise } from "@/lib/teams";
import type { SnapshotSeat, SnapshotTeam } from "@/lib/auction/types";
import { cn } from "@/lib/cn";

export function SeatGrid({
  seats,
  teams,
  selectedTeamId,
  onSelect,
  canManage = false,
  onKick,
}: {
  seats: SnapshotSeat[];
  teams?: Pick<SnapshotTeam, "id" | "name" | "shortName" | "city">[];
  selectedTeamId?: string | null;
  onSelect?: (teamId: string) => void;
  canManage?: boolean;
  onKick?: (participantId: string) => void;
}) {
  const byId = new Map((teams ?? []).map((team) => [team.id, team]));
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {seats.map((seat) => {
        const franchise = getFranchise(seat.teamId);
        const team = byId.get(seat.teamId);
        const name = team?.shortName ?? franchise?.shortName ?? "Franchise";
        const city = team?.city ?? franchise?.city ?? "";
        const selected = selectedTeamId === seat.teamId;
        const clickable = Boolean(onSelect) && seat.isAi;
        return (
          <div
            key={seat.teamId}
            className={cn(
              "relative rounded-xl border p-3 transition-colors",
              seat.isViewer
                ? "border-accent/60 bg-accent/5"
                : seat.isAi
                  ? "border-line bg-surface2/40"
                  : "border-lineStrong bg-surface2/70",
              selected && "border-accent bg-accent/10 ring-2 ring-accent/30",
              clickable && "cursor-pointer hover:border-accent/50",
            )}
            onClick={clickable ? () => onSelect?.(seat.teamId) : undefined}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={
              clickable
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect?.(seat.teamId);
                    }
                  }
                : undefined
            }
            aria-pressed={clickable ? selected : undefined}
          >
            <div className="flex items-start justify-between gap-2">
              <TeamBadge teamId={seat.teamId} size={28} />
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.08em]",
                  seat.isAi
                    ? "border-line bg-surface3 text-faint"
                    : seat.online
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-gold/30 bg-gold/10 text-gold",
                )}
              >
                {seat.isAi ? <Bot size={9} /> : <Wifi size={9} />}
                {seat.isAi ? "AI" : seat.online ? "Live" : "Away"}
              </span>
            </div>
            <p className="mt-2 truncate font-display text-sm font-bold uppercase leading-none tracking-wide">
              {name}
            </p>
            <p className="mt-0.5 truncate text-[0.55rem] uppercase tracking-[0.08em] text-faint">{city}</p>
            <div className="mt-2 flex min-h-[1.1rem] items-center gap-1">
              {seat.isAi ? (
                <span className="text-[0.6rem] text-faint">Open seat · AI ready</span>
              ) : (
                <>
                  <span className="truncate text-[0.65rem] font-semibold text-fg">
                    {seat.displayName ?? "Manager"}
                  </span>
                  {seat.isHost && <Crown size={10} className="shrink-0 text-gold" aria-label="Host" />}
                  {seat.isViewer && (
                    <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-[0.08em] text-accent2">
                      You
                    </span>
                  )}
                  {seat.isReady && !seat.isAi && <Check size={11} className="shrink-0 text-success" aria-label="Ready" />}
                </>
              )}
            </div>
            {canManage && !seat.isAi && !seat.isHost && seat.participantId && onKick && (
              <button
                type="button"
                className="absolute right-1.5 top-9 rounded-md p-1 text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                onClick={(event) => {
                  event.stopPropagation();
                  onKick(seat.participantId as string);
                }}
                aria-label={`Remove ${seat.displayName ?? "manager"}`}
                title="Remove manager"
              >
                <UserMinus size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function parseVoiceBody(body: string): { clipId: string; durationMs: number } | null {
  try {
    const parsed = JSON.parse(body) as { clipId?: unknown; durationMs?: unknown };
    if (typeof parsed.clipId !== "string" || parsed.clipId.length === 0) return null;
    return {
      clipId: parsed.clipId,
      durationMs: typeof parsed.durationMs === "number" ? parsed.durationMs : 0,
    };
  } catch {
    return null;
  }
}

function voiceDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function VoiceClip({ src, durationMs }: { src: string; durationMs: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className="text-[0.65rem] italic text-faint">Voice note unavailable</span>;
  }

  return (
    <span className="mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface2 px-1.5 py-1 align-middle">
      <button
        type="button"
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) {
            setPlaying(true);
            void audio.play().catch(() => {
              setPlaying(false);
              setFailed(true);
            });
          } else {
            audio.pause();
            setPlaying(false);
          }
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent2 transition-colors hover:bg-accent/25"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
      >
        {playing ? <Pause size={10} /> : <Play size={10} />}
      </button>
      <span className="relative h-1 w-16 shrink-0 overflow-hidden rounded-full bg-line">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent2"
          style={{ width: `${progress}%` }}
        />
      </span>
      <span className="num shrink-0 text-[0.6rem] text-faint">{voiceDuration(durationMs)}</span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onError={() => setFailed(true)}
        className="hidden"
      />
    </span>
  );
}
