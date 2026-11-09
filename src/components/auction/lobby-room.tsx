"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Copy,
  Crown,
  Gauge,
  Link2,
  Loader2,
  LogOut,
  Play,
  Sparkles,
  Users,
} from "lucide-react";
import { AuctionRoom } from "@/components/auction/auction-room";
import { FloatingRoomChat } from "@/components/auction/floating-chat";
import { SeatGrid } from "@/components/auction/lobby-shared";
import { TeamBadge } from "@/components/brand/team-badge";
import { clearSeat, loadManagerName, loadSeat, saveSeat } from "@/lib/auction/seat-storage";
import type { AuctionSnapshot } from "@/lib/auction/types";
import { cn } from "@/lib/cn";

const PACE_OPTIONS = [
  { tickMs: 1_000, label: "1s", hint: "Live" },
  { tickMs: 5_000, label: "5s", hint: "Quick" },
  { tickMs: 10_000, label: "10s", hint: "Standard" },
  { tickMs: 20_000, label: "20s", hint: "Considered" },
  { tickMs: 30_000, label: "30s", hint: "Chess clock" },
] as const;

function nearestPace(tickMs: number): (typeof PACE_OPTIONS)[number] {
  return PACE_OPTIONS.reduce((best, entry) =>
    Math.abs(entry.tickMs - tickMs) < Math.abs(best.tickMs - tickMs) ? entry : best,
  );
}

function subscribeNothing(): () => void {
  return () => {};
}

