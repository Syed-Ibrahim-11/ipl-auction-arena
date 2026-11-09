"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Loader2,
  Search,
  Shield,
  Trash2,
  UserRound,
  Wand2,
} from "lucide-react";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import { OvrBadge } from "@/components/ui";
import { postSeasonAction, fetchSeasonSnapshot } from "@/components/season/api";
import { loadSeat } from "@/lib/auction/seat-storage";
import type {
  SeasonPlayerOption,
  SeasonSnapshot,
  TeamTactics,
} from "@/lib/season/types";
import { cn } from "@/lib/cn";

const ROLE_LABELS: Record<string, string> = {
  all: "All",
  wicketkeeper: "Keepers",
  batter: "Batters",
  "all-rounder": "All-rounders",
  bowler: "Bowlers",
  unknown: "Other",
};

const TACTICS: Array<{ id: TeamTactics; label: string; description: string }> = [
  { id: "attack", label: "Attack", description: "Higher scoring intent with the bat and more attacking fields." },
  { id: "balanced", label: "Balanced", description: "A neutral plan that adapts to the match situation." },
  { id: "defend", label: "Defend", description: "Conserve wickets, squeeze runs and protect a total." },
];

function selectionsFor(snapshot: SeasonSnapshot): {
  xi: string[];
  captainId: string;
  keeperId: string;
  tactics: TeamTactics;
} {
  const playing = snapshot.userSquad
    .filter((player) => player.isPlaying)
    .sort((a, b) => a.battingOrder - b.battingOrder);
  return {
    xi: playing.map((player) => player.id),
    captainId: playing.find((player) => player.isCaptain)?.id ?? playing[0]?.id ?? "",
    keeperId:
      playing.find((player) => player.isKeeper)?.id ??
      playing.find((player) => player.role === "wicketkeeper")?.id ??
      playing[0]?.id ??
      "",
    tactics: snapshot.userTeam?.tactics ?? "balanced",
  };
}

