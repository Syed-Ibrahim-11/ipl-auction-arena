"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2, Trash2, Trophy, Users } from "lucide-react";
import { TeamBadge } from "@/components/brand/team-badge";
import type { SessionSummary } from "@/lib/auction/types";
import { formatLakh } from "@/lib/money";
import { cn } from "@/lib/cn";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_STYLE: Record<string, string> = {
  lobby: "chip chip-gold",
  active: "chip chip-accent",
  completed: "chip chip-success",
  abandoned: "chip",
};

export function SavedSessions({ sessions }: { sessions: SessionSummary[] }) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function abandon(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "The session could not be abandoned.");
      }
      setConfirmId(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The session could not be abandoned.");
    } finally {
      setBusyId(null);
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="panel px-5 py-10 text-center">
        <p className="font-display text-xl font-semibold uppercase tracking-wide text-muted">No saved rooms yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-faint">
          Create an auction above and it will appear here. Every session is stored in the local SQLite
          database, so you can leave and resume without losing a bid.
        </p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-2.5 text-xs text-danger">
          {error}
        </div>
      )}
      <div className="grid gap-3">
        {sessions.map((session) => {
          const progress = session.totalLots > 0 ? (session.completedLots / session.totalLots) * 100 : 0;
          const href = session.isMultiplayer ? `/auction/lobby/${session.id}` : `/auction/${session.id}`;
          return (
            <div key={session.id} className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <TeamBadge teamId={session.userTeamId} size={40} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={href}
                      className="truncate font-display text-lg font-semibold uppercase leading-tight tracking-wide hover:text-accent2"
                    >
                      {session.name}
                    </Link>
                    <span className={STATUS_STYLE[session.status] ?? "chip"}>{session.status}</span>
                    {session.isMultiplayer && session.joinCode && (
                      <span className="chip chip-info">
                        <Users size={11} /> {session.joinCode}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] text-faint">
                    <span>{session.modeName}</span>
                    <span>·</span>
                    <span>{formatDate(session.updatedAt)}</span>
                    <span>·</span>
                    <span className="num">
                      {session.completedLots}/{session.totalLots} lots
                    </span>
                    <span>·</span>
                    <span className="num">{session.userSquadSize} players</span>
                    <span>·</span>
                    <span className="num">{formatLakh(session.userPurseLakh, { compact: true })} left</span>
                    {session.isMultiplayer && (
                      <>
                        <span>·</span>
                        <span>
                          {session.participantCount} manager{session.participantCount === 1 ? "" : "s"}
                        </span>
                      </>
                    )}
                  </p>
                  <div className="progress-track mt-2 max-w-sm">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {session.status === "completed" && (
                  <Link href={`/auction/${session.id}/recap`} className="btn btn-ghost btn-sm">
                    <Trophy size={14} /> Recap
                  </Link>
                )}
                {(session.status === "active" || session.status === "lobby") && (
                  <Link href={href} className="btn btn-primary btn-sm">
                    {session.status === "lobby" ? "Open room" : "Resume"} <ArrowRight size={14} />
                  </Link>
                )}
                {session.status === "active" && !session.isMultiplayer && (
                  confirmId === session.id ? (
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busyId === session.id}
                        onClick={() => void abandon(session.id)}
                      >
                        {busyId === session.id ? <Loader2 size={14} className="animate-spin" /> : null}
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setConfirmId(null)}
                        disabled={busyId === session.id}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={cn("btn btn-ghost btn-sm text-faint hover:text-danger")}
                      onClick={() => setConfirmId(session.id)}
                      aria-label={`Abandon ${session.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