export function LobbyRoom({ initial }: { initial: AuctionSnapshot }) {
  const router = useRouter();
  const sessionId = initial.session.id;
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const storedSeat = useMemo(() => (hydrated ? loadSeat(sessionId) : null), [hydrated, sessionId]);
  const [snapshot, setSnapshot] = useState(initial);
  const [claimedToken, setClaimedToken] = useState<string | null>(null);
  const [pickedTeamId, setPickedTeamId] = useState<string | null>(null);
  const [claimNameInput, setClaimNameInput] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [customSeconds, setCustomSeconds] = useState("");

  const token = claimedToken ?? storedSeat?.token ?? null;
  const claimName = claimNameInput ?? storedSeat?.displayName ?? (hydrated ? loadManagerName() : "");
  const claimTeamId =
    pickedTeamId ?? snapshot.lobby?.seats.find((entry) => entry.isAi)?.teamId ?? null;
  const seatReady = hydrated;

  const errorTimer = useRef<number | null>(null);
  const copyTimer = useRef<number | null>(null);
  const notify = useCallback((message: string) => {
    setError(message);
    if (errorTimer.current) window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(null), 6000);
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimer.current) window.clearTimeout(errorTimer.current);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    };
  }, []);

  const refresh = useCallback(
    async (authToken: string | null) => {
      try {
        const query = authToken ? `&token=${encodeURIComponent(authToken)}` : "";
        const response = await fetch(`/api/lobbies/${sessionId}?tick=0${query}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { snapshot?: AuctionSnapshot };
        if (payload.snapshot) setSnapshot(payload.snapshot);
      } catch {
        // The next poll retries.
      }
    },
    [sessionId],
  );

  const lobbyStatus = snapshot.lobby?.status;
  useEffect(() => {
    if (!seatReady || lobbyStatus !== "lobby") return;
    const kickoff = window.setTimeout(() => void refresh(token), 0);
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void refresh(token);
    }, 2500);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [seatReady, lobbyStatus, token, refresh]);

  async function action(type: string, body: Record<string, unknown> = {}): Promise<boolean> {
    if (!token) {
      notify("Take a seat in this room before acting.");
      return false;
    }
    setBusy(type);
    try {
      const response = await fetch(`/api/lobbies/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-participant-token": token },
        body: JSON.stringify({ type, token, ...body }),
      });
      const payload = (await response.json()) as { snapshot?: AuctionSnapshot; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The room rejected that action.");
      if (payload.snapshot) setSnapshot(payload.snapshot);
      return true;
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "The room rejected that action.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function claimSeat() {
    if (!snapshot.lobby || !claimTeamId || busy) return;
    setBusy("claim");
    setError(null);
    try {
      const response = await fetch("/api/lobbies/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: snapshot.lobby.joinCode,
          teamId: claimTeamId,
          displayName: claimName.trim() || "Manager",
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
        teamId: payload.teamId ?? claimTeamId,
        displayName: claimName.trim() || "Manager",
      });
      setClaimedToken(payload.participantToken);
      await refresh(payload.participantToken);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "That seat could not be claimed.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(value: string, which: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(null), 1800);
    } catch {
      notify("Clipboard access failed — select the code and copy it manually.");
    }
  }

  async function leave() {
    const ok = await action("leave");
    if (!ok) return;
    clearSeat(sessionId);
    router.push("/auction");
  }

  async function closeRoom() {
    const ok = await action("close");
    if (!ok) return;
    clearSeat(sessionId);
    router.push("/auction");
  }

  if (!seatReady) {
    return (
      <div className="container-page flex min-h-[50vh] items-center justify-center py-16">
        <div className="panel flex items-center gap-3 px-6 py-5 text-sm text-muted">
          <Loader2 size={18} className="animate-spin text-accent" /> Taking your seat…
        </div>
      </div>
    );
  }

  if (!snapshot.lobby) {
    return (
      <div className="container-page py-16">
        <div className="surface-card mx-auto max-w-xl p-8 text-center">
          <AlertTriangle size={26} className="mx-auto text-gold" />
          <p className="mt-4 font-display text-2xl font-bold uppercase tracking-wide">Room unavailable</p>
          <p className="mt-2 text-sm text-muted">This session is not a multiplayer lobby.</p>
          <Link href={`/auction/${sessionId}`} className="btn btn-primary mt-5">
            Open the auction <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    );
  }

  if (snapshot.session.status === "abandoned") {
    return (
      <div className="container-page py-16">
        <div className="surface-card mx-auto max-w-xl p-8 text-center">
          <LogOut size={26} className="mx-auto text-faint" />
          <p className="mt-4 font-display text-2xl font-bold uppercase tracking-wide">This room has closed</p>
          <p className="mt-2 text-sm text-muted">
            The host closed the auction. Start a fresh room and send a new invite code.
          </p>
          <Link href="/auction" className="btn btn-primary mt-5">
            Back to the lobby <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    );
  }

  if (snapshot.session.status === "active" || snapshot.session.status === "completed") {
    return <AuctionRoom key={token ?? "spectator"} initial={snapshot} seatToken={token} />;
  }

  const lobby = snapshot.lobby;
  const viewer = lobby.viewer;
  const isHost = viewer.isHost;
  const seated = viewer.canAct;
  const seat = lobby.seats.find((entry) => entry.isViewer) ?? null;
  const openSeats = lobby.seats.filter((entry) => entry.isAi).length;
  const readyCount = lobby.participants.filter((entry) => entry.isReady && entry.online).length;
  const shareLink =
    typeof window === "undefined"
      ? `/auction/join?code=${lobby.joinCode}`
      : `${window.location.origin}/auction/join?code=${lobby.joinCode}`;
  const pace = nearestPace(lobby.tickMs);

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/auction" className="link-arrow text-xs text-muted hover:text-fg">
          <ArrowLeft size={14} /> Auction lobby
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-gold">
            <Crown size={12} /> Private room
          </span>
          <span className="chip">
            <span className="live-dot" aria-hidden="true" /> Waiting room
          </span>
          {isHost && <span className="chip chip-accent">You are the host</span>}
          {!seated && <span className="chip">Spectating</span>}
        </div>
      </div>

      <section className="surface-card stadium-hero mt-4 overflow-hidden">
        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-accent2">
              {snapshot.session.rulebook.name}
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.9rem,4vw,3rem)] font-bold uppercase leading-[0.95] tracking-wide">
              {snapshot.session.name}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Ten franchise seats. Humans take what they can, and the AI managers run every seat left
              open — bidding to their own valuations, squad needs and purse limits.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void copy(lobby.joinCode, "code")}
                className="join-code-display transition-colors hover:border-accent/50"
                title="Copy room code"
              >
                {lobby.joinCode}
                <span className="ml-2 inline-flex items-center gap-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-faint">
                  {copied === "code" ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                  {copied === "code" ? "Copied" : "Copy"}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => void copy(shareLink, "link")}
              >
                <Link2 size={14} /> {copied === "link" ? "Invite copied" : "Copy invite link"}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-[0.68rem]">
              <span className="chip">
                <Users size={12} /> {lobby.humanCount} human{lobby.humanCount === 1 ? "" : "s"}
              </span>
              <span className="chip">
                <Bot size={12} /> {lobby.aiCount} AI franchise{lobby.aiCount === 1 ? "" : "s"}
              </span>
              <span className="chip">
                <Check size={12} /> {readyCount} ready
              </span>
              <span className="chip">
                <Gauge size={12} /> {pace.label} pace
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-bg/45 p-4 backdrop-blur-sm">
            {seated ? (
              <>
                <div className="flex items-center gap-3">
                  <TeamBadge teamId={viewer.teamId} size={42} />
                  <div className="min-w-0">
                    <p className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-faint">
                      Your seat
                    </p>
                    <p className="truncate font-display text-lg font-bold uppercase tracking-wide">
                      {seat?.displayName ?? "Manager"}
                    </p>
                    <p className="text-[0.65rem] text-muted">
                      {snapshot.teams.find((team) => team.id === viewer.teamId)?.name ?? "Franchise"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    className={cn("btn w-full", seat?.isReady ? "btn-outline" : "btn-ghost")}
                    onClick={() => void action("ready", { ready: !seat?.isReady })}
                    disabled={busy === "ready"}
                  >
                    {busy === "ready" ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Check size={15} />
                    )}
                    {seat?.isReady ? "Ready — tap to stand down" : "I'm ready"}
                  </button>

                  {isHost ? (
                    <button
                      type="button"
                      className="btn btn-primary w-full"
                      onClick={() => void action("start")}
                      disabled={busy === "start"}
                    >
                      {busy === "start" ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Play size={16} />
                      )}
                      Start with {lobby.humanCount} human
                      {lobby.humanCount === 1 ? "" : "s"} + {lobby.aiCount} AI
                    </button>
                  ) : (
                    <p className="rounded-lg border border-line bg-surface2 px-3 py-2 text-center text-[0.68rem] text-muted">
                      Waiting for the host to start. The AI managers are already seated.
                    </p>
                  )}

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm w-full"
                    onClick={() => void leave()}
                    disabled={busy === "leave"}
                  >
                    <LogOut size={13} /> Leave this room
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-accent2">
                    <Sparkles size={11} className="mr-1 inline" /> Open seats
                  </p>
                  <p className="mt-1 font-display text-xl font-bold uppercase leading-tight tracking-wide">
                    {openSeats > 0 ? `${openSeats} franchise${openSeats === 1 ? "" : "s"} unclaimed` : "All seats claimed"}
                  </p>
                  <p className="mt-1 text-[0.72rem] leading-relaxed text-muted">
                    Pick an open crest below, name yourself and join the bidding. AI fills anything left
                    when the host starts.
                  </p>
                </div>
                <div>
                  <label htmlFor="claim-name" className="field-label">
                    Manager name
                  </label>
                  <input
                    id="claim-name"
                    className="input"
                    value={claimName}
                    maxLength={24}
                    onChange={(event) => setClaimNameInput(event.target.value)}
                    placeholder="Your name in the room"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={() => void claimSeat()}
                  disabled={!claimTeamId || busy === "claim"}
                >
                  {busy === "claim" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                  {claimTeamId
                    ? `Claim ${snapshot.teams.find((team) => team.id === claimTeamId)?.shortName ?? "seat"}`
                    : "Pick an open seat"}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-5">
          <section className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <div>
                <p className="font-display text-sm font-bold uppercase tracking-[0.12em]">The ten seats</p>
                <p className="mt-0.5 text-[0.65rem] text-faint">
                  Click an open franchise to claim it. Unclaimed seats become AI-managed at the first lot.
                </p>
              </div>
              <span className="chip">{lobby.humanCount} / 10 human</span>
            </div>
            <div className="p-4 sm:p-5">
              <SeatGrid
                seats={lobby.seats}
                teams={snapshot.teams}
                selectedTeamId={seated ? null : claimTeamId}
                onSelect={seated ? undefined : setPickedTeamId}
                canManage={isHost}
                onKick={(participantId) => void action("kick", { participantId })}
              />
            </div>
          </section>

        </div>

        <div className="space-y-5">
          <section className="surface-card p-5">
            <div className="flex items-center gap-2">
              <Gauge size={16} className="text-accent2" />
              <p className="font-display text-sm font-bold uppercase tracking-[0.12em]">Auction pace</p>
            </div>
            <p className="mt-1.5 text-[0.68rem] leading-relaxed text-faint">
              The room advances server-side every tick. The host sets the speed; every browser stays in
              sync automatically.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {PACE_OPTIONS.map((entry) => {
                const active = pace.tickMs === entry.tickMs;
                return (
                  <button
                    key={entry.tickMs}
                    type="button"
                    className={cn(
                      "rounded-lg border px-2 py-2 text-center transition-colors",
                      active ? "border-accent/60 bg-accent/10 text-accent2" : "border-line bg-surface2/50 text-muted",
                      isHost ? "hover:border-accent/40" : "cursor-not-allowed opacity-60",
                    )}
                    onClick={() => isHost && void action("speed", { tickMs: entry.tickMs })}
                    disabled={!isHost || busy === "speed"}
                    aria-pressed={active}
                  >
                    <span className="block font-display text-base font-bold">{entry.label}</span>
                    <span className="block text-[0.55rem] uppercase tracking-[0.1em]">{entry.hint}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <label className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-surface2/50 px-3 py-1.5">
                <span className="text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-faint">Custom</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={customSeconds}
                  onChange={(event) => setCustomSeconds(event.target.value)}
                  placeholder="e.g. 15"
                  disabled={!isHost}
                  className="w-full min-w-0 bg-transparent text-sm font-semibold outline-none"
                  aria-label="Custom bid timer in seconds"
                />
                <span className="text-xs text-faint">s</span>
              </label>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!isHost || !customSeconds}
                onClick={() => {
                  const seconds = Math.min(120, Math.max(1, Math.round(Number(customSeconds) || 0)));
                  if (!seconds) return;
                  void action("speed", { tickMs: seconds * 1000 });
                  setCustomSeconds("");
                }}
              >
                Set
              </button>
            </div>
            <p className="mt-2 text-[0.62rem] text-faint">
              {isHost ? "Pick 5s, 10s, 20s, 30s or a custom clock up to two minutes." : "Only the host can change the timer."}
            </p>
          </section>

          {isHost && (
            <section className="rounded-xl border border-danger/25 bg-danger/5 p-4">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-danger">Host controls</p>
              <p className="mt-1 text-[0.68rem] leading-relaxed text-muted">
                Close the room for everyone. The audit trail is kept, but nobody can resume this auction.
              </p>
              <button
                type="button"
                className="btn btn-danger btn-sm mt-3"
                onClick={() => setConfirmClose(true)}
              >
                Close multiplayer room
              </button>
            </section>
          )}
        </div>
      </div>

      <FloatingRoomChat
        sessionId={sessionId}
        messages={lobby.chat}
        viewerTeamId={lobby.viewer.teamId}
        disabled={!seated}
        onSend={(body, kind) => action("chat", { body, kind })}
        onSendVoice={(audio, mime, durationMs) => action("voice", { audio, mime, durationMs })}
      />

      {error && (
        <div role="alert" className="toast flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
          <span>{error}</span>
          <button
            type="button"
            className="ml-2 text-faint hover:text-fg"
            onClick={() => setError(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {confirmClose && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="close-room-title">
          <div className="modal-panel p-6">
            <p id="close-room-title" className="font-display text-2xl font-bold uppercase tracking-wide">
              Close this room?
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Every manager is removed and the auction cannot be resumed. Create a new room to play
              again.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmClose(false)}>
                Keep the room open
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void closeRoom()}
                disabled={busy === "close"}
              >
                {busy === "close" ? <Loader2 size={15} className="animate-spin" /> : null}
                Close room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
