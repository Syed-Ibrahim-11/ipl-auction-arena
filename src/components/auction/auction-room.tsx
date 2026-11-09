"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Copy,
  Download,
  FastForward,
  Flame,
  Gavel,
  Info,
  Loader2,
  LogOut,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Target,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { AuctioneerConsole, SaleOverlay, useAuctioneer } from "@/components/auction/auctioneer";
import { useCrowdAmbience } from "@/components/auction/ambience";
import { FloatingRoomChat } from "@/components/auction/floating-chat";
import { UpcomingDock } from "@/components/auction/upcoming-dock";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import { EvidenceBadge, RatingMeter, RoleChip, StatBlock } from "@/components/ui";
import type {
  AuctionAction,
  AuctionSnapshot,
  SnapshotBid,
  SnapshotLot,
  SnapshotSquadPlayer,
  SnapshotTeam,
} from "@/lib/auction/types";
import { formatLakh } from "@/lib/money";
import { cn } from "@/lib/cn";

const SPEEDS = [
  { id: "slow", label: "0.5×", delay: 1400 },
  { id: "normal", label: "1×", delay: 650 },
  { id: "fast", label: "2×", delay: 280 },
] as const;

type SpeedId = (typeof SPEEDS)[number]["id"];

function isResolved(lot: SnapshotLot | null): boolean {
  return lot?.status === "sold" || lot?.status === "unsold";
}


function needsHumanRtm(lot: SnapshotLot | null): boolean {
  if (!lot || lot.status !== "rtm") return false;
  const actions = lot.rtmActions;
  return (
    actions.canInvoke ||
    actions.canDeclineOriginal ||
    actions.canRaise ||
    actions.canHold ||
    actions.canMatch ||
    actions.canDeclineMatch
  );
}

function lotHeadline(lot: SnapshotLot, userTeamId: string): string {
  if (lot.status === "sold") {
    return lot.winningTeamId === userTeamId ? "SOLD TO YOU" : `SOLD · ${lot.winningTeamName ?? "Franchise"}`;
  }
  if (lot.status === "unsold") return "UNSOLD";
  if (lot.status === "rtm") return "RIGHT TO MATCH";
  return lot.leaderTeamId === userTeamId ? "YOU LEAD THE ROOM" : "ON THE BLOCK";
}