export function LineupEditor({ initial }: { initial: SeasonSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [seatToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : (loadSeat(initial.season.sessionId)?.token ?? null),
  );
  const sessionId = snapshot.season.sessionId;
  const squad = snapshot.userSquad;
  const playing = squad
    .filter((player) => player.isPlaying)
    .sort((a, b) => a.battingOrder - b.battingOrder);
  const [xi, setXi] = useState<string[]>(playing.map((player) => player.id));
  const [captainId, setCaptainId] = useState(
    playing.find((player) => player.isCaptain)?.id ?? playing[0]?.id ?? "",
  );
  const [keeperId, setKeeperId] = useState(
    playing.find((player) => player.isKeeper)?.id ??
      playing.find((player) => player.role === "wicketkeeper")?.id ??
      playing[0]?.id ??
      "",
  );
  const [tactics, setTactics] = useState<TeamTactics>(snapshot.userTeam?.tactics ?? "balanced");
  const [role, setRole] = useState("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"xi" | "auto" | "tactics" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const live = snapshot.liveFixture;
  const locked = live !== null || snapshot.season.status === "completed" || !snapshot.viewer.canAct;
  const byId = useMemo(() => new Map(squad.map((player) => [player.id, player])), [squad]);
  const selected = xi.map((id) => byId.get(id)).filter((player): player is SeasonPlayerOption => Boolean(player));
  const overseas = selected.filter((player) => player.isOverseas).length;
  const xiOvr =
    selected.length > 0
      ? Math.round(
          selected.reduce((sum, player) => sum + (player.ovr ?? 50), 0) / selected.length,
        )
      : null;
  const invalid =
    xi.length !== 11
      ? "Name exactly 11 players."
      : overseas > 4
        ? "The XI cannot include more than four overseas players."
        : !xi.includes(captainId)
          ? "Choose a captain from the XI."
          : !xi.includes(keeperId)
            ? "Choose a wicketkeeper from the XI."
            : null;

  const candidates = useMemo(() => {
    const filtered = squad.filter((player) => {
      if (role === "all") return true;
      return player.role === role;
    });
    const term = query.trim().toLowerCase();
    const searched = term
      ? filtered.filter((player) => player.name.toLowerCase().includes(term))
      : filtered;
    return [...searched].sort((a, b) => {
      const aSelected = xi.includes(a.id) ? 0 : 1;
      const bSelected = xi.includes(b.id) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
      return (b.ovr ?? 0) - (a.ovr ?? 0) || a.name.localeCompare(b.name);
    });
  }, [squad, role, query, xi]);

  function toggle(playerId: string) {
    if (locked) return;
    setMessage(null);
    if (xi.includes(playerId)) {
      setXi(xi.filter((id) => id !== playerId));
      if (captainId === playerId) setCaptainId("");
      if (keeperId === playerId) setKeeperId("");
      return;
    }
    if (xi.length >= 11) {
      setMessage({ tone: "error", text: "Remove a player before adding another. The XI is limited to 11." });
      return;
    }
    setXi([...xi, playerId]);
    if (!captainId) setCaptainId(playerId);
    if (!keeperId && byId.get(playerId)?.role === "wicketkeeper") setKeeperId(playerId);
  }

  function move(index: number, direction: -1 | 1) {
    if (locked) return;
    const target = index + direction;
    if (target < 0 || target >= xi.length) return;
    const next = [...xi];
    [next[index], next[target]] = [next[target], next[index]];
    setXi(next);
  }

  function applySnapshot(next: SeasonSnapshot) {
    setSnapshot(next);
    const selections = selectionsFor(next);
    setXi(selections.xi);
    setCaptainId(selections.captainId);
    setKeeperId(selections.keeperId);
    setTactics(selections.tactics);
  }

  useEffect(() => {
    if (!seatToken) return;
    let cancelled = false;
    void fetchSeasonSnapshot(sessionId, seatToken)
      .then((next) => {
        if (cancelled || !next) return;
        const selections = selectionsFor(next);
        setSnapshot(next);
        setXi(selections.xi);
        setCaptainId(selections.captainId);
        setKeeperId(selections.keeperId);
        setTactics(selections.tactics);
      })
      .catch(() => {
        // The server-rendered snapshot stays visible; a later action retries.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, seatToken]);

  async function saveXi() {
    if (invalid || locked) return;
    setBusy("xi");
    setMessage(null);
    try {
      const next = await postSeasonAction(
        sessionId,
        {
          type: "set-lineup",
          lineup: {
            playerIds: xi,
            battingOrder: xi,
            captainId,
            keeperId,
          },
        },
        seatToken,
      );
      applySnapshot(next);
      setMessage({ tone: "success", text: "XI saved. It will be used in your next match." });
    } catch (cause) {
      setMessage({
        tone: "error",
        text: cause instanceof Error ? cause.message : "The XI could not be saved.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function autoPick() {
    if (locked) return;
    setBusy("auto");
    setMessage(null);
    try {
      const next = await postSeasonAction(sessionId, { type: "auto-lineup" }, seatToken);
      applySnapshot(next);
      setMessage({ tone: "success", text: "Auto-picked the strongest legal XI under the four-overseas limit." });
    } catch (cause) {
      setMessage({
        tone: "error",
        text: cause instanceof Error ? cause.message : "An XI could not be selected.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function saveTactics(nextTactics: TeamTactics) {
    if (locked) return;
    setTactics(nextTactics);
    setBusy("tactics");
    setMessage(null);
    try {
      const next = await postSeasonAction(sessionId, { type: "set-tactics", tactics: nextTactics }, seatToken);
      setSnapshot(next);
      setMessage({ tone: "success", text: `Tactics set to ${nextTactics}.` });
    } catch (cause) {
      setMessage({
        tone: "error",
        text: cause instanceof Error ? cause.message : "Tactics could not be saved.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/auction/${sessionId}/season`} className="link-arrow text-muted hover:text-fg">
          <ArrowLeft size={14} /> Season hub
        </Link>
        <span className="chip">
          {snapshot.progress.stageLabel} · {snapshot.season.status === "completed" ? "Season complete" : "Season active"}
        </span>
      </div>

      <header className="flex flex-col gap-5 border-b border-line pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Team sheet</p>
          <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.8rem)] font-bold uppercase leading-[0.94]">
            Pick your XI
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Choose eleven players, set the batting order, name a captain and wicketkeeper, then lock in
            your tactics. Changes apply to the next match and are blocked while a match is live.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {snapshot.userTeam && (
            <span className="flex items-center gap-2 rounded-full border border-line bg-surface2 px-3 py-2">
              <TeamBadge teamId={snapshot.userTeam.id} size={24} />
              <span className="font-display text-sm font-bold uppercase tracking-wide">
                {snapshot.userTeam.name}
              </span>
            </span>
          )}
          <span className="chip">{overseas} / 4 overseas</span>
          <span className="chip">XI OVR {xiOvr ?? "—"}</span>
        </div>
      </header>

      {locked && (
        <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-muted">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-gold" />
          <p>
            {snapshot.season.status === "completed"
              ? "The season is complete. This is the final team sheet, kept for the record."
              : !snapshot.viewer.canAct
                ? "You are viewing this team without a seat token. Open your auction invite again to manage this XI."
                : "Your XI is locked because a match is live. Finish the match to make changes."}
          </p>
        </div>
      )}
      {message && (
        <p
          role="status"
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            message.tone === "error"
              ? "border-danger/30 bg-danger/5 text-danger"
              : "border-success/30 bg-success/5 text-success",
          )}
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="surface-card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Available squad</p>
                <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">
                  {squad.length} players
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={autoPick}
                disabled={locked || busy !== null}
              >
                {busy === "auto" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                Auto-pick XI
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <label className="relative flex-1">
                <span className="sr-only">Search squad</span>
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  className="input pl-9"
                  placeholder="Search your squad"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(ROLE_LABELS).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRole(id)}
                    className={cn(
                      "chip",
                      role === id ? "border-accent/50 bg-accent/15 text-accent2" : "hover:text-fg",
                    )}
                    aria-pressed={role === id}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <ul className="max-h-[20rem] divide-y divide-line/60 overflow-y-auto scrollbar-thin">
            {candidates.map((player) => {
              const selectedPlayer = xi.includes(player.id);
              const full = xi.length >= 11 && !selectedPlayer;
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    onClick={() => toggle(player.id)}
                    disabled={locked || (full && !selectedPlayer)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                      selectedPlayer ? "bg-accent/[0.075]" : "hover:bg-surface2/60",
                      (locked || (full && !selectedPlayer)) && "cursor-not-allowed opacity-55",
                    )}
                    aria-pressed={selectedPlayer}
                  >
                    <PlayerAvatar name={player.name} teamId={snapshot.userTeam?.id ?? snapshot.season.userTeamId} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {player.name}
                        {player.isCallup && <span className="ml-2 text-[0.58rem] uppercase tracking-[0.08em] text-gold">Call-up</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.62rem] text-faint">
                        <span>{player.role}</span>
                        {player.isOverseas && <span className="text-info">Overseas</span>}
                        {player.isCaptain && <span className="text-gold">Captain</span>}
                        {player.isKeeper && <span className="text-gold">Keeper</span>}
                        {player.isCallup && <span>zero-fee</span>}
                      </p>
                    </div>
                    <OvrBadge value={player.ovr} size="sm" />
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border",
                        selectedPlayer
                          ? "border-accent bg-accent text-accentInk"
                          : "border-line text-transparent",
                      )}
                      aria-hidden="true"
                    >
                      <Check size={13} />
                    </span>
                  </button>
                </li>
              );
            })}
            {candidates.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-faint">No players match that search.</li>
            )}
          </ul>
        </section>

        <section className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="eyebrow">Your XI</p>
              <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">
                {xi.length} / 11 selected
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={saveXi}
              disabled={locked || Boolean(invalid) || busy !== null}
            >
              {busy === "xi" ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              Save XI
            </button>
          </div>
          {invalid && !locked && (
            <p className="border-b border-line bg-surface2/40 px-5 py-2 text-[0.7rem] text-gold">{invalid}</p>
          )}
          <ol className="divide-y divide-line/60">
            {selected.map((player, index) => (
              <li key={player.id} className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
                <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface2 font-display text-sm font-bold">
                  {index + 1}
                </span>
                <PlayerAvatar name={player.name} teamId={snapshot.userTeam?.id ?? snapshot.season.userTeamId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{player.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[0.6rem] text-faint">
                    {player.role}
                    {player.isOverseas && <span className="text-info">· Overseas</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <IconButton
                    label={`Move ${player.name} up`}
                    onClick={() => move(index, -1)}
                    disabled={locked || index === 0}
                  >
                    <ArrowUp size={13} />
                  </IconButton>
                  <IconButton
                    label={`Move ${player.name} down`}
                    onClick={() => move(index, 1)}
                    disabled={locked || index === selected.length - 1}
                  >
                    <ArrowDown size={13} />
                  </IconButton>
                  <button
                    type="button"
                    onClick={() => setCaptainId(player.id)}
                    disabled={locked}
                    className={cn("chip", captainId === player.id && "chip-gold")}
                    aria-pressed={captainId === player.id}
                    title="Name captain"
                  >
                    C
                  </button>
                  <button
                    type="button"
                    onClick={() => setKeeperId(player.id)}
                    disabled={locked}
                    className={cn("chip", keeperId === player.id && "chip-gold")}
                    aria-pressed={keeperId === player.id}
                    title="Name wicketkeeper"
                  >
                    K
                  </button>
                  <IconButton
                    label={`Remove ${player.name} from the XI`}
                    onClick={() => toggle(player.id)}
                    disabled={locked}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </li>
            ))}
            {selected.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-faint">
                Choose players from your squad to build an XI.
              </li>
            )}
          </ol>
          <div className="border-t border-line px-5 py-4">
            <div className="flex flex-wrap gap-2 text-[0.62rem] text-muted">
              <span className="chip">
                <UserRound size={11} /> Captain: {byId.get(captainId)?.name ?? "—"}
              </span>
              <span className="chip">Keeper: {byId.get(keeperId)?.name ?? "—"}</span>
              <span className={cn("chip", overseas > 4 && "chip-danger")}>{overseas} overseas</span>
            </div>
            {selected.some((player) => player.role === "unknown") && (
              <p className="mt-2 text-[0.65rem] leading-relaxed text-faint">
                Unclassified players use role-based rating fallbacks. Their role comes directly from the
                imported player record and is not invented.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="surface-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Match plan</p>
            <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">Tactics</h2>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted">
              Tactics adjust simulator aggression only. They do not change player ratings or guarantee a
              result. Changes apply immediately to your next match.
            </p>
          </div>
          <span className="chip">Current: {snapshot.userTeam?.tactics ?? tactics}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {TACTICS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => saveTactics(entry.id)}
              disabled={locked || busy !== null}
              className={cn(
                "rounded-2xl border p-4 text-left transition",
                tactics === entry.id
                  ? "border-accent/60 bg-accent/10"
                  : "border-line bg-bg2/50 hover:border-accent/30",
              )}
              aria-pressed={tactics === entry.id}
            >
              <p className="flex items-center justify-between font-display text-lg font-bold uppercase">
                {entry.label}
                {tactics === entry.id && <Check size={16} className="text-accent2" />}
              </p>
              <p className="mt-2 text-[0.7rem] leading-relaxed text-muted">{entry.description}</p>
            </button>
          ))}
        </div>
        {busy === "tactics" && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Loader2 size={13} className="animate-spin" /> Saving tactics…
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/auction/${sessionId}/season`} className="btn btn-primary">
          Back to season hub <ArrowRight size={15} />
        </Link>
        <Link href={`/auction/${sessionId}/recap`} className="btn btn-outline">
          Auction recap
        </Link>
        <span className="text-[0.65rem] text-faint">
          {snapshot.callups.length > 0
            ? `${snapshot.callups.length} zero-fee call-up${snapshot.callups.length === 1 ? "" : "s"} recorded.`
            : "Every player came from the auction pool."}
        </span>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface2 text-muted transition hover:text-fg disabled:opacity-35"
      aria-label={label}
    >
      {children}
    </button>
  );
}