export function AuctionRoom({
  initial,
  seatToken,
}: {
  initial: AuctionSnapshot;
  seatToken?: string | null;
}) {
  const router = useRouter();
  const multiplayer = Boolean(initial.lobby);
  const [snapshot, setSnapshot] = useState(initial);
  const [running, setRunning] = useState(
    initial.session.status === "active" && !needsHumanRtm(initial.currentLot),
  );
  const [speedId, setSpeedId] = useState<SpeedId>("normal");
  const [busy, setBusy] = useState(false);
  const [roomBusy, setRoomBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAbandon, setShowAbandon] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [tab, setTab] = useState<"squads" | "teams">("squads");
  const busyRef = useRef(false);
  const errorTimer = useRef<number | null>(null);
  const sessionId = snapshot.session.id;
  const userTeam = snapshot.userTeam;

  useEffect(() => {
    if (!showInfo) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowInfo(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showInfo]);
  const lot = snapshot.currentLot;
  const lobby = snapshot.lobby;
  const isHost = lobby?.viewer.isHost ?? false;
  const seated = !multiplayer || Boolean(lobby?.viewer.canAct);
  const roomPaused = multiplayer ? Boolean(lobby?.paused) : false;
  const runningNow = multiplayer ? !roomPaused && !snapshot.finished : running;
  const userTeamId = userTeam?.id ?? null;
  const speed = SPEEDS.find((entry) => entry.id === speedId)?.delay ?? 650;
  const userRtmTurn = needsHumanRtm(lot);
  const auctioneer = useAuctioneer(lot, snapshot.finished, runningNow);
  const crowd = useCrowdAmbience();
  const [saleMoment, setSaleMoment] = useState<SnapshotLot | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [outbid, setOutbid] = useState(false);
  const lastLeader = useRef<string | null>(null);
  const copyTimer = useRef<number | null>(null);
  const saleTimer = useRef<number | null>(null);
  const initialResolutionKey =
    initial.currentLot && isResolved(initial.currentLot)
      ? `${initial.currentLot.id}:${initial.currentLot.status}`
      : null;
  const seenResolution = useRef<string | null>(initialResolutionKey);
  const announced = useRef<string | null>(initialResolutionKey);

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (seatToken) headers["x-participant-token"] = seatToken;
    return headers;
  }, [seatToken]);

  const notify = useCallback((message: string) => {
    setError(message);
    if (errorTimer.current) window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(null), 6000);
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimer.current) window.clearTimeout(errorTimer.current);
      if (saleTimer.current) window.clearTimeout(saleTimer.current);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!lot || !isResolved(lot)) return;
    const key = `${lot.id}:${lot.status}`;
    if (seenResolution.current === key) return;
    seenResolution.current = key;
    setSaleMoment(lot);
    if (saleTimer.current) window.clearTimeout(saleTimer.current);
    saleTimer.current = window.setTimeout(() => {
      setSaleMoment(null);
      saleTimer.current = null;
    }, 1800);
  }, [lot]);

  useEffect(() => {
    if (!lot) return;
    let key: string | null = null;
    let text = "";
    if (lot.status === "sold") {
      key = `${lot.id}:sold`;
      text = `Sold: ${lot.player.name} to ${lot.winningTeamName ?? "the winning franchise"} for ${formatLakh(lot.finalPriceLakh)}.`;
    } else if (lot.status === "unsold") {
      key = `${lot.id}:unsold`;
      text = `Unsold: ${lot.player.name} at ${formatLakh(lot.basePriceLakh)}.`;
    } else if (userRtmTurn) {
      key = `${lot.id}:rtm-human`;
      text = "Right to Match decision required.";
    }
    if (!key || announced.current === key) return;
    announced.current = key;
    setAnnouncement(text);
  }, [lot, userRtmTurn]);

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) setRunning(false);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  async function send(action: AuctionAction, options?: { silent?: boolean }) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/actions`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(action),
      });
      const payload = (await response.json()) as { snapshot?: AuctionSnapshot; error?: string };
      if (!response.ok || !payload.snapshot) {
        throw new Error(payload.error ?? "The action was rejected.");
      }
      setSnapshot(payload.snapshot);
      if (payload.snapshot.finished || needsHumanRtm(payload.snapshot.currentLot)) {
        setRunning(false);
      }
      setError(null);
    } catch (cause) {
      if (!options?.silent) {
        notify(cause instanceof Error ? cause.message : "The action was rejected.");
      }
      void resync();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function resync() {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        cache: "no-store",
        headers: authHeaders(),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { snapshot?: AuctionSnapshot };
      if (payload.snapshot) setSnapshot(payload.snapshot);
    } catch {
      // Keep the last known state; the next action will retry.
    }
  }

  async function roomAction(type: string, body: Record<string, unknown> = {}): Promise<boolean> {
    if (!seatToken) {
      notify("Take a seat in this room before acting.");
      return false;
    }
    setRoomBusy(type);
    try {
      const response = await fetch(`/api/lobbies/${sessionId}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ type, token: seatToken, ...body }),
      });
      const payload = (await response.json()) as {
        snapshot?: AuctionSnapshot;
        error?: string;
        closed?: boolean;
      };
      if (!response.ok) throw new Error(payload.error ?? "The room rejected that action.");
      if (payload.closed) {
        router.push("/auction");
        return true;
      }
      if (payload.snapshot) setSnapshot(payload.snapshot);
      return true;
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "The room rejected that action.");
      return false;
    } finally {
      setRoomBusy(null);
    }
  }

  async function copyJoinCode() {
    if (!lobby) return;
    try {
      await navigator.clipboard.writeText(lobby.joinCode);
      setCopiedCode(true);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      notify("Clipboard access failed — select the room code and copy it manually.");
    }
  }

  /**
   * Multiplayer rooms advance on the server. Every browser polls the same
   * heartbeat; exactly one request per tick window wins the advance. Background
   * tabs keep polling so the shared clock never stalls while a host alt-tabs.
   */
  useEffect(() => {
    if (!multiplayer || snapshot.session.status !== "active") return;
    let stopped = false;
    let inFlight = false;
    async function poll() {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const query = seatToken ? `&token=${encodeURIComponent(seatToken)}` : "";
        const response = await fetch(`/api/lobbies/${sessionId}?tick=1${query}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { snapshot?: AuctionSnapshot };
        if (!stopped && payload.snapshot) setSnapshot(payload.snapshot);
      } catch {
        // The next poll retries.
      } finally {
        inFlight = false;
      }
    }
    void poll();
    const timer = window.setInterval(poll, 700);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [multiplayer, sessionId, seatToken, snapshot.session.status]);

  /** Flash a cue when another franchise takes the lead away from this manager. */
  useEffect(() => {
    const leader = lot?.status === "live" ? lot.leaderTeamId : null;
    const previous = lastLeader.current;
    lastLeader.current = leader;
    if (!userTeamId || previous !== userTeamId || !leader || leader === userTeamId) return;
    const show = window.setTimeout(() => setOutbid(true), 0);
    const hide = window.setTimeout(() => setOutbid(false), 3200);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [lot?.leaderTeamId, lot?.status, userTeamId]);

  const tick = useCallback(() => {
    if (busyRef.current) return;
    void send({ type: "tick" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (multiplayer) return;
    if (!running || snapshot.finished || snapshot.session.status !== "active") return;
    if (userRtmTurn) return;
    const delay = isResolved(snapshot.currentLot) ? 1200 : speed;
    const timer = window.setTimeout(tick, delay);
    return () => window.clearTimeout(timer);
  }, [multiplayer, running, snapshot, speed, tick, userRtmTurn]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        if (multiplayer) {
          if (isHost) void roomAction(roomPaused ? "resume" : "pause");
        } else {
          setRunning((value) => !value);
        }
      } else if (key === "n" && !isResolved(lot) && (!multiplayer || isHost)) {
        event.preventDefault();
        tick();
      } else if (key === "b" && seated && lot?.status === "live" && lot.userBidBlockedReason === null) {
        event.preventDefault();
        void send({ type: "bid", amountLakh: lot.nextBidLakh ?? 0 });
      } else if (key === "m") {
        event.preventDefault();
        auctioneer.toggleSound();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot, tick]);

  async function abandon() {
    setAbandoning(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "The auction could not be abandoned.");
      }
      router.push("/auction");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "The auction could not be abandoned.");
      setAbandoning(false);
      setShowAbandon(false);
    }
  }

  const progress = snapshot.session.totalLots > 0
    ? (snapshot.session.completedLots / snapshot.session.totalLots) * 100
    : 0;

  return (
    <div className="container-page auction-arena pb-24 pt-6 sm:pb-28 sm:pt-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={multiplayer ? `/auction/lobby/${sessionId}` : "/auction"}
            className="link-arrow text-xs text-muted hover:text-fg"
          >
            <ArrowLeft size={14} /> {multiplayer ? "Room lobby" : "Auction lobby"}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">
              <span className={cn("h-1.5 w-1.5 rounded-full", snapshot.finished ? "bg-success" : "bg-accent")} />
              {snapshot.finished ? "Auction complete" : multiplayer ? "Shared live room" : "Live room"}
            </span>
            {multiplayer && lobby && (
              <>
                <button
                  type="button"
                  className="chip chip-info transition-colors hover:border-info"
                  onClick={() => void copyJoinCode()}
                  title="Copy room code"
                >
                  <Copy size={11} /> {copiedCode ? "Copied" : lobby.joinCode}
                </button>
                <span className="chip">
                  <Users size={11} /> {lobby.humanCount} human · {lobby.aiCount} AI
                </span>
              </>
            )}
            {multiplayer && !seated && <span className="chip chip-gold">Spectating</span>}
            {multiplayer && seated && !isHost && <span className="chip">Host: {lobby?.participants.find((entry) => entry.isHost)?.displayName ?? "—"}</span>}
            {multiplayer && isHost && roomPaused && <span className="chip chip-gold">Clock paused</span>}
            {snapshot.session.status === "active" && (!multiplayer || isHost) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAbandon(true)}>
                <AlertTriangle size={14} /> {multiplayer ? "Close room" : "Abandon"}
              </button>
            )}
            {multiplayer && !isHost && (
              <Link href="/auction" className="btn btn-ghost btn-sm">
                <LogOut size={14} /> Exit
              </Link>
            )}
            {snapshot.finished && (
              <Link href={`/auction/${sessionId}/recap`} className="btn btn-primary btn-sm">
                <Trophy size={14} /> Full recap
              </Link>
            )}
          </div>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
            <span className="chip chip-compact">
              Lot <span className="num">{snapshot.currentLot?.lotNumber ?? snapshot.session.totalLots}</span> /{" "}
              {snapshot.session.totalLots}
            </span>
            {multiplayer ? (
              <span className="chip chip-compact" title="The host can change the bid timer in the room lobby.">
                {Math.round((lobby?.tickMs ?? 1_000) / 1000)}s timer
              </span>
            ) : (
              <div className="flex overflow-hidden rounded-full border border-line bg-surface2 p-0.5">
                {SPEEDS.map((entry) => {
                  const active = speedId === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSpeedId(entry.id)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[0.68rem] font-semibold transition-colors",
                        active ? "bg-accent text-accentInk" : "text-muted hover:text-fg",
                      )}
                      aria-pressed={active}
                    >
                      {entry.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn("btn btn-sm", runningNow ? "btn-ghost" : "btn-primary")}
                onClick={() => {
                  if (multiplayer) void roomAction(roomPaused ? "resume" : "pause");
                  else setRunning((value) => !value);
                }}
                disabled={snapshot.finished || userRtmTurn || (multiplayer && !isHost) || roomBusy === "pause" || roomBusy === "resume"}
                aria-label={runningNow ? "Pause the auction" : "Resume the auction"}
              >
                {runningNow ? (
                  <>
                    <Pause size={14} /> Pause
                  </>
                ) : (
                  <>
                    <Play size={14} /> Resume
                  </>
                )}
              </button>
              {!runningNow && !snapshot.finished && (!multiplayer || isHost) && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={tick} disabled={busy}>
                  <SkipForward size={14} /> {multiplayer ? "Step lot" : "Next action"}
                </button>
              )}
            </div>
          </div>
          <div className="h-1 bg-surface3" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          {snapshot.finished ? (
            <FinishPanel snapshot={snapshot} />
          ) : lot ? (
            <>
              <LotPanel
                lot={lot}
                teams={snapshot.teams}
                totalLots={snapshot.session.totalLots}
                userTeamId={userTeamId ?? ""}
                maxBidLakh={userTeam?.maxBidLakh ?? null}
                outbid={outbid}
                busy={busy}
                running={runningNow}
                onBid={() => lot.nextBidLakh && void send({ type: "bid", amountLakh: lot.nextBidLakh })}
                onNextLot={tick}
              />
              {lot.status === "rtm" && (
                <RtmPanel
                  key={`${lot.id}-${lot.rtmStatus}-${lot.rtmActions.minRaiseLakh ?? "none"}`}
                  lot={lot}
                  busy={busy}
                  onAction={(action) => void send(action)}
                />
              )}
            </>
          ) : (
            <div className="surface-card flex flex-col items-center px-6 py-16 text-center">
              <Trophy size={28} className="text-gold" />
              <p className="mt-4 font-display text-2xl font-bold uppercase tracking-wide">No lot on the block</p>
              <p className="mt-2 max-w-sm text-sm text-muted">
                This session has no active lot. Resume the room to advance, or open the recap for the
                complete audit trail.
              </p>
              <button type="button" className="btn btn-primary mt-5" onClick={tick} disabled={busy}>
                Advance the room <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="surface-card overflow-hidden">
            <div className="flex border-b border-line">
              <button
                type="button"
                onClick={() => setTab("squads")}
                className={cn(
                  "flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
                  tab === "squads" ? "bg-surface2 text-fg" : "text-faint hover:text-fg",
                )}
                aria-pressed={tab === "squads"}
              >
                Your squad · {snapshot.userSquad.length}
              </button>
              <button
                type="button"
                onClick={() => setTab("teams")}
                className={cn(
                  "flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
                  tab === "teams" ? "bg-surface2 text-fg" : "text-faint hover:text-fg",
                )}
                aria-pressed={tab === "teams"}
              >
                Franchises · 10
              </button>
            </div>
            {tab === "squads" ? (
              <SquadPanel snapshot={snapshot} />
            ) : (
              <TeamsBoard
                teams={snapshot.teams}
                userTeamId={userTeamId ?? ""}
                sessionId={snapshot.session.id}
              />
            )}
          </div>
          {userTeam && (
            <SquadPlan
              team={userTeam}
              squadMax={snapshot.session.rulebook.squadMax}
              overseasMax={snapshot.session.rulebook.overseasMax}
            />
          )}
        </div>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {multiplayer && lobby && (
        <FloatingRoomChat
          sessionId={snapshot.session.id}
          messages={lobby.chat}
          viewerTeamId={lobby.viewer.teamId}
          disabled={!seated}
          onSend={(body, kind) => roomAction("chat", { body, kind })}
          onSendVoice={(audio, mime, durationMs) => roomAction("voice", { audio, mime, durationMs })}
        />
      )}

      <FloatingPurse
        teams={snapshot.teams}
        cap={snapshot.session.rulebook.purseCapLakh}
        userTeam={userTeam}
        userTeamId={userTeamId}
        squadMax={snapshot.session.rulebook.squadMax}
        overseasMax={snapshot.session.rulebook.overseasMax}
      />

      <UpcomingDock
        upcoming={snapshot.upcomingLots}
        remainingLots={Math.max(0, snapshot.session.totalLots - snapshot.session.completedLots)}
        sessionId={snapshot.session.id}
      />

      <button
        type="button"
        onClick={() => setShowInfo((value) => !value)}
        aria-expanded={showInfo}
        aria-label={showInfo ? "Hide room info" : "Show room info"}
        className={cn(
          "fixed right-3 top-[84px] z-40 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.66rem] font-semibold shadow-lg backdrop-blur-xl transition-colors",
          showInfo
            ? "border-accent/60 bg-accent text-accentInk"
            : "border-line bg-bg/90 text-muted hover:border-accent/40 hover:text-fg",
        )}
      >
        <Info size={13} /> Room info
      </button>

      {showInfo && (
        <div className="fixed inset-x-0 top-[84px] z-40 flex justify-center px-3">
          <div className="animate-pop w-[min(96vw,880px)] overflow-hidden rounded-2xl border border-line bg-bg/96 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <p className="text-[0.56rem] font-semibold uppercase tracking-[0.16em] text-accent2">
                  {snapshot.session.rulebook.name}
                </p>
                <h1 className="mt-0.5 truncate font-display text-lg font-bold uppercase leading-tight tracking-wide">
                  {snapshot.session.name}
                </h1>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowInfo(false)}
                aria-label="Close room info"
              >
                <X size={15} />
              </button>
            </div>
            <div className="grid max-h-[calc(100vh-180px)] gap-3 overflow-y-auto px-4 py-3 scrollbar-thin lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
              <dl className="grid grid-cols-2 content-start gap-2 text-[0.68rem]">
                <InfoFact
                  label="Your franchise"
                  value={userTeam?.shortName ?? "Spectating"}
                  hint={userTeam?.name}
                />
                <InfoFact
                  label="Purse left"
                  value={userTeam ? formatLakh(userTeam.purseLakh) : "—"}
                  hint={userTeam ? `${formatLakh(userTeam.spentLakh)} spent` : undefined}
                />
                <InfoFact
                  label="Squad"
                  value={userTeam ? `${userTeam.squadSize} / ${snapshot.session.rulebook.squadMax}` : "—"}
                  hint={userTeam ? `${userTeam.overseasCount} / ${snapshot.session.rulebook.overseasMax} overseas` : undefined}
                />
                <InfoFact
                  label={snapshot.session.rulebook.rtmEnabled ? "RTM cards" : "Right to Match"}
                  value={
                    snapshot.session.rulebook.rtmEnabled
                      ? userTeam
                        ? `${userTeam.rtmRemaining} / ${snapshot.session.rulebook.rtmCards}`
                        : String(snapshot.session.rulebook.rtmCards)
                      : "Off"
                  }
                  hint={
                    snapshot.session.rulebook.rtmEnabled
                      ? `${snapshot.session.rulebook.rtmCards} cards this room`
                      : "Every lot goes to the highest bidder"
                  }
                />
                <InfoFact
                  label="Progress"
                  value={`${snapshot.session.completedLots} / ${snapshot.session.totalLots}`}
                  hint={`${Math.round(progress)}% resolved`}
                />
                {multiplayer && lobby ? (
                  <InfoFact label="Room code" value={lobby.joinCode} hint={`${lobby.humanCount} human · ${lobby.aiCount} AI`} />
                ) : (
                  <InfoFact
                    label="Managers"
                    value={`${snapshot.teams.length} franchises`}
                    hint={snapshot.finished ? "Auction complete" : "AI-managed"}
                  />
                )}
              </dl>
              <AuctioneerConsole
                call={auctioneer.call}
                transcript={auctioneer.transcript}
                soundOn={auctioneer.soundOn}
                speaking={auctioneer.speaking}
                voiceAvailable={auctioneer.voiceAvailable}
                onToggleSound={auctioneer.toggleSound}
                onClear={auctioneer.clearTranscript}
                crowdOn={crowd.crowdOn}
                crowdAvailable={crowd.available}
                onToggleCrowd={crowd.toggleCrowd}
              />
            </div>
          </div>
        </div>
      )}

      {saleMoment && <SaleOverlay lot={saleMoment} userTeamId={userTeam?.id ?? ""} />}

      {error && (
        <div role="alert" className="toast flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
          <span>{error}</span>
          <button type="button" className="ml-2 text-faint hover:text-fg" onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {showAbandon && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="abandon-title">
          <div className="modal-panel p-6">
            <p id="abandon-title" className="font-display text-2xl font-bold uppercase tracking-wide">
              Abandon this auction?
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The room will close and disappear from your active lobby. Its event log and transactions
              remain in the database for audit, but you cannot resume it.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAbandon(false)} disabled={abandoning}>
                Keep bidding
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void abandon()} disabled={abandoning}>
                {abandoning ? <Loader2 size={15} className="animate-spin" /> : null}
                Abandon auction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoFact({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-bg2/60 px-2.5 py-2">
      <dt className="text-[0.52rem] font-semibold uppercase tracking-[0.1em] text-faint">{label}</dt>
      <dd className="num mt-0.5 truncate text-[0.8rem] font-semibold">{value}</dd>
      {hint && <dd className="truncate text-[0.55rem] text-faint">{hint}</dd>}
    </div>
  );
}

function LotPanel({
  lot,
  teams,
  totalLots,
  userTeamId,
  maxBidLakh,
  outbid,
  busy,
  running,
  onBid,
  onNextLot,
}: {
  lot: SnapshotLot;
  teams: SnapshotTeam[];
  totalLots: number;
  userTeamId: string;
  maxBidLakh: number | null;
  outbid: boolean;
  busy: boolean;
  running: boolean;
  onBid: () => void;
  onNextLot: () => void;
}) {
  const player = lot.player;
  const rating = player.rating;
  const resolved = isResolved(lot);
  const userLeading = lot.leaderTeamId === userTeamId;
  const isUserSale = lot.winningTeamId === userTeamId;
  const goingLabel = lot.going >= 2 ? "Going twice" : lot.going === 1 ? "Going once" : "Bidding open";
  const displayPrice = lot.finalPriceLakh ?? lot.revisedPriceLakh ?? lot.currentBidLakh;
  const actual = lot.actualAuction;

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="num-pill">LOT {lot.lotNumber}</span>
          <span className="text-[0.65rem] uppercase tracking-[0.14em] text-faint">{lot.setName}</span>
        </div>
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-faint">
          {lot.lotNumber} / {totalLots}
        </span>
      </div>

      <div className="p-5">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="w-28 shrink-0 sm:w-32">
            <PlayerAvatar
              name={player.name}
              teamId={player.primaryTeamId}
              role={player.role}
              country={player.country}
              size="hero"
              showNote
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.5rem)] font-bold uppercase leading-[0.95] tracking-wide">
                  {player.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <RoleChip role={player.role} />
                  {player.isOverseas !== null && (
                    <span className="chip">{player.isOverseas ? "Overseas" : "India"}</span>
                  )}
                  {player.capped !== null && <span className="chip">{player.capped ? "Capped" : "Uncapped"}</span>}
                  {player.age !== null && <span className="chip">{player.age} yrs</span>}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-center">
              <div>
                <p className="text-[0.56rem] font-semibold uppercase tracking-[0.12em] text-faint">Base</p>
                <p className="num mt-1 text-sm font-semibold">{formatLakh(lot.basePriceLakh)}</p>
              </div>
              <div>
                <p className="text-[0.56rem] font-semibold uppercase tracking-[0.12em] text-faint">Evidence</p>
                <p className="mt-1 flex justify-center">
                  <EvidenceBadge quality={rating?.evidenceQuality} />
                </p>
              </div>
            </div>
          </div>
        </div>

        {rating && (
          <div className="mt-4 grid grid-cols-3 gap-4 rounded-xl border border-line bg-surface2/50 p-3.5">
            <RatingMeter label="Batting" value={rating.batting} />
            <RatingMeter label="Bowling" value={rating.bowling} />
            <RatingMeter label="Fielding" value={rating.fielding} />
          </div>
        )}

        <div className="mt-4 rounded-xl border border-line bg-bg/50 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-faint">
                {resolved ? "Hammer price" : lot.status === "rtm" ? "Final leader bid" : "Current bid"}
              </p>
              <p className="stat-value mt-1 text-[2.1rem] text-accent2">
                {displayPrice !== null ? (
                  <span key={displayPrice} className="inline-block animate-bid-pop">
                    {formatLakh(displayPrice)}
                  </span>
                ) : (
                  "No bids"
                )}
              </p>
              <p className="mt-1 text-xs text-muted">
                {lot.status === "rtm"
                  ? lot.revisedPriceLakh
                    ? `Final offer ${formatLakh(lot.revisedPriceLakh)} · RTM decision pending`
                    : `Original bid ${formatLakh(lot.currentBidLakh)} · RTM decision pending`
                  : resolved
                    ? lot.winningTeamName
                      ? `${lot.winningTeamName} · ${lot.soldVia === "rtm-match" ? "matched via RTM" : lot.soldVia === "rtm-declined" ? "after RTM decline" : "open bid"}`
                      : "No franchise bid"
                    : lot.leaderTeamName
                      ? `Leading: ${lot.leaderTeamName}`
                      : "Waiting for the first bid"}
              </p>
            </div>
            {!resolved && lot.status === "live" && (
              <div className="text-right">
                <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-faint">Next valid bid</p>
                <p className="num mt-1 font-display text-xl font-bold">
                  {lot.nextBidLakh !== null ? formatLakh(lot.nextBidLakh) : "—"}
                </p>
                {maxBidLakh !== null && (
                  <p className="mt-1 text-[0.65rem] text-faint">Your max {formatLakh(maxBidLakh)}</p>
                )}
              </div>
            )}
          </div>

          {!resolved && lot.status === "live" && (
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <span className={cn("h-2 w-2 rounded-full", userLeading ? "bg-success" : "bg-accent")} />
              <span className="text-xs font-semibold">
                {userLeading ? "You are the highest bidder" : goingLabel}
              </span>
              <span className="ml-auto text-[0.62rem] text-faint">
                {lot.bids.length} {lot.bids.length === 1 ? "bid" : "bids"}
              </span>
              <div className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className={cn("h-1.5 w-6 rounded-full", index < lot.going ? "bg-accent" : "bg-surface3")}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {outbid && !resolved && (
          <div
            role="status"
            className="mt-3 flex items-center gap-2 rounded-xl border border-danger/35 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger animate-fade-up"
          >
            <Flame size={14} className="shrink-0" />
            Outbid — the room moved past your last bid. Raise it again to stay in front.
          </div>
        )}

        {lot.status === "live" && (
          <div className="mt-4">
            <button
              type="button"
              className="btn btn-primary btn-lg w-full"
              onClick={onBid}
              disabled={busy || lot.userBidBlockedReason !== null || lot.nextBidLakh === null}
            >
              {busy ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Gavel size={18} />
              )}
              {lot.userBidBlockedReason === null && lot.nextBidLakh !== null
                ? `Bid ${formatLakh(lot.nextBidLakh)}`
                : "Bid unavailable"}
            </button>
            <p className="mt-2 text-center text-[0.7rem]">
              {lot.userBidBlockedReason ? (
                <span className="text-faint">{lot.userBidBlockedReason}</span>
              ) : (
                <span className="text-faint">
                  Exact next increment · press <kbd className="num-pill">B</kbd> to bid
                </span>
              )}
            </p>
          </div>
        )}

        {lot.bids.length > 0 && (
          <BidLadder
            bids={lot.bids}
            teams={teams}
            basePriceLakh={lot.basePriceLakh}
            userTeamId={userTeamId}
          />
        )}

        {resolved && (
          <div
            className={cn(
              "mt-4 rounded-xl border px-4 py-3",
              isUserSale
                ? "border-success/30 bg-success/5"
                : lot.status === "unsold"
                  ? "border-line bg-surface2/40"
                  : "border-line bg-surface2/40",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-bold uppercase tracking-wide">
                  {lotHeadline(lot, userTeamId)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {lot.status === "unsold"
                    ? "No franchise bid at the base price. The lot is unsold and no purse is charged."
                    : `${lot.winningTeamName ?? "The winning franchise"} take the player at ${formatLakh(lot.finalPriceLakh)}.`}
                </p>
              </div>
              {isUserSale && <ShieldCheck size={22} className="text-success" />}
            </div>
            {actual && (
              <div className="mt-3 border-t border-line pt-3 text-[0.7rem] leading-relaxed text-faint">
                <span className="font-semibold uppercase tracking-[0.1em] text-muted">Actual 2026 result · </span>
                {actual.buyerTeamName ?? "Unsold"} at {formatLakh(actual.winningBidLakh)} (base{" "}
                {formatLakh(actual.basePriceLakh)}). Revealed only after the hammer.
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onNextLot} disabled={busy}>
                {running ? <FastForward size={14} /> : <ArrowRight size={14} />} Next lot
              </button>
              <span className="text-[0.65rem] text-faint">
                {running ? "The room advances automatically." : "Resume to run the next lot automatically."}
              </span>
            </div>
          </div>
        )}

        {lot.status === "rtm" && lot.rtmActions.prompt && (
          <div className="mt-4 rounded-xl border border-violet/30 bg-violet/5 px-4 py-3">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-violet">Right to Match</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{lot.rtmActions.prompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BidLadder({
  bids,
  teams,
  basePriceLakh,
  userTeamId,
}: {
  bids: SnapshotBid[];
  teams: SnapshotTeam[];
  basePriceLakh: number;
  userTeamId: string;
}) {
  const byId = new Map(teams.map((team) => [team.id, team]));
  const rows = bids
    .map((bid, index) => ({ bid, index, previous: index > 0 ? bids[index - 1].amountLakh : basePriceLakh }))
    .slice(-3)
    .reverse();
  const last = bids[bids.length - 1];
  const premium = last && basePriceLakh > 0 ? ((last.amountLakh / basePriceLakh - 1) * 100).toFixed(0) : "0";

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface2/30 p-3">
      <div className="flex items-center gap-2">
        <TrendingUp size={13} className="text-accent2" />
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-faint">Live bid ladder</p>
        <span className="ml-auto text-[0.58rem] uppercase tracking-[0.1em] text-faint">Last 3 bids</span>
      </div>
      <ol className="mt-2 space-y-0.5">
        {rows.map(({ bid, index, previous }) => {
          const team = byId.get(bid.teamId);
          const newest = index === bids.length - 1;
          return (
            <li
              key={bid.id}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                newest ? "bg-surface2" : "opacity-90",
              )}
            >
              <TeamBadge teamId={bid.teamId} size={16} />
              <span className={cn("min-w-0 truncate font-semibold", newest && "text-accent2")}>
                {team?.shortName ?? bid.teamId}
              </span>
              {bid.teamId === userTeamId && (
                <span className="text-[0.52rem] font-bold uppercase tracking-[0.1em] text-accent2">you</span>
              )}
              <span className="ml-auto num font-semibold">{formatLakh(bid.amountLakh)}</span>
              <span className="num w-12 text-right text-[0.62rem] text-faint">
                +{formatLakh(bid.amountLakh - previous, { compact: bid.amountLakh - previous < 100 })}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-[0.6rem] text-faint">
        <span>Opened at {formatLakh(basePriceLakh)}</span>
        <span>· {bids.length} bids in the book</span>
        <span>· {premium}% over base</span>
      </p>
    </div>
  );
}

function RtmPanel({
  lot,
  busy,
  onAction,
}: {
  lot: SnapshotLot;
  busy: boolean;
  onAction: (action: AuctionAction) => void;
}) {
  const actions = lot.rtmActions;
  const [raiseLakh, setRaiseLakh] = useState<number | null>(actions.minRaiseLakh);

  const hasControl =
    actions.canInvoke ||
    actions.canDeclineOriginal ||
    actions.canRaise ||
    actions.canHold ||
    actions.canMatch ||
    actions.canDeclineMatch;
  if (!hasControl) return null;

  const min = actions.minRaiseLakh;
  const max = actions.maxRaiseLakh;
  const validRaise =
    raiseLakh !== null && min !== null && raiseLakh >= min && raiseLakh % 5 === 0 && (max === null || raiseLakh <= max);
  const presets = min === null ? [] : [...new Set([min, min + 5, min + 10, max].filter((value): value is number => value !== null && value >= min && (max === null || value <= max)))];

  return (
    <div className="surface-card overflow-hidden border-violet/40">
      <div className="flex items-center gap-2 border-b border-violet/20 bg-violet/10 px-5 py-3">
        <RotateCcw size={16} className="text-violet" />
        <p className="font-display text-sm font-bold uppercase tracking-[0.12em] text-violet">Your RTM decision</p>
      </div>
      <div className="p-5">
        {actions.canInvoke && (
          <>
            <p className="text-sm leading-relaxed text-muted">{actions.prompt}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => onAction({ type: "rtm_invoke" })} disabled={busy}>
                <ShieldCheck size={16} /> Invoke Right to Match
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onAction({ type: "rtm_decline" })} disabled={busy}>
                Decline
              </button>
            </div>
          </>
        )}

        {(actions.canRaise || actions.canHold) && (
          <>
            <p className="text-sm leading-relaxed text-muted">{actions.prompt}</p>
            {actions.canRaise && min !== null && (
              <div className="mt-4">
                <label htmlFor={`raise-${lot.id}`} className="field-label">
                  Final offer (₹ lakh)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id={`raise-${lot.id}`}
                    type="number"
                    className="input max-w-[11rem]"
                    min={min}
                    max={max ?? undefined}
                    step={5}
                    value={raiseLakh ?? ""}
                    onChange={(event) => setRaiseLakh(event.target.value === "" ? null : Number(event.target.value))}
                  />
                  <span className="num text-sm font-semibold text-accent2">
                    {raiseLakh !== null ? formatLakh(raiseLakh) : "—"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {presets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRaiseLakh(preset)}
                      className={cn("chip transition-colors", raiseLakh === preset && "chip-accent")}
                    >
                      {formatLakh(preset)}
                    </button>
                  ))}
                </div>
                {!validRaise && (
                  <p className="mt-2 text-[0.68rem] text-danger">
                    Enter a whole multiple of ₹5 lakh between {formatLakh(min)} and {max !== null ? formatLakh(max) : "your purse limit"}.
                  </p>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {actions.canRaise && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onAction({ type: "rtm_raise", amountLakh: raiseLakh })}
                  disabled={busy || !validRaise}
                >
                  Raise final offer
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => onAction({ type: "rtm_hold" })} disabled={busy}>
                Hold current offer
              </button>
            </div>
            <p className="mt-3 text-[0.65rem] leading-relaxed text-faint">
              Raising binds you to the new price if the original franchise declines or cannot match. A
              hold leaves your existing bid unchanged.
            </p>
          </>
        )}

        {(actions.canMatch || actions.canDeclineMatch) && (
          <>
            <p className="text-sm leading-relaxed text-muted">{actions.prompt}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {actions.canMatch && (
                <button type="button" className="btn btn-primary" onClick={() => onAction({ type: "rtm_match" })} disabled={busy}>
                  <ShieldCheck size={16} /> Match {formatLakh(lot.revisedPriceLakh ?? lot.currentBidLakh)}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onAction({ type: "rtm_decline_match" })}
                disabled={busy}
              >
                Decline match
              </button>
            </div>
            <p className="mt-3 text-[0.65rem] leading-relaxed text-faint">
              Matching spends one RTM card and charges the revised price against your purse.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SquadPanel({ snapshot }: { snapshot: AuctionSnapshot }) {
  const squad = [...snapshot.userSquad].sort((a, b) => b.priceLakh - a.priceLakh);
  const team = snapshot.userTeam;
  if (!team) {
    return <p className="px-5 py-8 text-sm text-muted">You are not managing a franchise in this room.</p>;
  }
  if (squad.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <Users size={24} className="mx-auto text-faint" />
        <p className="mt-3 font-display text-lg font-semibold uppercase tracking-wide text-muted">Empty squad</p>
        <p className="mt-1 text-xs leading-relaxed text-faint">
          Win a lot and the player lands here instantly, with the exact price charged to your purse.
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-[0.65rem] text-faint">
        {Object.entries(team.roleCounts).map(([role, count]) =>
          count > 0 ? (
            <span key={role} className="chip">
              {role === "allRounder" ? "AR" : role === "wicketkeeper" ? "WK" : role === "batter" ? "BAT" : role === "bowler" ? "BOWL" : "?"} {count}
            </span>
          ) : null,
        )}
        <span className="chip chip-gold">{team.overseasCount} overseas</span>
      </div>
      <ul className="max-h-[24rem] divide-y divide-line overflow-y-auto scrollbar-thin">
        {squad.map((player) => (
          <SquadRow key={player.playerId} player={player} />
        ))}
      </ul>
    </div>
  );
}

function SquadRow({
  player,
  teamId = null,
}: {
  player: SnapshotSquadPlayer;
  teamId?: string | null;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <PlayerAvatar name={player.name} teamId={teamId} size="sm" />
      <div className="min-w-0 flex-1">
        <Link href={`/players/${player.playerId}`} className="block truncate text-sm font-medium hover:text-accent2">
          {player.name}
        </Link>
        <p className="mt-0.5 flex items-center gap-1.5 text-[0.62rem] text-faint">
          <span>{player.role === "all-rounder" ? "All-rounder" : player.role === "wicketkeeper" ? "Wicketkeeper" : player.role}</span>
          {player.isOverseas && <span className="text-[0.58rem] uppercase tracking-[0.08em] text-info">OS</span>}
          {player.retained ? (
            <span className="text-[0.58rem] uppercase tracking-[0.08em] text-gold">Retained</span>
          ) : player.acquiredVia === "rtm" ? (
            <span className="text-[0.58rem] uppercase tracking-[0.08em] text-accent2">RTM</span>
          ) : (
            <span className="text-[0.58rem] uppercase tracking-[0.08em] text-success">Signed</span>
          )}
        </p>
      </div>
      <span className="num text-sm font-semibold">{formatLakh(player.priceLakh)}</span>
    </li>
  );
}

type TeamSquadPayload = {
  teamId: string;
  teamName: string;
  shortName: string;
  players: SnapshotSquadPlayer[];
};

function TeamsBoard({
  teams,
  userTeamId,
  sessionId,
}: {
  teams: SnapshotTeam[];
  userTeamId: string;
  sessionId: string;
}) {
  const sorted = [...teams].sort((a, b) => b.squadSize - a.squadSize || a.shortName.localeCompare(b.shortName));
  const [openTeam, setOpenTeam] = useState<SnapshotTeam | null>(null);
  const [squad, setSquad] = useState<TeamSquadPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpenTeam(null);
    setSquad(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!openTeam) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTeam, close]);

  const openSquad = useCallback(
    async (team: SnapshotTeam) => {
      setOpenTeam(team);
      setSquad(null);
      setError(null);
      setLoading(true);
      try {
        const response = await fetch(`/api/sessions/${sessionId}/squads/${team.id}`, { cache: "no-store" });
        const payload = (await response.json()) as TeamSquadPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "The squad could not be loaded.");
        setSquad(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "The squad could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  const retained = squad?.players.filter((player) => player.retained) ?? [];
  const signed = squad?.players.filter((player) => !player.retained) ?? [];

  return (
    <>
      <ul className="max-h-[480px] divide-y divide-line overflow-y-auto scrollbar-thin">
        {sorted.map((team) => {
          return (
            <li key={team.id} className={cn(team.id === userTeamId && "bg-accent/5")}>
              <button
                type="button"
                onClick={() => void openSquad(team)}
                className="w-full px-4 py-3 text-left transition-colors hover:bg-surface2/60 focus-visible:bg-surface2/60 focus-visible:outline-none"
                aria-label={`View ${team.name} squad: ${team.squadSize} players`}
              >
                <div className="flex items-center gap-2.5">
                  <TeamBadge teamId={team.id} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{team.shortName}</span>
                      {team.id === userTeamId && <span className="chip chip-accent">You</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[0.6rem] text-faint">
                      <span>
                        {team.squadSize} players · {team.overseasCount} OS
                      </span>
                      <span>·</span>
                      <span className="truncate">
                        {team.isHuman
                          ? `${team.managerName ?? "Human manager"}${team.managerOnline ? "" : " · away"}`
                          : team.aiProfileLabel}
                      </span>
                      <span className="ml-auto shrink-0 text-accent2">View squad</span>
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {openTeam && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${openTeam.name} squad`}
            className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-bg shadow-2xl sm:max-w-xl sm:rounded-2xl"
          >
            <div className="flex items-start gap-3 border-b border-line px-4 py-4">
              <TeamBadge teamId={openTeam.id} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold uppercase leading-tight tracking-wide">
                  {openTeam.name}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.65rem] text-muted">
                  {openTeam.isHuman ? (
                    <>
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          openTeam.managerOnline ? "bg-success" : "bg-gold",
                        )}
                      />
                      <span className="truncate">
                        Managed by <strong className="text-fg">{openTeam.managerName ?? "a human manager"}</strong>
                        {openTeam.managerOnline ? "" : " · away"}
                      </span>
                    </>
                  ) : (
                    <span className="truncate">AI manager · {openTeam.aiProfileLabel}</span>
                  )}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="chip">{openTeam.squadSize} players</span>
                  <span className="chip chip-gold">{openTeam.overseasCount} overseas</span>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="btn btn-ghost btn-sm shrink-0"
                aria-label="Close squad panel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {loading && (
                <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted">
                  <Loader2 size={16} className="animate-spin" /> Loading squad…
                </div>
              )}
              {error && !loading && (
                <p className="px-4 py-8 text-center text-sm text-danger">{error}</p>
              )}
              {squad && !loading && !error && squad.players.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <Users size={22} className="mx-auto text-faint" />
                  <p className="mt-2 text-sm text-muted">No players signed or retained yet.</p>
                </div>
              )}
              {squad && !loading && !error && squad.players.length > 0 && (
                <div>
                  <div className="flex items-center justify-between border-b border-line bg-surface2/40 px-4 py-2">
                    <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-gold">
                      Retained · {retained.length}
                    </p>
                    <p className="num text-[0.65rem] text-faint">
                      {formatLakh(retained.reduce((sum, player) => sum + player.priceLakh, 0))}
                    </p>
                  </div>
                  {retained.length > 0 ? (
                    <ul className="divide-y divide-line">
                      {retained.map((player) => (
                        <SquadRow key={player.playerId} player={player} teamId={openTeam.id} />
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-3 text-xs text-faint">No retained players in this room.</p>
                  )}

                  <div className="flex items-center justify-between border-y border-line bg-surface2/40 px-4 py-2">
                    <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-success">
                      Signed at auction · {signed.length}
                    </p>
                    <p className="num text-[0.65rem] text-faint">
                      {formatLakh(signed.reduce((sum, player) => sum + player.priceLakh, 0))}
                    </p>
                  </div>
                  {signed.length > 0 ? (
                    <ul className="divide-y divide-line">
                      {signed.map((player) => (
                        <SquadRow key={player.playerId} player={player} teamId={openTeam.id} />
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-3 text-xs text-faint">No auction buys yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FloatingPurse({
  teams,
  cap,
  userTeam,
  userTeamId,
  squadMax,
  overseasMax,
}: {
  teams: SnapshotTeam[];
  cap: number;
  userTeam: AuctionSnapshot["userTeam"];
  userTeamId: string | null;
  squadMax: number;
  overseasMax: number;
}) {
  const [open, setOpen] = useState(false);
  const ordered = [...teams].sort((a, b) => b.purseLakh - a.purseLakh);
  const slots = userTeam ? Math.max(0, squadMax - userTeam.squadSize) : 0;
  const perSlot = userTeam && slots > 0 ? Math.floor(userTeam.purseLakh / slots) : userTeam?.purseLakh ?? 0;

  return (
    <div className="fixed bottom-4 left-4 z-40 sm:bottom-6 sm:left-6">
      {open && (
        <div className="mb-2 w-[min(92vw,350px)] overflow-hidden rounded-2xl border border-line bg-bg/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-[0.12em]">Finances</p>
              <p className="text-[0.58rem] text-faint">Purse · squad slots · room board</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setOpen(false)}
              aria-label="Close finances"
            >
              <X size={15} />
            </button>
          </div>

          {userTeam && (
            <div className="grid grid-cols-3 gap-px border-b border-line bg-line text-center">
              <div className="bg-bg px-2 py-3">
                <p className="text-[0.52rem] font-semibold uppercase tracking-[0.1em] text-faint">Purse left</p>
                <p className="num mt-1 text-sm font-semibold text-accent2">{formatLakh(userTeam.purseLakh)}</p>
              </div>
              <div className="bg-bg px-2 py-3">
                <p className="text-[0.52rem] font-semibold uppercase tracking-[0.1em] text-faint">Max bid</p>
                <p className="num mt-1 text-sm font-semibold">{formatLakh(userTeam.maxBidLakh ?? 0)}</p>
              </div>
              <div className="bg-bg px-2 py-3">
                <p className="text-[0.52rem] font-semibold uppercase tracking-[0.1em] text-faint">Per slot</p>
                <p className="num mt-1 text-sm font-semibold">{formatLakh(perSlot)}</p>
              </div>
            </div>
          )}

          <div className="max-h-[46vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between px-4 pt-3">
              <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-faint">Purse board</p>
              <span className="text-[0.55rem] text-faint">
                {userTeam ? `${slots} slots · ${Math.max(0, overseasMax - userTeam.overseasCount)} OS` : "All franchises"}
              </span>
            </div>
            <div className="space-y-2.5 px-4 py-3">
              {ordered.map((team) => {
                const percent = cap > 0 ? Math.max(0, Math.min(100, (team.purseLakh / cap) * 100)) : 0;
                return (
                  <div
                    key={team.id}
                    className={cn(
                      "rounded-lg px-2 py-1.5",
                      team.id === userTeamId ? "bg-accent/8" : "bg-surface2/40",
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-[0.65rem]">
                      <TeamBadge teamId={team.id} size={15} />
                      <span className="truncate font-semibold">{team.shortName}</span>
                      {team.isHuman ? (
                        <Users size={9} className="text-accent2" aria-label="Human manager" />
                      ) : (
                        <Bot size={9} className="text-faint" aria-label="AI manager" />
                      )}
                      <span className="num ml-auto font-semibold">{formatLakh(team.purseLakh, { compact: true })}</span>
                    </div>
                    <div className="progress-track mt-1 h-1">
                      <div className="h-full rounded-full" style={{ width: `${percent}%`, background: team.primary }} />
                    </div>
                    <p className="mt-0.5 truncate text-[0.52rem] text-faint">
                      {team.squadSize} squad · {team.overseasCount} OS · {team.aiProfileLabel}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-11 items-center gap-2 rounded-full border px-3.5 shadow-lg transition-colors",
          open
            ? "border-accent/50 bg-accent text-black"
            : "border-line bg-bg/90 text-muted backdrop-blur-xl hover:text-fg",
        )}
        aria-expanded={open}
        aria-label={open ? "Hide finances" : "Show finances"}
      >
        <MoreHorizontal size={18} />
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
          {userTeam ? formatLakh(userTeam.purseLakh, { compact: true }) : "Finances"}
        </span>
      </button>
    </div>
  );
}

function SquadPlan({
  team,
  squadMax,
  overseasMax,
}: {
  team: SnapshotTeam;
  squadMax: number;
  overseasMax: number;
}) {
  const slots = Math.max(0, squadMax - team.squadSize);
  const overseasSlots = Math.max(0, overseasMax - team.overseasCount);
  const targets = [
    {
      key: "batter",
      label: "Batters",
      count: team.roleCounts.batter,
      target: Math.max(1, Math.round(squadMax * 0.32)),
      color: "var(--info)",
    },
    {
      key: "allRounder",
      label: "All-rounders",
      count: team.roleCounts.allRounder,
      target: Math.max(1, Math.round(squadMax * 0.18)),
      color: "var(--success)",
    },
    {
      key: "bowler",
      label: "Bowlers",
      count: team.roleCounts.bowler,
      target: Math.max(1, Math.round(squadMax * 0.36)),
      color: "var(--danger)",
    },
    {
      key: "wicketkeeper",
      label: "Keepers",
      count: team.roleCounts.wicketkeeper,
      target: Math.max(1, Math.round(squadMax * 0.14)),
      color: "var(--gold)",
    },
  ] as const;

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-accent2" />
          <p className="font-display text-sm font-bold uppercase tracking-[0.12em]">Squad plan</p>
        </div>
        <span className="chip chip-compact">{slots} slots left</span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <p className="text-[0.52rem] font-semibold uppercase tracking-[0.1em] text-faint">Open slots</p>
            <p className="num mt-1 text-sm font-semibold">{slots}</p>
          </div>
          <div>
            <p className="text-[0.52rem] font-semibold uppercase tracking-[0.1em] text-faint">Overseas open</p>
            <p className="num mt-1 text-sm font-semibold">{overseasSlots}</p>
          </div>
        </div>
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {targets.map((target) => {
            const percent = Math.min(100, (target.count / target.target) * 100);
            const short = target.count < target.target;
            return (
              <div key={target.key}>
                <div className="flex items-baseline justify-between gap-2 text-[0.65rem]">
                  <span className={short ? "text-muted" : "text-fg"}>{target.label}</span>
                  <span className={cn("num font-semibold", short ? "text-gold" : "text-muted")}>
                    {target.count}
                    <span className="text-faint"> / {target.target}</span>
                  </span>
                </div>
                <div className="progress-track mt-1 h-1">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${percent}%`, background: target.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FinishPanel({ snapshot }: { snapshot: AuctionSnapshot }) {
  const team = snapshot.userTeam;
  const squad = [...snapshot.userSquad].sort((a, b) => b.priceLakh - a.priceLakh);
  const shortfall = snapshot.session.rulebook.squadMin - snapshot.userSquad.length;
  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-line bg-gradient-to-r from-accent/10 to-transparent px-5 py-6">
        <p className="eyebrow">Auction complete</p>
        <h2 className="mt-2 font-display text-3xl font-bold uppercase leading-none tracking-wide">
          The room is closed
        </h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
          {team
            ? `${team.name} finished with ${snapshot.userSquad.length} players and ${formatLakh(team.purseLakh)} left in the purse.`
            : "All lots have been resolved."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
        <StatBlock label="Squad" value={snapshot.userSquad.length} hint={`Minimum ${snapshot.session.rulebook.squadMin}`} />
        <StatBlock label="Spent" value={formatLakh(team?.spentLakh ?? 0)} />
        <StatBlock label="Purse left" value={formatLakh(team?.purseLakh ?? 0)} />
        <StatBlock label="Overseas" value={team?.overseasCount ?? 0} hint={`Max ${snapshot.session.rulebook.overseasMax}`} />
      </div>
      {shortfall > 0 && (
        <div className="mx-5 mb-4 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-gold">Squad shortfall: </span>
          {shortfall} below the {snapshot.session.rulebook.squadMin}-player minimum. The lot pool was
          exhausted before the minimum could be met; this is recorded honestly rather than padded with
          fictional players.
        </div>
      )}
      <div className="px-5 pb-5">
        <div className="flex flex-wrap gap-2">
          <Link href={`/auction/${snapshot.session.id}/season`} className="btn btn-primary">
            <Trophy size={16} /> Start the season
          </Link>
          <Link href={`/auction/${snapshot.session.id}/recap`} className="btn btn-ghost">
            Full auction recap
          </Link>
          <Link href={`/api/sessions/${snapshot.session.id}/export?type=results`} className="btn btn-ghost">
            <Download size={15} /> Results CSV
          </Link>
          <Link href="/auction" className="btn btn-outline">
            Start another room
          </Link>
        </div>
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">Final squad</p>
          <ul className="mt-2 divide-y divide-line">
            {squad.map((player) => (
              <SquadRow key={player.playerId} player={player} />
            ))}
          </ul>
          {squad.length === 0 && <p className="py-4 text-xs text-faint">No players were purchased.</p>}
        </div>
      </div>
    </div>
  );
}
