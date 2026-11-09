"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  CircleDot,
  FastForward,
  Flame,
  Gauge,
  Loader2,
  Pause,
  Play,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Sparkles,
  Star,
  Swords,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  Wand2,
  Zap,
} from "lucide-react";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import {
  fetchMatchCentre,
  fetchSeasonSnapshot,
  formatLongSeasonDate,
  postMatchAction,
} from "@/components/season/api";
import { loadSeat } from "@/lib/auction/seat-storage";
import type {
  InningsSummary,
  MatchCommentary,
  MatchControl,
  MatchScorecard,
  MatchState,
  SeasonFixtureSummary,
  SeasonSnapshot,
  SeasonTeamSummary,
} from "@/lib/season/types";
import { cn } from "@/lib/cn";

type TabId = "live" | "map" | "momentum" | "scorecard" | "commentary" | "replay";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "live", label: "Match centre" },
  { id: "map", label: "Innings map" },
  { id: "momentum", label: "Momentum" },
  { id: "scorecard", label: "Scorecard" },
  { id: "commentary", label: "Commentary" },
  { id: "replay", label: "Replay" },
];

const AUTO_SPEEDS = [0.5, 1, 2] as const;

export function MatchCentre({
  initialSnapshot,
  initialScorecard,
  fixtureId,
}: {
  initialSnapshot: SeasonSnapshot;
  initialScorecard: MatchScorecard | null;
  fixtureId: string;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [scorecard, setScorecard] = useState(initialScorecard);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(1);
  const [tab, setTab] = useState<TabId>("live");
  const [seatToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : (loadSeat(initialSnapshot.season.sessionId)?.token ?? null),
  );
  const busyRef = useRef(false);
  const autoRef = useRef(false);
  const sessionId = snapshot.season.sessionId;
  const fixture = snapshot.fixtures.find((entry) => entry.id === fixtureId);
  const home = snapshot.teams.find((team) => team.id === fixture?.homeTeamId);
  const away = snapshot.teams.find((team) => team.id === fixture?.awayTeamId);
  const isUserMatch = fixture?.isUserMatch ?? false;
  const phase = scorecard?.state.phase ?? null;
  const complete = fixture?.status === "completed" || phase === "complete";
  const live = fixture?.status === "live" && !complete;
  const current = scorecard ? currentInnings(scorecard) : null;
  const currentState =
    scorecard && scorecard.state.innings.length > 0
      ? scorecard.state.innings[scorecard.state.innings.length - 1]
      : null;
  const humanMatch = scorecard?.control?.humanMatch ?? fixture?.isHumanMatch ?? false;
  const viewerTeamId = snapshot.viewer.teamId;
  const canControl =
    isUserMatch && snapshot.season.status === "active" && snapshot.viewer.canAct;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!humanMatch || complete || live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [humanMatch, complete, live]);
  const readyDeadlineMs = fixture?.readyDeadline ? Date.parse(fixture.readyDeadline) : null;
  const readySecondsLeft =
    readyDeadlineMs !== null && Number.isFinite(readyDeadlineMs)
      ? Math.max(0, Math.ceil((readyDeadlineMs - now) / 1000))
      : null;

  const runAction = useCallback(
    async (
      action: Parameters<typeof postMatchAction>[1],
      key: string,
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(key);
      setError(null);
      try {
        const result = await postMatchAction(sessionId, action, seatToken);
        setSnapshot(result.snapshot);
        if (result.scorecard) {
          setScorecard(result.scorecard);
          if (result.scorecard.state.phase === "complete") setAuto(false);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The match action could not be applied.");
        setAuto(false);
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [sessionId, seatToken],
  );

  useEffect(() => {
    if (!seatToken) return;
    let cancelled = false;
    void fetchSeasonSnapshot(sessionId, seatToken)
      .then((next) => {
        if (!cancelled && next) setSnapshot(next);
      })
      .catch(() => {
        // The server snapshot remains usable if the refresh fails.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, seatToken]);

  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);

  // Keep a head-to-head room in sync: the opponent's ready flag and their over
  // have to appear without a manual refresh. The ready check also arms the
  // 100-second clock, and starts the match with AI cover when it expires.
  useEffect(() => {
    if (!seatToken || !humanMatch || complete) return;
    let cancelled = false;
    const sync = () => {
      if (busyRef.current || document.hidden) return;
      if (live || fixture?.hasState) {
        void fetchMatchCentre(sessionId, fixtureId, seatToken)
          .then((result) => {
            if (cancelled) return;
            setSnapshot(result.snapshot);
            setScorecard(result.scorecard);
          })
          .catch(() => undefined);
      } else {
        void postMatchAction(sessionId, { type: "ready-check", fixtureId }, seatToken)
          .then((result) => {
            if (cancelled) return;
            setSnapshot(result.snapshot);
            if (result.scorecard) setScorecard(result.scorecard);
          })
          .catch(() => undefined);
      }
    };
    sync();
    const timer = window.setInterval(sync, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [seatToken, humanMatch, complete, live, fixture?.hasState, sessionId, fixtureId]);

  useEffect(() => {
    if (!auto) return;
    if (!live || complete || busy !== null || humanMatch) return;
    const timer = window.setTimeout(() => {
      if (!autoRef.current) return;
      void runAction({ type: "simulate", fixtureId, amount: "ball" }, "auto");
    }, Math.round(1350 / autoSpeed));
    return () => window.clearTimeout(timer);
  }, [auto, autoSpeed, live, complete, busy, scorecard, runAction, fixtureId, humanMatch]);

  // Single-player matches can be played from the keyboard. Head-to-head
  // fixtures stay on the over-by-over buttons because both managers act.
  useEffect(() => {
    if (!live || complete || humanMatch) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (event.key === " ") {
        if (event.repeat) return;
        if (target?.closest("button, a, [role='button']")) return;
        event.preventDefault();
        if (busyRef.current) return;
        void runAction({ type: "simulate", fixtureId, amount: "ball" }, "ball");
        return;
      }
      if (key === "a") {
        event.preventDefault();
        setAuto((value) => !value);
        return;
      }
      if (key === "o") {
        event.preventDefault();
        if (busyRef.current) return;
        void runAction({ type: "simulate", fixtureId, amount: "over" }, "over");
        return;
      }
      if (key === "i") {
        event.preventDefault();
        if (busyRef.current) return;
        void runAction({ type: "simulate", fixtureId, amount: "innings" }, "innings");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [live, complete, humanMatch, fixtureId, runAction]);

  const nextUser = snapshot.nextUserFixture;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/auction/${sessionId}/season`} className="link-arrow text-muted hover:text-fg">
          <ArrowLeft size={14} /> Back to season
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/auction/${sessionId}/season/squad`} className="btn btn-ghost btn-sm">
            <Users size={14} /> XI &amp; tactics
          </Link>
          <span className="chip">{snapshot.progress.stageLabel}</span>
        </div>
      </div>

      <MatchHero
        fixture={fixture}
        home={home}
        away={away}
        scorecard={scorecard}
        snapshot={snapshot}
        readySecondsLeft={readySecondsLeft}
      />

      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {!isUserMatch && !complete && fixture && (
        <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-sm text-muted">
          <Sparkles size={17} className="mt-0.5 shrink-0 text-info" />
          <p>
            This is an AI-controlled fixture. You can watch the scorecard once it is played from the
            season hub.
          </p>
        </div>
      )}

      {!fixture?.homeTeamId || !fixture.awayTeamId ? (
        <section className="panel px-6 py-12 text-center">
          <p className="font-display text-2xl font-bold uppercase">Awaiting the bracket</p>
          <p className="mt-2 text-sm text-muted">
            This playoff fixture will be filled when the preceding matches are complete.
          </p>
          <Link href={`/auction/${sessionId}/season`} className="btn btn-outline mt-5">
            Return to the season <ArrowRight size={15} />
          </Link>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.48fr_0.52fr]">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap gap-1.5 rounded-2xl border border-line bg-surface/60 p-2">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
                    tab === entry.id ? "bg-accent text-accentInk" : "text-muted hover:bg-surface2 hover:text-fg",
                  )}
                  aria-pressed={tab === entry.id}
                >
                  {entry.id === "live" ? (
                    <CircleDot size={15} />
                  ) : entry.id === "map" ? (
                    <BarChart3 size={15} />
                  ) : entry.id === "momentum" ? (
                    <Flame size={15} />
                  ) : entry.id === "scorecard" ? (
                    <Swords size={15} />
                  ) : entry.id === "replay" ? (
                    <FastForward size={15} />
                  ) : (
                    <Zap size={15} />
                  )}
                  {entry.label}
                  {entry.id === "live" && live && <span className="live-dot" />}
                  {entry.id === "commentary" && scorecard && scorecard.commentary.length > 0 && (
                    <span className="num rounded-md bg-black/15 px-1.5 py-px text-[0.6rem] font-bold">
                      {scorecard.commentary.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab === "live" && (
              <LivePanel
                scorecard={scorecard}
                snapshot={snapshot}
                current={current}
                currentState={currentState}
                complete={complete}
                live={live}
                home={home}
                away={away}
              />
            )}
            {tab === "scorecard" && <ScorecardPanel scorecard={scorecard} snapshot={snapshot} />}
            {tab === "map" &&
              (scorecard ? (
                <RunWormCard
                  commentary={scorecard.commentary}
                  innings={scorecard.innings}
                  teams={snapshot.teams}
                  compact
                />
              ) : (
                <EmptyTab label="The innings map opens after the first over is logged." />
              ))}
            {tab === "momentum" &&
              (scorecard ? (
                <MomentumCard
                  commentary={scorecard.commentary}
                  inningsNumber={current?.number ?? null}
                  phase={complete ? "Final" : currentState ? overPhase(currentState.overNumber) : null}
                  compact
                />
              ) : (
                <EmptyTab label="Momentum builds from the first over." />
              ))}
            {tab === "commentary" && <CommentaryPanel scorecard={scorecard} />}
            {tab === "replay" && <ReplayPanel scorecard={scorecard} snapshot={snapshot} />}
          </div>

          <aside className="min-w-0 space-y-4">
            <ControlPanel
              fixture={fixture}
              snapshot={snapshot}
              isUserMatch={isUserMatch}
              canControl={canControl}
              complete={complete}
              live={live}
              auto={auto}
              autoSpeed={autoSpeed}
              setAutoSpeed={setAutoSpeed}
              busy={busy}
              control={scorecard?.control ?? null}
              humanMatch={humanMatch}
              viewerTeamId={viewerTeamId}
              setAuto={setAuto}
              runAction={runAction}
              readySecondsLeft={readySecondsLeft}
            />
            {nextUser && nextUser.id !== fixture.id && (
              <Link
                href={`/auction/${sessionId}/season/match/${nextUser.id}`}
                className="panel block p-4 transition hover:border-accent/40"
              >
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">Next up</p>
                <p className="mt-2 font-display text-lg font-bold uppercase leading-none">
                  {nextUser.homeTeamShort} vs {nextUser.awayTeamShort}
                </p>
                <p className="mt-2 text-xs text-muted">{formatLongSeasonDate(nextUser.date)}</p>
                <span className="link-arrow mt-3 inline-flex">
                  Preview the fixture <ArrowRight size={13} />
                </span>
              </Link>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function MatchHero({
  fixture,
  home,
  away,
  scorecard,
  snapshot,
  readySecondsLeft,
}: {
  fixture: SeasonFixtureSummary | undefined;
  home: SeasonTeamSummary | undefined;
  away: SeasonTeamSummary | undefined;
  scorecard: MatchScorecard | null;
  snapshot: SeasonSnapshot;
  readySecondsLeft: number | null;
}) {
  const result = scorecard?.result;
  const toss = scorecard?.state;
  const tossTeam = toss ? snapshot.teams.find((team) => team.id === toss.tossWinnerTeamId) : undefined;
  const innings = scorecard?.innings ?? [];
  const latest = innings.length > 0 ? innings[innings.length - 1] : null;
  const activeBattingId = toss?.phase === "live" ? latest?.battingTeamId ?? null : null;
  const statusLabel =
    fixture?.status === "completed" ? "Complete" : fixture?.status === "live" ? "Live" : "Scheduled";

  return (
    <header className="relative overflow-hidden rounded-[24px] border border-line bg-surface shadow-[var(--shadow)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(760px 300px at 8% -24%, ${home?.primary ?? "#ff7a1a"}2e, transparent 64%), radial-gradient(760px 300px at 92% -24%, ${away?.primary ?? "#5aa7ff"}26, transparent 64%)`,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
      />
      <div className="relative px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip chip-gold">
              {fixture?.stage === "league" ? `Match ${fixture.matchNumber}` : fixture?.stage ?? "Season fixture"}
            </span>
            {fixture?.isUserMatch && <span className="chip chip-accent">Your franchise</span>}
            {fixture?.isHumanMatch && <span className="chip chip-gold">Head-to-head</span>}
          </div>
          <span
            className={cn(
              "chip",
              fixture?.status === "completed"
                ? "chip-success"
                : fixture?.status === "live"
                  ? "chip-accent"
                  : "chip-info",
            )}
          >
            {fixture?.status === "live" && !result && <span className="live-dot" />}
            {statusLabel}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <HeroTeam
            team={home}
            score={fixture?.homeScore}
            winner={fixture?.winnerTeamId === home?.id}
            batting={activeBattingId === home?.id}
            align="left"
          />
          <div className="text-center">
            <p className="font-display text-[0.62rem] font-bold uppercase tracking-[0.24em] text-faint">vs</p>
            {toss ? (
              <p className="mt-2 max-w-[10rem] text-[0.6rem] leading-snug text-faint">
                {tossTeam?.shortName ?? "Toss"} chose to {toss.tossDecision}
              </p>
            ) : (
              <p className="mt-2 text-[0.6rem] text-faint">Toss pending</p>
            )}
          </div>
          <HeroTeam
            team={away}
            score={fixture?.awayScore}
            winner={fixture?.winnerTeamId === away?.id}
            batting={activeBattingId === away?.id}
            align="right"
          />
        </div>

        {innings.length > 0 && (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {innings.map((entry) => (
              <HeroInningsStrip
                key={entry.number}
                innings={entry}
                team={snapshot.teams.find((team) => team.id === entry.battingTeamId)}
                active={latest?.number === entry.number && toss?.phase !== "complete"}
              />
            ))}
          </div>
        )}

        {(result || fixture?.resultSummary) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
            <p className="text-sm font-semibold text-success">{result?.summary ?? fixture?.resultSummary}</p>
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] text-muted">
              <span className="chip chip-success">{result?.method === "super-over" ? "Super over" : "Result"}</span>
              {fixture?.playerOfMatchName && (
                <span className="inline-flex items-center gap-1.5">
                  <Star size={11} className="text-gold" /> {fixture.playerOfMatchName}
                </span>
              )}
            </div>
          </div>
        )}

        {fixture?.isHumanMatch && fixture.status !== "completed" && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={cn("chip", fixture.homeReady ? "chip-success" : "chip-info")}>
              {fixture.homeTeamShort ?? "Home"}: {fixture.homeReady ? "ready" : "waiting"}
            </span>
            <span className={cn("chip", fixture.awayReady ? "chip-success" : "chip-info")}>
              {fixture.awayTeamShort ?? "Away"}: {fixture.awayReady ? "ready" : "waiting"}
            </span>
            {readySecondsLeft !== null && (
              <span
                className={cn(
                  "num inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.62rem] font-bold",
                  readySecondsLeft <= 20
                    ? "border-danger/40 bg-danger/10 text-danger"
                    : "border-line bg-surface2/70 text-muted",
                )}
                title="When this reaches zero the AI takes over any manager who has not confirmed."
              >
                <Timer size={11} />
                {formatCountdown(readySecondsLeft)}
              </span>
            )}
            <span className="text-[0.62rem] text-faint">
              {fixture.status === "live"
                ? "Head-to-head play advances one over at a time. Each manager controls only their own XI."
                : "The toss is generated once both managers confirm, or automatically when the timer runs out."}
            </span>
          </div>
        )}

        {fixture?.status === "scheduled" && (
          <p className="mt-4 rounded-xl border border-line bg-bg2/60 px-4 py-3 text-xs leading-relaxed text-muted">
            {fixture.isHumanMatch
              ? scorecard
                ? "Both managers are ready — the match is being prepared."
                : "This is a head-to-head fixture. Both managers must mark ready before the toss; after that the match advances one over at a time."
              : scorecard
                ? "The match is ready to continue."
                : "The match has not started. Start it to generate the toss, both XIs and the first ball."}
          </p>
        )}
      </div>
    </header>
  );
}

function HeroTeam({
  team,
  score,
  winner,
  batting,
  align,
}: {
  team: SeasonTeamSummary | undefined;
  score: string | null | undefined;
  winner: boolean;
  batting: boolean;
  align: "left" | "right";
}) {
  return (
    <div className={cn("min-w-0", align === "right" ? "text-right" : "text-left")}>
      <div className={cn("flex items-center gap-3", align === "right" && "flex-row-reverse")}>
        {team ? <TeamBadge teamId={team.id} size={46} /> : <span className="h-11 w-11 rounded-full border border-line" />}
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-1.5 text-[0.6rem] uppercase tracking-[0.12em] text-faint">
            <span>{team?.shortName ?? "TBD"}</span>
            {team?.playingXiOvr != null && (
              <span className="chip chip-compact normal-case tracking-normal">XI OVR {team.playingXiOvr}</span>
            )}
          </p>
          <p className="truncate font-display text-[clamp(1.2rem,3vw,1.9rem)] font-bold uppercase leading-none">
            {team?.name ?? "Awaiting"}
          </p>
        </div>
      </div>
      <p className={cn("num mt-2 font-display text-[clamp(1.7rem,5vw,2.6rem)] font-bold leading-none tabular-nums", winner && "text-success")}>
        {score ?? "—"}
      </p>
      {batting && (
        <div className={cn("mt-1.5 flex flex-wrap items-center gap-2", align === "right" && "justify-end")}>
          <span className="chip chip-accent chip-compact">
            <span className="live-dot" /> Batting
          </span>
        </div>
      )}
    </div>
  );
}

function HeroInningsStrip({
  innings,
  team,
  active,
}: {
  innings: InningsSummary;
  team: SeasonTeamSummary | undefined;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
        active ? "border-accent/40 bg-accent/[0.05]" : "border-line bg-bg2/50",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="h-7 w-1 shrink-0 rounded-full"
          style={{ background: team?.primary ?? "var(--accent)" }}
        />
        <span className="min-w-0">
          <span className="block text-[0.56rem] uppercase tracking-[0.12em] text-faint">
            {innings.superOver ? "Super over" : `Innings ${innings.number}`}
            {team?.shortName ? ` · ${team.shortName}` : ""}
          </span>
          <span className="block truncate text-[0.68rem] font-medium text-muted">{team?.name ?? "Awaiting"}</span>
        </span>
      </span>
      <span className="num shrink-0 text-right">
        <span className="block font-display text-lg font-bold leading-none">
          {innings.runs}/{innings.wickets}
        </span>
        <span className="block font-mono text-[0.6rem] text-faint">({oversFromBalls(innings.legalBalls)})</span>
      </span>
    </div>
  );
}

function LivePanel({
  scorecard,
  snapshot,
  current,
  currentState,
  complete,
  live,
  home,
  away,
}: {
  scorecard: MatchScorecard | null;
  snapshot: SeasonSnapshot;
  current: InningsSummary | null;
  currentState: MatchState["innings"][number] | null;
  complete: boolean;
  live: boolean;
  home: SeasonTeamSummary | undefined;
  away: SeasonTeamSummary | undefined;
}) {
  if (!scorecard) {
    return <PreMatchPanel snapshot={snapshot} home={home} away={away} />;
  }

  const target = scorecard.state.target;
  const atBreak = scorecard.state.phase === "innings_break";
  const maxBalls = currentState?.maxBalls ?? 120;
  const chaseInnings =
    current && current.number >= 2 && !current.superOver && target !== null && !atBreak && !complete
      ? current
      : null;
  const ballsLeft = chaseInnings ? Math.max(0, maxBalls - chaseInnings.legalBalls) : 0;
  const runsNeeded = chaseInnings && target !== null ? Math.max(0, target - chaseInnings.runs) : null;
  const crr = current && current.legalBalls > 0 ? (current.runs / current.legalBalls) * 6 : null;
  const rrr = chaseInnings && runsNeeded !== null && ballsLeft > 0 ? (runsNeeded / ballsLeft) * 6 : null;
  const projected = current && current.legalBalls > 0 ? Math.round((current.runs / current.legalBalls) * 120) : null;
  const partnership = current ? currentPartnership(current) : null;
  const best = current ? bestStand(current) : null;
  const lastFive = current ? lastOversSummary(scorecard.commentary, current.number, 5) : null;
  const meter =
    chaseInnings && target !== null ? chaseMeter(target, chaseInnings, maxBalls, ballsLeft, runsNeeded) : null;
  const battingTeam = current ? snapshot.teams.find((team) => team.id === current.battingTeamId) : undefined;
  const recent = scorecard.commentary.slice(-12);
  const phaseLabel = current && currentState && !atBreak && !complete ? overPhase(currentState.overNumber) : null;
  const equation =
    live && !atBreak && current && current.number >= 2 && target !== null
      ? equationText(target, current, maxBalls)
      : null;

  return (
    <div className="space-y-4">
      <section className="surface-card relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1"
          style={{
            background: `linear-gradient(90deg, ${battingTeam?.primary ?? "var(--accent)"}, ${battingTeam?.secondary ?? "var(--info)"})`,
          }}
        />
        <div className="px-5 pb-4 pt-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">
                {current ? inningsLabel(current) : "Match"}
                {battingTeam?.shortName ? ` · ${battingTeam.shortName}` : ""}
              </p>
              <div className="mt-1 flex items-end gap-3">
                <h2 className="num font-display text-[clamp(2.6rem,8vw,4rem)] font-bold leading-none">
                  {current ? `${current.runs}/${current.wickets}` : "0/0"}
                </h2>
                <span className="mb-1 font-mono text-sm text-muted">
                  ({current ? oversFromBalls(current.legalBalls) : "0.0"})
                </span>
              </div>
              <p className="mt-1 text-[0.65rem] text-faint">
                {current
                  ? `${current.batting.filter((batter) => batter.balls > 0).length} batters used`
                  : "The first innings is being prepared."}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {atBreak ? (
                <span className="chip chip-gold">Innings break</span>
              ) : complete ? (
                <span className="chip chip-success">Match complete</span>
              ) : live ? (
                <span className="chip chip-accent">
                  <span className="live-dot" /> Live
                </span>
              ) : (
                <span className="chip chip-info">Scheduled</span>
              )}
              {chaseInnings && target !== null && <span className="chip chip-gold">Target {target}</span>}
              {phaseLabel && <span className="chip chip-compact">{phaseLabel}</span>}
            </div>
          </div>

          {equation && (
            <div className="mt-4 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3">
              <p className="font-display text-lg font-bold uppercase tracking-wide text-gold">{equation}</p>
              {runsNeeded !== null && (
                <p className="mt-0.5 text-[0.68rem] text-muted">
                  {runsNeeded} runs needed · {ballsLeft} ball{ballsLeft === 1 ? "" : "s"} left
                  {rrr !== null ? ` · required rate ${rrr.toFixed(2)}` : ""}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile
              icon={<Gauge size={14} />}
              label="Run rate"
              value={crr !== null ? crr.toFixed(2) : "—"}
              hint="this innings"
            />
            <StatTile
              icon={<TrendingUp size={14} />}
              label={chaseInnings ? "Required" : "Projected"}
              value={chaseInnings ? (rrr !== null ? rrr.toFixed(2) : "—") : projected !== null ? String(projected) : "—"}
              hint={chaseInnings ? "runs per over" : "at this rate"}
              tone={chaseInnings ? "gold" : "info"}
            />
            <StatTile
              icon={<Activity size={14} />}
              label={complete ? "Best stand" : "Partnership"}
              value={complete ? (best ? String(best.runs) : "—") : partnership ? String(partnership.runs) : "—"}
              hint={
                complete
                  ? best
                    ? `${best.balls} balls`
                    : "—"
                  : partnership
                    ? `${partnership.balls} balls`
                    : "yet to bat"
              }
              tone="success"
            />
            <StatTile
              icon={<Flame size={14} />}
              label="Last 5 ov"
              value={lastFive ? String(lastFive.runs) : "—"}
              hint={lastFive ? `${lastFive.wickets} wicket${lastFive.wickets === 1 ? "" : "s"}` : "—"}
              tone="accent"
            />
          </div>

          {meter !== null && chaseInnings && (
            <div className="mt-4 rounded-xl border border-line bg-bg2/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.12em]">
                <span className="flex items-center gap-1.5 text-faint">
                  <Activity size={12} className="text-success" /> Chase meter
                </span>
                <span className="text-success">
                  {meter}% {battingTeam?.shortName ?? "chasing"}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface3">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-info via-success to-success transition-all duration-500"
                  style={{ width: `${meter}%` }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[0.58rem] text-faint">
                <span>
                  {runsNeeded} needed from {ballsLeft} balls
                </span>
                <span>Estimated from score, wickets and rate — not a stored result.</span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-line bg-surface2/30 px-5 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-faint">Recent balls</p>
            <p className="text-[0.6rem] text-faint">{scorecard.commentary.length} deliveries logged</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recent.map((delivery) => (
              <DeliveryPip key={delivery.id} delivery={delivery} />
            ))}
            {recent.length === 0 && <span className="text-xs text-faint">No deliveries yet.</span>}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {scorecard.innings.map((summary) => (
          <InningsCard
            key={summary.number}
            innings={summary}
            active={summary.number === current?.number && !complete}
            team={snapshot.teams.find((team) => team.id === summary.battingTeamId)}
          />
        ))}
      </div>
    </div>
  );
}

function PreMatchPanel({
  snapshot,
  home,
  away,
}: {
  snapshot: SeasonSnapshot;
  home: SeasonTeamSummary | undefined;
  away: SeasonTeamSummary | undefined;
}) {
  const homeForm = snapshot.standings.find((row) => row.teamId === home?.id)?.form ?? [];
  const awayForm = snapshot.standings.find((row) => row.teamId === away?.id)?.form ?? [];

  return (
    <section className="surface-card relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(620px 220px at 8% -20%, ${home?.primary ?? "#ff7a1a"}26, transparent 68%), radial-gradient(620px 220px at 92% -20%, ${away?.primary ?? "#5aa7ff"}20, transparent 68%)`,
        }}
      />
      <div className="relative px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">Pre-match</p>
          <span className="chip chip-info">
            <CalendarDays size={11} /> Toss pending
          </span>
        </div>
        <div className="mt-4 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <TeamPreview team={home} form={homeForm} align="left" />
          <div className="text-center">
            <p className="font-display text-[0.62rem] font-bold uppercase tracking-[0.24em] text-faint">vs</p>
          </div>
          <TeamPreview team={away} form={awayForm} align="right" />
        </div>
      </div>
    </section>
  );
}

function TeamPreview({
  team,
  form,
  align,
}: {
  team: SeasonTeamSummary | undefined;
  form: Array<"W" | "L" | "T" | "N">;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-bg2/50 p-3.5",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <div className={cn("flex items-center gap-3", align === "right" && "flex-row-reverse")}>
        {team ? <TeamBadge teamId={team.id} size={40} /> : <span className="h-10 w-10 rounded-full border border-line" />}
        <div className="min-w-0">
          <p className="text-[0.55rem] uppercase tracking-[0.12em] text-faint">{team?.shortName ?? "TBD"}</p>
          <p className="truncate font-display text-lg font-bold uppercase leading-tight">{team?.name ?? "Awaiting"}</p>
        </div>
      </div>
      <div className={cn("mt-3 flex items-center gap-2", align === "right" && "justify-end")}>
        <span className="num font-display text-2xl font-bold leading-none">{team?.playingXiOvr ?? "—"}</span>
        <span className="text-[0.52rem] uppercase tracking-[0.1em] text-faint">XI OVR</span>
      </div>
      <div className={cn("mt-2 flex items-center gap-2", align === "right" && "justify-end")}>
        <span className="text-[0.52rem] uppercase tracking-[0.1em] text-faint">Form</span>
        <FormChips form={form} />
      </div>
    </div>
  );
}

function FormChips({ form }: { form: Array<"W" | "L" | "T" | "N"> }) {
  if (form.length === 0) {
    return <span className="text-[0.58rem] text-faint">No matches yet</span>;
  }
  return (
    <span className="flex gap-1">
      {form.slice(-5).map((result, index) => (
        <span
          key={`${result}-${index}`}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-md text-[0.55rem] font-bold",
            result === "W"
              ? "bg-success/15 text-success"
              : result === "L"
                ? "bg-danger/15 text-danger"
                : "bg-surface3 text-muted",
          )}
        >
          {result}
        </span>
      ))}
    </span>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
  tone = "accent",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "gold" | "success" | "info";
}) {
  const toneClass = {
    accent: "border-accent/20 bg-accent/10 text-accent2",
    gold: "border-gold/20 bg-gold/10 text-gold",
    success: "border-success/20 bg-success/10 text-success",
    info: "border-info/20 bg-info/10 text-info",
  }[tone];
  return (
    <div className="rounded-xl border border-line bg-bg2/60 p-3">
      <div className="flex items-center gap-1.5">
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-md border", toneClass)}>{icon}</span>
        <p className="text-[0.52rem] font-semibold uppercase tracking-[0.12em] text-faint">{label}</p>
      </div>
      <p className="num mt-2 font-display text-2xl font-bold leading-none">{value}</p>
      {hint && <p className="mt-1 truncate text-[0.56rem] text-faint">{hint}</p>}
    </div>
  );
}

type WormPoint = { x: number; runs: number; wickets: number };
type OverRow = { over: number; runs: number; wickets: number };

function RunWormCard({
  commentary,
  innings,
  teams,
  compact = false,
}: {
  commentary: MatchCommentary[];
  innings: InningsSummary[];
  teams: SeasonTeamSummary[];
  compact?: boolean;
}) {
  const gradientId = useId().replace(/:/g, "");
  const entries = innings.filter((entry) => !entry.superOver).slice(0, 2);
  const series = entries.map((entry, index) => {
    const team = teams.find((candidate) => candidate.id === entry.battingTeamId);
    return {
      innings: entry,
      team,
      color: team?.primary ?? (index === 0 ? "#ff7a1a" : "#5aa7ff"),
      points: wormSeries(commentary, entry.number),
    };
  });
  const hasData = series.some((entry) => entry.points.length > 1);
  const target = entries.length > 1 && entries[0].legalBalls > 0 ? entries[0].runs + 1 : null;

  if (!hasData) {
    return (
      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <p className="flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-faint">
              <BarChart3 size={12} className="text-info" /> Run worm
            </p>
            <h3 className="mt-1 font-display text-xl font-bold uppercase tracking-wide">Innings map</h3>
          </div>
          <span className="chip">Awaiting data</span>
        </div>
        <div className="px-5 py-10 text-center text-sm text-faint">
          The run worm appears after the first over is logged.
        </div>
      </section>
    );
  }

  const width = 560;
  const height = 200;
  const pad = { top: 12, right: 12, bottom: 22, left: 32 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const maxPointX = Math.max(5, ...series.flatMap((entry) => entry.points.map((point) => point.x)));
  const maxX = Math.min(20, Math.max(5, Math.ceil(maxPointX / 5) * 5));
  const maxRuns = Math.max(
    40,
    target ?? 0,
    ...series.flatMap((entry) => entry.points.map((point) => point.runs)),
  );
  const maxY = Math.ceil(maxRuns / 20) * 20;
  const scaleX = (value: number) => pad.left + (Math.min(value, maxX) / maxX) * plotWidth;
  const scaleY = (value: number) => pad.top + plotHeight - (value / maxY) * plotHeight;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maxY * fraction));
  const tickStep = maxX <= 5 ? 1 : maxX <= 10 ? 2 : 5;
  const xTicks: number[] = [];
  for (let over = 0; over <= maxX; over += tickStep) xTicks.push(over);
  if (xTicks[xTicks.length - 1] !== maxX) xTicks.push(maxX);

  return (
    <section className="surface-card overflow-hidden">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b border-line",
          compact ? "px-4 py-3" : "px-5 py-4",
        )}
      >
        <div>
          <p className="flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-faint">
            <BarChart3 size={12} className="text-info" /> Run worm
          </p>
          <h3 className={cn("mt-1 font-display font-bold uppercase tracking-wide", compact ? "text-base" : "text-xl")}>
            Innings map
          </h3>
        </div>
        <span className="chip">{Math.min(20, Math.ceil(maxPointX))} overs shown</span>
      </div>
      <div className={compact ? "px-2 pb-2 pt-3" : "px-3 pb-3 pt-4"}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-0"
          role="img"
          aria-label="Run worm comparing both innings"
        >
          <title>Run worm comparing both innings</title>
          <defs>
            {series.map((entry, index) => (
              <linearGradient key={entry.innings.number} id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={entry.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={entry.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {yTicks.map((value) => (
            <g key={`y-${value}`}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={scaleY(value)}
                y2={scaleY(value)}
                stroke="var(--line)"
                strokeOpacity={value === 0 ? 0.9 : 0.55}
                strokeDasharray={value === 0 ? undefined : "3 5"}
              />
              <text x={pad.left - 6} y={scaleY(value) + 3} textAnchor="end" fontSize="8" fill="var(--faint)">
                {value}
              </text>
            </g>
          ))}
          {xTicks.map((over) => (
            <text
              key={`x-${over}`}
              x={scaleX(over)}
              y={height - 6}
              textAnchor="middle"
              fontSize="8"
              fill="var(--faint)"
            >
              {over}
            </text>
          ))}

          {target !== null && target <= maxY && (
            <g>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={scaleY(target)}
                y2={scaleY(target)}
                stroke="var(--gold)"
                strokeOpacity="0.55"
                strokeDasharray="5 4"
              />
              <text x={width - pad.right} y={scaleY(target) - 4} textAnchor="end" fontSize="8" fill="var(--gold)">
                target {target}
              </text>
            </g>
          )}

          {series.map((entry, index) => {
            const path = pathFromPoints(entry.points, scaleX, scaleY);
            const area = areaFromPoints(entry.points, scaleX, scaleY);
            const last = entry.points[entry.points.length - 1];
            const wickets = commentary.filter(
              (delivery) => delivery.inningsNumber === entry.innings.number && delivery.isWicket,
            );
            return (
              <g key={entry.innings.number}>
                <path d={area} fill={`url(#${gradientId}-${index})`} />
                <path
                  d={path}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth="2.3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pathLength={1}
                  className="worm-line"
                />
                {wickets.map((delivery) => (
                  <circle
                    key={delivery.id}
                    cx={scaleX(deliveryX(delivery))}
                    cy={scaleY(delivery.scoreRuns)}
                    r="2.4"
                    fill={entry.color}
                    stroke="var(--surface)"
                    strokeWidth="1"
                  />
                ))}
                <circle cx={scaleX(last.x)} cy={scaleY(last.runs)} r="3.4" fill={entry.color} stroke="var(--surface)" strokeWidth="1.4" />
              </g>
            );
          })}
        </svg>
        <div className="mt-1 flex flex-wrap items-center gap-3 px-2 text-[0.62rem]">
          {series.map((entry) => (
            <span key={entry.innings.number} className="inline-flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
              {entry.team?.shortName ?? `Innings ${entry.innings.number}`}
              <span className="num text-faint">
                {entry.innings.runs}/{entry.innings.wickets}
              </span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-faint">
            <span className="h-2 w-2 rounded-full border border-line bg-bg2" /> wicket
          </span>
        </div>
      </div>
    </section>
  );
}

function MomentumCard({
  commentary,
  inningsNumber,
  phase,
  compact = false,
}: {
  commentary: MatchCommentary[];
  inningsNumber: number | null;
  phase: string | null;
  compact?: boolean;
}) {
  const overs = inningsNumber ? overRuns(commentary, inningsNumber) : [];
  const recent = overs.slice(-6).reverse();
  const max = Math.max(6, ...recent.map((row) => row.runs));
  const total = recent.reduce((sum, row) => sum + row.runs, 0);
  const wickets = recent.reduce((sum, row) => sum + row.wickets, 0);

  return (
    <section className="surface-card overflow-hidden">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b border-line",
          compact ? "px-4 py-3" : "px-5 py-4",
        )}
      >
        <div>
          <p className="flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-faint">
            <Flame size={12} className="text-accent2" /> Momentum
          </p>
          <h3 className={cn("mt-1 font-display font-bold uppercase tracking-wide", compact ? "text-base" : "text-xl")}>
            Over by over
          </h3>
        </div>
        {phase ? <span className="chip chip-compact">{phase}</span> : <span className="chip">—</span>}
      </div>
      <div className={compact ? "space-y-2 px-4 py-3" : "space-y-2.5 px-5 py-4"}>
        {recent.map((row) => (
          <div key={row.over} className="flex items-center gap-2">
            <span className="w-9 font-mono text-[0.6rem] text-faint">Ov {row.over}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface3">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(5, (row.runs / max) * 100)}%`,
                  background: row.wickets > 0 ? "var(--danger)" : "linear-gradient(90deg, var(--accent), var(--accent-2))",
                }}
              />
            </div>
            <span className="num w-6 text-right text-[0.68rem] font-bold">{row.runs}</span>
            {row.wickets > 0 && <span className="chip chip-danger chip-compact">{row.wickets}W</span>}
          </div>
        ))}
        {recent.length === 0 && (
          <p className="py-6 text-center text-sm text-faint">Momentum builds from the first over.</p>
        )}
      </div>
      <div className="border-t border-line bg-surface2/30 px-5 py-3 text-[0.6rem] text-faint">
        Last {recent.length} over{recent.length === 1 ? "" : "s"}: <span className="num text-fg">{total}</span> runs
        {wickets > 0 ? ` · ${wickets} wicket${wickets === 1 ? "" : "s"}` : " · no wickets"}
      </div>
    </section>
  );
}

function EmptyTab({ label }: { label: string }) {
  return (
    <section className="surface-card px-5 py-12 text-center">
      <p className="text-sm text-faint">{label}</p>
    </section>
  );
}

function ControlPanel({
  fixture,
  snapshot,
  isUserMatch,
  canControl,
  complete,
  live,
  auto,
  autoSpeed,
  setAutoSpeed,
  busy,
  control,
  humanMatch,
  viewerTeamId,
  setAuto,
  runAction,
  readySecondsLeft,
}: {
  fixture: SeasonFixtureSummary;
  snapshot: SeasonSnapshot;
  isUserMatch: boolean;
  canControl: boolean;
  complete: boolean;
  live: boolean;
  auto: boolean;
  autoSpeed: number;
  setAutoSpeed: (value: number) => void;
  busy: string | null;
  control: MatchControl | null;
  humanMatch: boolean;
  viewerTeamId: string | null;
  setAuto: (value: boolean) => void;
  runAction: (
    action: Parameters<typeof postMatchAction>[1],
    key: string,
  ) => Promise<void>;
  readySecondsLeft: number | null;
}) {
  const [bowlerPick, setBowlerPick] = useState<string | null>(null);
  const [batterPick, setBatterPick] = useState<string | null>(null);
  const sessionId = snapshot.season.sessionId;
  const viewerSide =
    fixture.homeTeamId === viewerTeamId
      ? "home"
      : fixture.awayTeamId === viewerTeamId
        ? "away"
        : null;
  const myReady = viewerSide === "home" ? fixture.homeReady : viewerSide === "away" ? fixture.awayReady : false;
  const opponentReady = viewerSide === "home" ? fixture.awayReady : viewerSide === "away" ? fixture.homeReady : false;
  const isViewerBowling = Boolean(control && viewerTeamId && control.bowlingTeamId === viewerTeamId);
  const isViewerBatting = Boolean(control && viewerTeamId && control.battingTeamId === viewerTeamId);
  const chosenBowler = control?.needBowler
    ? isViewerBowling
      ? bowlerPick ?? control.suggestedBowlerId ?? ""
      : null
    : null;
  const chosenBatter = isViewerBatting ? batterPick ?? control?.nextBatterId ?? null : null;

  if (!isUserMatch) {
    return (
      <section className="panel p-5">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">Match control</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          AI versus AI. Both lineups are managed by the franchise models; the result is simulated
          deterministically from the fixture seed.
        </p>
        <Link href={`/auction/${sessionId}/season`} className="btn btn-outline btn-sm mt-4 w-full">
          <ArrowLeft size={14} /> Season hub
        </Link>
      </section>
    );
  }

  if (snapshot.season.status === "completed") {
    return (
      <section className="panel p-5">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">Season archive</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This match belongs to a completed season. The scorecard and commentary remain available for
          review.
        </p>
        <Link href={`/auction/${sessionId}/season`} className="btn btn-outline btn-sm mt-4 w-full">
          <Trophy size={14} /> Return to the archive
        </Link>
      </section>
    );
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">Match control</p>
        <p className="mt-1 flex items-center gap-2 font-display text-xl font-bold uppercase">
          {live && <span className="live-dot" />}
          {complete
            ? "Match complete"
            : live
              ? humanMatch
                ? "Head-to-head · over by over"
                : "You are in charge"
              : humanMatch
                ? "Ready check"
                : "Ready to begin"}
        </p>
        {humanMatch && (
          <p className="mt-2 text-[0.65rem] leading-relaxed text-muted">
            Both managers confirm before the toss. If the countdown expires, the AI takes over any
            manager who has not answered.
          </p>
        )}
      </div>
      <div className="space-y-3 p-4">
        {!live && !complete && humanMatch && (
          <div className="space-y-3">
            {readySecondsLeft !== null && (
              <div
                className={cn(
                  "rounded-xl border px-4 py-3",
                  readySecondsLeft <= 20 ? "border-danger/40 bg-danger/5" : "border-line bg-surface2/40",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">
                    <Timer size={12} /> Auto-start
                  </span>
                  <span
                    className={cn(
                      "num font-display text-2xl font-bold leading-none tabular-nums",
                      readySecondsLeft <= 20 ? "text-danger" : "text-fg",
                    )}
                  >
                    {formatCountdown(readySecondsLeft)}
                  </span>
                </div>
                <p className="mt-1.5 text-[0.65rem] leading-relaxed text-muted">
                  When this reaches zero the toss is made and the AI picks the XI, bowlers, batters and
                  tactics for anyone who has not confirmed.
                </p>
              </div>
            )}
            <div className="space-y-2 rounded-xl border border-line bg-surface2/40 p-3">
              <ReadyRow
                label={fixture.homeTeamName ?? "Home"}
                ready={fixture.homeReady}
                you={viewerSide === "home"}
              />
              <ReadyRow
                label={fixture.awayTeamName ?? "Away"}
                ready={fixture.awayReady}
                you={viewerSide === "away"}
              />
            </div>
            {!myReady ? (
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => void runAction({ type: "start-match", fixtureId: fixture.id }, "ready")}
                disabled={busy !== null || !canControl || viewerSide === null}
              >
                {busy === "ready" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                I&apos;m ready
              </button>
            ) : (
              <div className="rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-sm text-muted">
                <p className="font-semibold text-info">
                  {opponentReady ? "Both managers ready — building the toss…" : "Ready. Waiting for your opponent."}
                </p>
                <p className="mt-1 text-[0.65rem] leading-relaxed">
                  The first ball is generated as soon as both sides confirm, or automatically when the
                  timer runs out.
                </p>
              </div>
            )}
            {viewerSide === null && (
              <p className="text-[0.65rem] text-faint">
                You are watching this head-to-head fixture. Take a seat in the auction room to control a team.
              </p>
            )}
            {viewerSide !== null && !canControl && (
              <p className="text-[0.65rem] leading-relaxed text-gold">
                This browser has no seat token for {snapshot.viewer.teamName ?? "your franchise"}. Rejoin
                through the auction room invite to manage this team.
              </p>
            )}
          </div>
        )}
        {!live && !complete && !humanMatch && (
          <div className="space-y-2">
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => void runAction({ type: "start-match", fixtureId: fixture.id }, "start")}
              disabled={busy !== null || !canControl}
            >
              {busy === "start" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Start match
            </button>
            <button
              type="button"
              className="btn btn-outline w-full"
              onClick={async () => {
                await runAction({ type: "start-match", fixtureId: fixture.id }, "start");
                await runAction({ type: "simulate", fixtureId: fixture.id, amount: "match" }, "simulate-match");
              }}
              disabled={busy !== null || !canControl}
            >
              {busy === "simulate-match" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FastForward size={16} />
              )}
              Simulate whole match
            </button>
          </div>
        )}
        {live && (
          <>
            {control && (
              <OverPlan
                control={control}
                humanMatch={humanMatch}
                isViewerBowling={isViewerBowling}
                isViewerBatting={isViewerBatting}
                chosenBowler={chosenBowler}
                chosenBatter={chosenBatter}
                setBowlerPick={setBowlerPick}
                setBatterPick={setBatterPick}
                busy={busy}
                canControl={canControl}
              />
            )}
            {humanMatch ? (
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={async () => {
                  await runAction(
                    {
                      type: "simulate",
                      fixtureId: fixture.id,
                      amount: "over",
                      bowlerId: chosenBowler,
                      nextBatterId: chosenBatter,
                    },
                    "over",
                  );
                  setBowlerPick(null);
                  setBatterPick(null);
                }}
                disabled={busy !== null || viewerSide === null || !canControl}
              >
                {busy === "over" ? <Loader2 size={16} className="animate-spin" /> : <FastForward size={16} />}
                {isViewerBatting ? "Advance the next over" : "Bowl the next over"}
              </button>
            ) : (
              <>
                <div className="rounded-xl border border-line bg-bg2/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-faint">Auto-play speed</p>
                    <span className={cn("chip chip-compact", auto ? "chip-success" : undefined)}>
                      {auto ? "Running" : "Paused"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {AUTO_SPEEDS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAutoSpeed(value)}
                        className={cn(
                          "min-h-9 rounded-lg border text-xs font-semibold tabular-nums transition",
                          autoSpeed === value
                            ? "border-accent/50 bg-accent/15 text-accent2"
                            : "border-line bg-surface2 text-faint hover:text-fg",
                        )}
                        aria-pressed={autoSpeed === value}
                      >
                        {value}×
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={async () => {
                    await runAction(
                      {
                        type: "simulate",
                        fixtureId: fixture.id,
                        amount: "ball",
                        bowlerId: chosenBowler,
                        nextBatterId: chosenBatter,
                      },
                      "ball",
                    );
                    setBowlerPick(null);
                    setBatterPick(null);
                  }}
                  disabled={busy !== null || !canControl}
                >
                  {busy === "ball" ? <Loader2 size={16} className="animate-spin" /> : <CircleDot size={16} />}
                  Bowl the next ball
                </button>
                <button
                  type="button"
                  className={cn("btn w-full", auto ? "btn-outline" : "btn-ghost")}
                  onClick={() => setAuto(!auto)}
                  disabled={(busy !== null && !auto) || !canControl}
                >
                  {auto ? <Pause size={15} /> : <Play size={15} />}
                  {auto ? "Pause auto-play" : "Auto-play ball by ball"}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void runAction({ type: "simulate", fixtureId: fixture.id, amount: "over" }, "over")}
                    disabled={busy !== null || !canControl}
                  >
                    {busy === "over" ? <Loader2 size={14} className="animate-spin" /> : <FastForward size={14} />}
                    Sim over
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void runAction({ type: "simulate", fixtureId: fixture.id, amount: "innings" }, "innings")}
                    disabled={busy !== null || !canControl}
                  >
                    {busy === "innings" ? <Loader2 size={14} className="animate-spin" /> : <SkipForward size={14} />}
                    Sim innings
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm w-full"
                  onClick={() => {
                    if (busy === null) {
                      setAuto(false);
                      void runAction({ type: "simulate", fixtureId: fixture.id, amount: "match" }, "match");
                    }
                  }}
                  disabled={busy !== null || !canControl}
                >
                  {busy === "match" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Finish this match
                </button>
                <div className="rounded-xl border border-line bg-surface2/30 p-3">
                  <p className="flex items-center gap-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-faint">
                    <Zap size={11} className="text-gold" /> Keyboard
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-[0.62rem] text-muted">
                    <Shortcut keys="Space" label="Next ball" />
                    <Shortcut keys="A" label="Auto-play" />
                    <Shortcut keys="O" label="Sim over" />
                    <Shortcut keys="I" label="Sim innings" />
                  </div>
                </div>
              </>
            )}
            {humanMatch && (
              <p className="text-[0.6rem] leading-relaxed text-faint">
                Head-to-head rules: the match advances one over at a time, and neither manager can pick
                the other team&apos;s bowler or batter.
              </p>
            )}
          </>
        )}
        {complete && (
          <Link href={`/auction/${sessionId}/season`} className="btn btn-primary w-full">
            Back to the season <ArrowRight size={15} />
          </Link>
        )}
        <div className="border-t border-line pt-3">
          <Link href={`/auction/${sessionId}/season/squad`} className="btn btn-ghost btn-sm w-full">
            <Users size={14} /> {live ? "XI is locked" : "Manage XI & tactics"}
          </Link>
          {live && (
            <p className="mt-2 text-[0.62rem] leading-relaxed text-faint">
              Scorer&apos;s note: the XI and tactics are frozen while this match is live.
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-line bg-surface2/40 px-4 py-3">
        <p className="flex items-center gap-1.5 text-[0.62rem] text-faint">
          <ShieldCheck size={12} /> Every ball is server-simulated. Refreshing resumes the saved state.
        </p>
      </div>
    </section>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="rounded border border-line bg-bg2 px-1.5 py-0.5 font-mono text-[0.56rem] text-fg">{keys}</kbd>
      {label}
    </span>
  );
}

function OverPlan({
  control,
  humanMatch,
  isViewerBowling,
  isViewerBatting,
  chosenBowler,
  chosenBatter,
  setBowlerPick,
  setBatterPick,
  busy,
  canControl,
}: {
  control: MatchControl;
  humanMatch: boolean;
  isViewerBowling: boolean;
  isViewerBatting: boolean;
  chosenBowler: string | null;
  chosenBatter: string | null;
  setBowlerPick: (id: string | null) => void;
  setBatterPick: (id: string | null) => void;
  busy: string | null;
  canControl: boolean;
}) {
  const locked = busy !== null || !canControl;
  const showBowlers = control.needBowler && (!humanMatch || isViewerBowling);
  const showBatters = control.batters.length > 0 && (!humanMatch || isViewerBatting);
  const overNumber = control.inningsNumber ? `Innings ${control.inningsNumber}` : "Over plan";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface2/40">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
        <p className="flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-faint">
          <Target size={12} className="text-accent2" /> {overNumber}
        </p>
        <span
          className={cn(
            "chip chip-compact",
            humanMatch && isViewerBowling ? "chip-accent" : humanMatch && isViewerBatting ? "chip-gold" : undefined,
          )}
        >
          {humanMatch
            ? isViewerBowling
              ? "Your over to bowl"
              : isViewerBatting
                ? "Your innings"
                : "Opponent's call"
            : "Your call"}
        </span>
      </div>

      <div className="space-y-3 p-3">
        {humanMatch && (
          <p className="text-[0.62rem] leading-relaxed text-info">
            {isViewerBowling
              ? "You are bowling. Name your bowler for this over."
              : isViewerBatting
                ? "You are batting. Set the next batter in if a wicket falls."
                : "This over belongs to the other dressing room."}
          </p>
        )}

        {showBowlers ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <p id="over-bowler-label" className="field-label mb-0">
                Bowler for the next over
              </p>
              {control.suggestedBowlerId && chosenBowler !== control.suggestedBowlerId && (
                <button
                  type="button"
                  onClick={() => setBowlerPick(control.suggestedBowlerId)}
                  disabled={locked}
                  className="link-arrow shrink-0 text-[0.55rem] text-faint hover:text-accent2"
                >
                  <Wand2 size={11} /> Use suggested
                </button>
              )}
            </div>
            <div
              role="radiogroup"
              aria-labelledby="over-bowler-label"
              className="mt-2 grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-0.5 scrollbar-thin [mask-image:linear-gradient(to_bottom,#000_calc(100%_-_1.25rem),transparent)] sm:grid-cols-2 xl:grid-cols-1"
            >
              {control.bowlers.map((bowler, index) => {
                const active = chosenBowler === bowler.id;
                return (
                  <button
                    key={bowler.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={locked || !bowler.eligible}
                    onClick={() => setBowlerPick(bowler.id)}
                    style={{ animationDelay: `${Math.min(index, 10) * 38}ms` }}
                    className={cn(
                      "animate-fade-up group relative flex items-center gap-2 overflow-hidden rounded-xl border px-2 py-1.5 text-left transition-all duration-200",
                      active
                        ? "border-accent/70 bg-accent/10 shadow-[0_10px_24px_-18px_var(--accent)]"
                        : "border-line bg-bg2/70 hover:-translate-y-0.5 hover:border-accent/35 hover:bg-surface2",
                      !bowler.eligible &&
                        "cursor-not-allowed border-dashed opacity-40 hover:translate-y-0 hover:border-line hover:bg-bg2/70",
                    )}
                  >
                    <PlayerAvatar
                      name={bowler.name}
                      teamId={control.bowlingTeamId}
                      role="bowler"
                      size="sm"
                      className="h-9 w-9 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-[0.72rem] font-semibold leading-tight">{bowler.name}</span>
                        {bowler.eligible && bowler.id === control.suggestedBowlerId && (
                          <span className="shrink-0 rounded bg-gold/15 px-1 py-px text-[0.45rem] font-bold uppercase tracking-[0.08em] text-gold">
                            Pick
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.55rem] text-faint">
                        {bowler.note}
                        {bowler.detail ? ` · ${bowler.detail}` : ""}
                      </span>
                      <span className="mt-1 flex items-center gap-0.5" aria-hidden="true">
                        {[0, 1, 2, 3].map((pip) => (
                          <span
                            key={pip}
                            className={cn(
                              "h-0.5 w-3 rounded-full transition-colors",
                              pip < bowler.oversBowled ? "bg-accent/80" : "bg-surface3",
                            )}
                          />
                        ))}
                        <span className="num ml-1 text-[0.5rem] text-faint">{bowler.oversBowled}/4 ov</span>
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                        active
                          ? "scale-100 border-accent bg-accent text-accentInk"
                          : "scale-90 border-line text-transparent",
                      )}
                      aria-hidden="true"
                    >
                      <Check size={11} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : control.needBowler && humanMatch ? (
          <p className="rounded-lg border border-line bg-bg2/50 px-3 py-2 text-[0.65rem] leading-relaxed text-faint">
            Your opponent is choosing the bowler. You choose your batter and then advance the over.
          </p>
        ) : (
          <p className="rounded-lg border border-line bg-bg2/50 px-3 py-2 text-[0.65rem] leading-relaxed text-faint">
            Mid-over. The current bowler finishes the over; the next pick is made when it ends.
          </p>
        )}

        {showBatters && (
          <div>
            <p id="next-batter-label" className="field-label mb-0">
              Next batter in <span className="normal-case text-faint">(if a wicket falls)</span>
            </p>
            <div
              role="radiogroup"
              aria-labelledby="next-batter-label"
              className="mt-2 grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto pr-0.5 scrollbar-thin [mask-image:linear-gradient(to_bottom,#000_calc(100%_-_1.25rem),transparent)] sm:grid-cols-2 xl:grid-cols-1"
            >
              {control.batters.map((batter, index) => {
                const active = chosenBatter === batter.id;
                return (
                  <button
                    key={batter.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={locked || !batter.eligible}
                    onClick={() => setBatterPick(batter.id)}
                    style={{ animationDelay: `${Math.min(index, 10) * 38}ms` }}
                    className={cn(
                      "animate-fade-up group relative flex items-center gap-2 overflow-hidden rounded-xl border px-2 py-1.5 text-left transition-all duration-200",
                      active
                        ? "border-gold/60 bg-gold/10 shadow-[0_10px_24px_-18px_var(--gold)]"
                        : "border-line bg-bg2/70 hover:-translate-y-0.5 hover:border-gold/35 hover:bg-surface2",
                      !batter.eligible &&
                        "cursor-not-allowed border-dashed opacity-40 hover:translate-y-0 hover:border-line hover:bg-bg2/70",
                    )}
                  >
                    <span className="relative shrink-0">
                      <PlayerAvatar
                        name={batter.name}
                        teamId={control.battingTeamId}
                        role="batter"
                        size="sm"
                        className="h-9 w-9"
                      />
                      <span className="num absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-bg text-[0.5rem] font-bold text-muted">
                        {batter.order}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.72rem] font-semibold leading-tight">{batter.name}</span>
                      <span className="mt-0.5 block truncate text-[0.55rem] text-faint">
                        {batter.detail ?? (batter.eligible ? "Available" : "Unavailable")}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                        active ? "scale-100 border-gold bg-gold text-black" : "scale-90 border-line text-transparent",
                      )}
                      aria-hidden="true"
                    >
                      <Check size={11} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-[0.6rem] leading-relaxed text-faint">
          Each delivery is shaped by the chosen XI, player OVR and IPL career strike rate, average, economy
          and dot-ball record.
        </p>
      </div>
    </div>
  );
}

function ReadyRow({ label, ready, you }: { label: string; ready: boolean; you: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="min-w-0 truncate font-medium">
        {label}
        {you && <span className="ml-1.5 text-[0.6rem] uppercase tracking-[0.1em] text-accent">you</span>}
      </span>
      <span className={cn("chip", ready ? "chip-success" : "chip-info")}>
        {ready ? <CheckCircle2 size={11} /> : <Loader2 size={11} />}
        {ready ? "Ready" : "Waiting"}
      </span>
    </div>
  );
}

function ScorecardPanel({
  scorecard,
  snapshot,
}: {
  scorecard: MatchScorecard | null;
  snapshot: SeasonSnapshot;
}) {
  if (!scorecard) {
    return (
      <section className="panel px-6 py-12 text-center">
        <p className="font-display text-xl font-bold uppercase text-muted">No scorecard yet</p>
        <p className="mt-2 text-sm text-faint">Start the match to generate the toss and first innings.</p>
      </section>
    );
  }

  const innings = scorecard.innings;
  const top = topScorerAcross(innings);
  const best = bestBowlingAcross(innings);
  const standEntries: StandEntry[] = innings
    .map((entry) => ({
      innings: entry,
      team: snapshot.teams.find((team) => team.id === entry.battingTeamId),
      stand: bestStand(entry),
    }))
    .filter((entry): entry is StandEntry => entry.stand !== null && entry.stand.runs > 0);
  const bestStandEntry = standEntries.reduce<StandEntry | null>(
    (acc, entry) => (!acc || entry.stand.runs > acc.stand.runs ? entry : acc),
    null,
  );
  const potm = playerOfMatch(scorecard);
  const topTeam = top ? snapshot.teams.find((team) => team.id === top.teamId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow">Two-team scorecard</p>
          <h2 className="mt-1 font-display text-xl font-bold uppercase tracking-wide">Match in numbers</h2>
        </div>
        <span className="chip chip-info">
          <ChevronDown size={11} /> Tap a team for the full sheet
        </span>
      </div>

      {innings.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          <StatTile
            icon={<Star size={14} />}
            label="Top scorer"
            value={top ? String(top.runs) : "—"}
            hint={top ? `${shortName(top.name)} · ${topTeam?.shortName ?? "—"}` : "—"}
            tone="gold"
          />
          <StatTile
            icon={<Award size={14} />}
            label="Best bowling"
            value={best ? `${best.wickets}/${best.runs}` : "—"}
            hint={best ? `${shortName(best.name)} · ${oversFromBalls(best.balls)} ov` : "—"}
            tone="success"
          />
        </div>
      )}

      {bestStandEntry && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-bg2/50 px-4 py-3">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Award size={15} className="text-gold" />
            <span className="font-semibold">Best stand</span>
            <span className="num text-muted">
              {bestStandEntry.stand.runs} runs{" "}
              <span className="text-faint">({bestStandEntry.stand.balls} balls)</span>
            </span>
          </p>
          <p className="text-[0.62rem] text-faint">
            {bestStandEntry.team?.shortName ?? "—"} ·{" "}
            {bestStandEntry.stand.unbroken
              ? `unbroken ${ordinal(bestStandEntry.stand.wicket)}-wicket stand`
              : `${ordinal(bestStandEntry.stand.wicket)} wicket`}
            {bestStandEntry.stand.endedById
              ? ` · ended by ${nameOf(bestStandEntry.innings, bestStandEntry.stand.endedById)}`
              : ""}
          </p>
        </div>
      )}

      {scorecard.result && (
        <div className="rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-semibold">Result: </span> {scorecard.result.summary}
              <span className="ml-2 text-xs text-muted">({scorecard.result.margin})</span>
            </span>
            <span className="chip chip-success">{methodLabel(scorecard.result.method)}</span>
          </div>
          {potm && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-bg2/60 px-3 py-2">
              <PlayerAvatar name={potm.name} teamId={potm.teamId} size="sm" className="h-9 w-9" />
              <div className="min-w-0">
                <p className="text-[0.55rem] uppercase tracking-[0.12em] text-gold">Player of the match</p>
                <p className="truncate text-sm font-semibold text-fg">{potm.name}</p>
              </div>
              {potm.detail && <span className="num ml-auto shrink-0 text-[0.62rem] text-muted">{potm.detail}</span>}
            </div>
          )}
        </div>
      )}

      {innings.map((entry) => (
        <InningsScorecard
          key={entry.number}
          innings={entry}
          team={snapshot.teams.find((team) => team.id === entry.battingTeamId)}
        />
      ))}

      <p className="text-[0.65rem] leading-relaxed text-faint">
        This scorecard is generated by the deterministic T20 simulator. Super-over innings are shown
        separately. Dismissal text, fielder credits and commentary all come from the recorded delivery
        log.
      </p>
    </div>
  );
}

function InningsScorecard({
  innings,
  team,
}: {
  innings: InningsSummary;
  team: SeasonTeamSummary | undefined;
}) {
  const top = topOfInnings(innings);
  const best = bestBowlerOfInnings(innings);
  return (
    <details className="surface-card group overflow-hidden">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4 transition-colors hover:bg-surface2/40">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-8 w-1 shrink-0 rounded-full"
            style={{ background: team?.primary ?? "var(--accent)" }}
          />
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface2 text-muted transition-transform group-open:rotate-180">
            <ChevronDown size={15} />
          </span>
          <div>
            <p className="eyebrow">
              {inningsLabel(innings)}
              {team?.shortName ? ` · ${team.shortName}` : ""}
            </p>
            <h2 className="mt-1 font-display text-xl font-bold uppercase tracking-wide">
              {innings.runs}/{innings.wickets}{" "}
              <span className="font-mono text-sm font-normal tracking-wide text-muted">
                ({oversFromBalls(innings.legalBalls)})
              </span>
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {top && (
            <span className="chip chip-gold">
              <Star size={10} /> {shortName(top.name)} {top.runs}
            </span>
          )}
          {best && (
            <span className="chip chip-success">
              <Award size={10} /> {best.wickets}/{best.runs}
            </span>
          )}
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-faint group-open:hidden">
            Open full sheet
          </span>
        </div>
      </summary>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[560px]">
          <thead>
            <tr>
              <th>Batting</th>
              <th>Dismissal</th>
              <th className="text-right">R</th>
              <th className="text-right">B</th>
              <th className="text-right">4s</th>
              <th className="text-right">6s</th>
              <th className="text-right">SR</th>
            </tr>
          </thead>
          <tbody>
            {innings.batting.map((batter) => (
              <tr key={batter.playerId}>
                <td>
                  <span className="font-medium">{batter.name}</span>
                  <span className="ml-2 text-[0.6rem] text-faint">#{batter.order}</span>
                </td>
                <td className="max-w-[230px] text-xs text-muted">{batter.out ? batter.dismissal ?? "out" : "not out"}</td>
                <td className="num text-right font-semibold">{batter.runs}</td>
                <td className="num text-right">{batter.balls}</td>
                <td className="num text-right">{batter.fours}</td>
                <td className="num text-right">{batter.sixes}</td>
                <td className="num text-right">{strikeRate(batter.runs, batter.balls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto border-t border-line">
        <table className="data-table min-w-[520px]">
          <thead>
            <tr>
              <th>Bowling</th>
              <th className="text-right">O</th>
              <th className="text-right">R</th>
              <th className="text-right">W</th>
              <th className="text-right">Econ</th>
              <th className="text-right">Dots</th>
            </tr>
          </thead>
          <tbody>
            {innings.bowling.map((bowler) => (
              <tr key={bowler.playerId}>
                <td className="font-medium">{bowler.name}</td>
                <td className="num text-right">{oversFromBalls(bowler.balls)}</td>
                <td className="num text-right">{bowler.runs}</td>
                <td className="num text-right font-semibold">{bowler.wickets}</td>
                <td className="num text-right">{economy(bowler.runs, bowler.balls)}</td>
                <td className="num text-right">{bowler.dots}</td>
              </tr>
            ))}
            {innings.bowling.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-faint">No bowling recorded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-5 py-3 text-[0.68rem] text-muted">
        <span className="font-semibold text-fg">Fall of wickets: </span>
        {innings.fallOfWickets.length === 0
          ? "none"
          : innings.fallOfWickets
              .map(
                (wicket) =>
                  `${wicket.wicket}-${wicket.runs} (${nameOf(innings, wicket.playerId)}, ${oversFromBalls(wicket.legalBalls)})`,
              )
              .join(" · ")}
      </div>
    </details>
  );
}

function ReplayPanel({
  scorecard,
  snapshot,
}: {
  scorecard: MatchScorecard | null;
  snapshot: SeasonSnapshot;
}) {
  const deliveries = scorecard?.commentary ?? [];
  const [index, setIndex] = useState(deliveries.length - 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const lastIndex = deliveries.length - 1;

  useEffect(() => {
    if (!playing || deliveries.length === 0 || index >= lastIndex) return;
    const timer = window.setTimeout(() => {
      setIndex((value) => Math.min(value + 1, lastIndex));
      if (index + 1 >= lastIndex) setPlaying(false);
    }, Math.round(850 / speed));
    return () => window.clearTimeout(timer);
  }, [playing, index, speed, deliveries.length, lastIndex]);

  if (!scorecard || deliveries.length === 0) {
    return (
      <section className="panel px-6 py-12 text-center">
        <p className="font-display text-xl font-bold uppercase text-muted">Nothing to replay yet</p>
        <p className="mt-2 text-sm text-faint">
          The replay player opens as soon as the first delivery is recorded.
        </p>
      </section>
    );
  }

  const current = index >= 0 ? deliveries[index] : null;
  const innings = current
    ? scorecard.innings.find((entry) => entry.number === current.inningsNumber)
    : scorecard.innings[0];
  const battingTeam = snapshot.teams.find((team) => team.id === innings?.battingTeamId);
  const recent = deliveries.slice(Math.max(0, index - 8), index + 1);
  const revealed = index + 1;

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (index >= lastIndex) setIndex(0);
    setPlaying(true);
  };

  const jump = (next: number) => {
    setPlaying(false);
    setIndex(Math.max(-1, Math.min(next, lastIndex)));
  };

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <div>
          <p className="eyebrow">Recorded replay</p>
          <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">Rewind the match</h2>
        </div>
        <span className="chip chip-info">
          <ShieldCheck size={11} />{" "}
          {scorecard.state.phase === "complete" ? "Read-only · result locked" : "Read-only · live log"}
        </span>
      </div>

      <div
        className="px-5 py-6"
        style={{
          background:
            "radial-gradient(560px 220px at 20% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)",
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">
              {current
                ? current.inningsNumber <= 2
                  ? `Innings ${current.inningsNumber}`
                  : "Super over"
                : "Before the first ball"}{" "}
              · {battingTeam?.shortName ?? "Batting side"}
            </p>
            <p className="num mt-1 font-display text-[clamp(2.4rem,7vw,3.8rem)] font-bold leading-none tabular-nums">
              {current ? current.scoreRuns : 0}/{current ? current.scoreWickets : 0}
            </p>
            <p className="mt-1 font-mono text-xs text-muted">
              {current ? `${current.overNumber}.${current.ballInOver} overs` : "0.0 overs"} · delivery{" "}
              {revealed} of {deliveries.length}
            </p>
          </div>
          <span className={cn("chip", index >= lastIndex ? "chip-success" : "chip-accent")}>
            {index >= lastIndex ? "Final ball" : playing ? "Playing" : "Paused"}
          </span>
        </div>

        <div className="mt-6 flex min-h-7 flex-wrap items-center gap-1.5">
          {recent.map((delivery) => (
            <DeliveryPip key={delivery.id} delivery={delivery} />
          ))}
          {recent.length === 0 && (
            <span className="text-xs text-faint">Press play or drag the timeline to begin.</span>
          )}
        </div>

        <label htmlFor="replay-timeline" className="mt-5 block text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-faint">
          Timeline
        </label>
        <input
          id="replay-timeline"
          type="range"
          min={-1}
          max={lastIndex}
          step={1}
          value={index}
          onChange={(event) => jump(Number(event.target.value))}
          className="mt-2 h-2 w-full cursor-pointer"
          style={{ accentColor: "var(--accent)" }}
          aria-valuetext={
            current
              ? `${current.scoreRuns} for ${current.scoreWickets} after ${current.overNumber}.${current.ballInOver} overs`
              : "Before the first ball"
          }
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => jump(-1)}
            disabled={index <= -1}
            aria-label="Jump to the first ball"
          >
            <ChevronsLeft size={14} /> Start
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => jump(index - 1)}
            disabled={index <= -1}
            aria-label="Previous delivery"
          >
            <SkipBack size={14} />
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={togglePlay}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? "Pause" : index >= lastIndex ? "Replay" : "Play"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => jump(index + 1)}
            disabled={index >= lastIndex}
            aria-label="Next delivery"
          >
            <ChevronsRight size={14} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => jump(lastIndex)}
            disabled={index >= lastIndex}
            aria-label="Jump to the final ball"
          >
            End <ChevronsRight size={14} />
          </button>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-bg2/60 p-1">
            {[0.5, 1, 2, 4].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSpeed(value)}
                className={cn(
                  "rounded-md px-2 py-1 text-[0.65rem] font-semibold tabular-nums transition",
                  speed === value ? "bg-accent text-accentInk" : "text-faint hover:text-fg",
                )}
                aria-pressed={speed === value}
              >
                {value}×
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-line">
        {current ? (
          <CommentaryRow delivery={current} />
        ) : (
          <p className="px-5 py-6 text-sm text-faint">
            The first delivery is cued. Press play to watch the innings unfold.
          </p>
        )}
      </div>

      <div className="border-t border-line bg-surface2/40 px-5 py-3">
        <p className="flex items-start gap-1.5 text-[0.62rem] leading-relaxed text-faint">
          <ShieldCheck size={12} className="mt-0.5 shrink-0" />
          This player only reads the saved delivery log. Scrubbing, pausing or replaying never changes the
          scorecard, table, awards or any stored result.
        </p>
      </div>
    </section>
  );
}

type CommentaryFilter = "all" | "boundary" | "wicket" | "extra";
type CommentaryScope = "recent" | "innings" | "match";

type CommentaryGroup = {
  key: string;
  inningsNumber: number;
  overNumber: number;
  runs: number;
  wickets: number;
  total: number;
  items: MatchCommentary[];
};

function CommentaryPanel({ scorecard }: { scorecard: MatchScorecard | null }) {
  const [filter, setFilter] = useState<CommentaryFilter>("all");
  const [scope, setScope] = useState<CommentaryScope>("recent");

  const allGroups = useMemo<CommentaryGroup[]>(() => {
    if (!scorecard) return [];
    const map = new Map<string, CommentaryGroup>();
    for (const delivery of [...scorecard.commentary].reverse()) {
      const key = `${delivery.inningsNumber}:${delivery.overNumber}`;
      const group =
        map.get(key) ??
        ({
          key,
          inningsNumber: delivery.inningsNumber,
          overNumber: delivery.overNumber,
          runs: 0,
          wickets: 0,
          total: 0,
          items: [],
        } satisfies CommentaryGroup);
      group.runs += delivery.runsTotal;
      group.wickets += delivery.isWicket ? 1 : 0;
      group.total += 1;
      group.items.push(delivery);
      map.set(key, group);
    }
    return [...map.values()];
  }, [scorecard]);

  const latestInnings = allGroups[0]?.inningsNumber ?? null;
  const inningsGroups = useMemo(
    () => (latestInnings === null ? [] : allGroups.filter((group) => group.inningsNumber === latestInnings)),
    [allGroups, latestInnings],
  );
  const scoped = scope === "recent" ? allGroups.slice(0, 2) : scope === "innings" ? inningsGroups : allGroups;
  const groups = useMemo(
    () =>
      scoped
        .map((group) => ({ ...group, items: group.items.filter((delivery) => matchesFilter(delivery, filter)) }))
        .filter((group) => group.items.length > 0),
    [scoped, filter],
  );

  if (!scorecard) {
    return (
      <section className="panel px-6 py-12 text-center">
        <p className="font-display text-xl font-bold uppercase text-muted">No commentary yet</p>
        <p className="mt-2 text-sm text-faint">The commentary box opens with the first ball.</p>
      </section>
    );
  }

  const total = scorecard.commentary.length;
  const boundaryCount = scorecard.commentary.filter((delivery) => !delivery.isWicket && delivery.runsTotal >= 4).length;
  const sixCount = scorecard.commentary.filter((delivery) => !delivery.isWicket && delivery.runsTotal >= 6).length;
  const wicketCount = scorecard.commentary.filter((delivery) => delivery.isWicket).length;
  const extraCount = scorecard.commentary.filter((delivery) => delivery.extraType !== null).length;
  const filters: Array<{ id: CommentaryFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: total },
    { id: "boundary", label: "4s & 6s", count: boundaryCount },
    { id: "wicket", label: "Wickets", count: wicketCount },
    { id: "extra", label: "Extras", count: extraCount },
  ];
  const scopeCounts: Record<CommentaryScope, number> = {
    recent: Math.min(2, allGroups.length),
    innings: inningsGroups.length,
    match: allGroups.length,
  };
  const nextScope: CommentaryScope | null =
    scope === "recent" && scopeCounts.innings > scopeCounts.recent
      ? "innings"
      : scope !== "match" && scopeCounts.match > scopeCounts[scope]
        ? "match"
        : null;
  const scopeLabel = scope === "recent" ? "Last 2 overs" : scope === "innings" ? "Last innings" : "Full match";

  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="eyebrow">Ball by ball</p>
            <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">Commentary feed</h2>
          </div>
          <span className="chip">{scopeLabel}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip chip-success">
            <Flame size={11} /> {boundaryCount} boundaries
          </span>
          <span className="chip chip-gold">
            <Star size={11} /> {sixCount} sixes
          </span>
          <span className="chip chip-danger">
            <Activity size={11} /> {wicketCount} wickets
          </span>
          <span className="chip">{extraCount} extras</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {filters.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setFilter(entry.id)}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[0.68rem] font-semibold transition",
                filter === entry.id
                  ? "border-accent/50 bg-accent/15 text-accent2"
                  : "border-line bg-surface2/60 text-muted hover:text-fg",
              )}
              aria-pressed={filter === entry.id}
            >
              {entry.label}
              <span className="num text-[0.58rem] text-faint">{entry.count}</span>
            </button>
          ))}
        </div>
      </div>
      {groups.map((group) => (
        <div key={group.key} className="border-b border-line/60 last:border-b-0">
          <div className="flex items-center justify-between gap-2 bg-surface2/40 px-4 py-2">
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-faint">
              {group.inningsNumber <= 2 ? `Innings ${group.inningsNumber}` : "Super over"} · Over {group.overNumber}
            </p>
            <div className="flex items-center gap-2 text-[0.58rem] text-faint">
              <span className="num">{group.runs} runs</span>
              {group.wickets > 0 && <span className="text-danger">{group.wickets}W</span>}
              {filter !== "all" && (
                <span>
                  · {group.items.length}/{group.total} balls
                </span>
              )}
            </div>
          </div>
          <ol className="divide-y divide-line/50">
            {group.items.map((delivery) => (
              <CommentaryRow key={delivery.id} delivery={delivery} />
            ))}
          </ol>
        </div>
      ))}
      {groups.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-faint">
          {total === 0 ? "Nothing has happened yet." : "No deliveries match this filter."}
        </p>
      )}
      {(scope !== "recent" || nextScope) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface2/30 px-4 py-2.5">
          <p className="text-[0.58rem] uppercase tracking-[0.12em] text-faint">
            Showing {scopeLabel.toLowerCase()}
          </p>
          <div className="flex items-center gap-3">
            {scope !== "recent" && (
              <button type="button" className="link-arrow" onClick={() => setScope("recent")}>
                <ChevronUp size={13} /> Show less
              </button>
            )}
            {nextScope && (
              <button type="button" className="link-arrow" onClick={() => setScope(nextScope)}>
                Show more <ChevronDown size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CommentaryRow({ delivery }: { delivery: MatchCommentary }) {
  const boundary = delivery.runsTotal >= 4 && !delivery.isWicket;
  const wicket = delivery.isWicket;
  return (
    <li className={cn("flex gap-3 px-4 py-3", wicket && "bg-danger/[0.045]", boundary && "bg-success/[0.035]")}>
      <span
        className={cn(
          "mt-0.5 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md px-1 font-display text-[0.68rem] font-bold",
          wicket
            ? "bg-danger/15 text-danger"
            : boundary
              ? "bg-success/15 text-success"
              : delivery.extraType
                ? "bg-gold/15 text-gold"
                : "bg-surface3 text-muted",
        )}
      >
        {wicket ? "W" : delivery.extraType === "wide" ? "wd" : delivery.extraType === "nb" ? "nb" : delivery.runsTotal}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.78rem] leading-relaxed text-fg">{delivery.commentary}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.58rem] uppercase tracking-[0.08em] text-faint">
          <span>
            {delivery.inningsNumber <= 2 ? `Innings ${delivery.inningsNumber}` : "Super over"} ·{" "}
            {delivery.overNumber}.{delivery.ballInOver}
          </span>
          <span className="num">
            {delivery.scoreRuns}/{delivery.scoreWickets}
          </span>
          {delivery.extraType && <span className="text-gold">{delivery.extraType}</span>}
        </div>
      </div>
    </li>
  );
}

function DeliveryPip({ delivery }: { delivery: MatchCommentary }) {
  const wicket = delivery.isWicket;
  const boundary = delivery.runsTotal >= 4 && !wicket;
  return (
    <span
      className={cn(
        "flex h-7 min-w-7 items-center justify-center rounded-md border px-1 font-display text-[0.68rem] font-bold",
        wicket
          ? "border-danger/40 bg-danger/15 text-danger"
          : boundary
            ? "border-success/40 bg-success/15 text-success"
            : delivery.extraType
              ? "border-gold/40 bg-gold/15 text-gold"
              : "border-line bg-surface2 text-muted",
      )}
      title={delivery.commentary}
    >
      {wicket ? "W" : delivery.extraType === "wide" ? "wd" : delivery.extraType === "nb" ? "nb" : delivery.runsTotal}
    </span>
  );
}

function InningsCard({
  innings,
  active,
  team,
}: {
  innings: InningsSummary;
  active: boolean;
  team: SeasonTeamSummary | undefined;
}) {
  const top = topOfInnings(innings);
  const bowler = bestBowlerOfInnings(innings);
  const rate = innings.legalBalls > 0 ? ((innings.runs / innings.legalBalls) * 6).toFixed(2) : "—";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4",
        active ? "border-accent/40 bg-accent/[0.04]" : "border-line bg-bg2/50",
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: team?.primary ?? "var(--line)" }}
      />
      <div className="pl-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-faint">
            {inningsLabel(innings)}
            {team?.shortName ? ` · ${team.shortName}` : ""}
          </p>
          {active ? (
            <span className="chip chip-accent chip-compact">
              <span className="live-dot" /> Current
            </span>
          ) : (
            <span className="chip chip-compact">{rate} RR</span>
          )}
        </div>
        <p className="num mt-2 font-display text-2xl font-bold">
          {innings.runs}/{innings.wickets}
          <span className="ml-2 font-mono text-xs font-normal text-muted">({oversFromBalls(innings.legalBalls)})</span>
        </p>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[0.66rem]">
            <span className="flex min-w-0 items-center gap-1.5 text-faint">
              <Star size={10} className="shrink-0 text-gold" /> Top scorer
            </span>
            <span className="truncate font-medium">
              {top ? `${shortName(top.name)} ${top.runs} (${top.balls})` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[0.66rem]">
            <span className="flex min-w-0 items-center gap-1.5 text-faint">
              <Award size={10} className="shrink-0 text-success" /> Best bowling
            </span>
            <span className="num truncate font-medium">
              {bowler ? `${shortName(bowler.name)} ${bowler.wickets}/${bowler.runs}` : "—"}
            </span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[0.56rem]">
          <span className="chip chip-compact">{innings.fallOfWickets.length} wickets</span>
        </div>
      </div>
    </div>
  );
}

type Stand = {
  runs: number;
  balls: number;
  wicket: number;
  unbroken: boolean;
  endedById: string | null;
};

type StandEntry = {
  innings: InningsSummary;
  team: SeasonTeamSummary | undefined;
  stand: Stand;
};

function currentInnings(scorecard: MatchScorecard): InningsSummary | null {
  if (scorecard.innings.length === 0) return null;
  return scorecard.innings[scorecard.innings.length - 1] ?? null;
}

function nameOf(innings: InningsSummary, playerId: string): string {
  return innings.batting.find((batter) => batter.playerId === playerId)?.name ?? "batter";
}

function inningsLabel(innings: InningsSummary): string {
  if (innings.superOver) return "Super over";
  return innings.number === 1 ? "1st innings" : "2nd innings";
}

function oversFromBalls(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function strikeRate(runs: number, balls: number): string {
  return balls === 0 ? "—" : ((runs / balls) * 100).toFixed(1);
}

function economy(runs: number, balls: number): string {
  return balls === 0 ? "—" : ((runs / balls) * 6).toFixed(2);
}

function equationText(target: number, innings: InningsSummary, maxBalls: number): string {
  const needed = target - innings.runs;
  const balls = maxBalls - innings.legalBalls;
  if (needed <= 0) return "Target reached";
  return `${needed} needed from ${balls} ball${balls === 1 ? "" : "s"}`;
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]} ${parts[parts.length - 1]}`;
}

function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function overPhase(overNumber: number): string {
  if (overNumber <= 6) return "Powerplay";
  if (overNumber <= 15) return "Middle overs";
  return "Death overs";
}

function currentPartnership(innings: InningsSummary): { runs: number; balls: number } {
  const fall = innings.fallOfWickets[innings.fallOfWickets.length - 1];
  return {
    runs: fall ? innings.runs - fall.runs : innings.runs,
    balls: fall ? innings.legalBalls - fall.legalBalls : innings.legalBalls,
  };
}

function bestStand(innings: InningsSummary): Stand | null {
  if (innings.legalBalls === 0 && innings.fallOfWickets.length === 0) return null;
  const falls = [...innings.fallOfWickets].sort((a, b) => a.wicket - b.wicket);
  const stands: Stand[] = [];
  let previousRuns = 0;
  let previousBalls = 0;
  for (const fall of falls) {
    stands.push({
      runs: fall.runs - previousRuns,
      balls: fall.legalBalls - previousBalls,
      wicket: fall.wicket,
      unbroken: false,
      endedById: fall.playerId,
    });
    previousRuns = fall.runs;
    previousBalls = fall.legalBalls;
  }
  stands.push({
    runs: innings.runs - previousRuns,
    balls: innings.legalBalls - previousBalls,
    wicket: falls.length + 1,
    unbroken: innings.wickets < 10,
    endedById: null,
  });
  return stands.reduce<Stand | null>(
    (best, stand) => (stand.balls > 0 && (!best || stand.runs > best.runs) ? stand : best),
    null,
  );
}

function overRuns(commentary: MatchCommentary[], inningsNumber: number): OverRow[] {
  const map = new Map<number, { over: number; start: number; end: number; wickets: number }>();
  for (const delivery of commentary) {
    if (delivery.inningsNumber !== inningsNumber) continue;
    const row = map.get(delivery.overNumber);
    if (!row) {
      map.set(delivery.overNumber, {
        over: delivery.overNumber,
        start: delivery.scoreRuns - delivery.runsTotal,
        end: delivery.scoreRuns,
        wickets: delivery.isWicket ? 1 : 0,
      });
      continue;
    }
    row.end = delivery.scoreRuns;
    if (delivery.isWicket) row.wickets += 1;
  }
  return [...map.values()]
    .map((row) => ({ over: row.over, runs: row.end - row.start, wickets: row.wickets }))
    .sort((a, b) => a.over - b.over);
}

function lastOversSummary(
  commentary: MatchCommentary[],
  inningsNumber: number,
  count: number,
): { runs: number; wickets: number } {
  const rows = overRuns(commentary, inningsNumber).slice(-count);
  return {
    runs: rows.reduce((sum, row) => sum + row.runs, 0),
    wickets: rows.reduce((sum, row) => sum + row.wickets, 0),
  };
}

function deliveryX(delivery: MatchCommentary): number {
  return delivery.overNumber - 1 + delivery.ballInOver / 6;
}

function wormSeries(commentary: MatchCommentary[], inningsNumber: number): WormPoint[] {
  const deliveries = commentary.filter((delivery) => delivery.inningsNumber === inningsNumber);
  if (deliveries.length === 0) return [];
  const rows = overRuns(commentary, inningsNumber);
  const last = deliveries[deliveries.length - 1];
  const inProgress = last.ballInOver < 6;
  const points: WormPoint[] = [{ x: 0, runs: 0, wickets: 0 }];
  let runs = 0;
  let wickets = 0;
  rows.forEach((row, index) => {
    runs += row.runs;
    wickets += row.wickets;
    if (index === rows.length - 1 && inProgress) return;
    points.push({ x: row.over, runs, wickets });
  });
  if (inProgress) {
    points.push({ x: deliveryX(last), runs: last.scoreRuns, wickets: last.scoreWickets });
  }
  return points;
}

function pathFromPoints(
  points: WormPoint[],
  scaleX: (value: number) => number,
  scaleY: (value: number) => number,
): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${scaleX(point.x).toFixed(1)} ${scaleY(point.runs).toFixed(1)}`)
    .join(" ");
}

function areaFromPoints(
  points: WormPoint[],
  scaleX: (value: number) => number,
  scaleY: (value: number) => number,
): string {
  const line = pathFromPoints(points, scaleX, scaleY);
  const first = points[0];
  const last = points[points.length - 1];
  const baseline = scaleY(0).toFixed(1);
  return `${line} L${scaleX(last.x).toFixed(1)} ${baseline} L${scaleX(first.x).toFixed(1)} ${baseline} Z`;
}

function chaseMeter(
  target: number,
  innings: InningsSummary,
  maxBalls: number,
  ballsLeft: number,
  runsNeeded: number | null,
): number {
  const need = runsNeeded ?? Math.max(0, target - innings.runs);
  if (need <= 0) return 100;
  if (ballsLeft <= 0) return 0;
  const required = (need / ballsLeft) * 6;
  const current = innings.legalBalls > 0 ? (innings.runs / innings.legalBalls) * 6 : required;
  const base = 1 / (1 + Math.exp(-(current - required) * 0.5));
  const resources = Math.max(0, 10 - innings.wickets) / 10;
  const chance = base * (0.45 + 0.65 * resources) * 100;
  return Math.round(Math.min(97, Math.max(3, chance)));
}

function topOfInnings(innings: InningsSummary) {
  return (
    [...innings.batting]
      .filter((batter) => batter.balls > 0)
      .sort((a, b) => b.runs - a.runs)[0] ?? null
  );
}

function bestBowlerOfInnings(innings: InningsSummary) {
  return (
    [...innings.bowling]
      .filter((bowler) => bowler.balls > 0)
      .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0] ?? null
  );
}

function topScorerAcross(innings: InningsSummary[]) {
  let best: { name: string; runs: number; balls: number; teamId: string } | null = null;
  for (const entry of innings) {
    for (const batter of entry.batting) {
      if (batter.balls === 0) continue;
      if (!best || batter.runs > best.runs) {
        best = { name: batter.name, runs: batter.runs, balls: batter.balls, teamId: entry.battingTeamId };
      }
    }
  }
  return best;
}

function bestBowlingAcross(innings: InningsSummary[]) {
  let best: { name: string; wickets: number; runs: number; balls: number; teamId: string } | null = null;
  for (const entry of innings) {
    for (const bowler of entry.bowling) {
      if (bowler.balls === 0) continue;
      if (
        !best ||
        bowler.wickets > best.wickets ||
        (bowler.wickets === best.wickets && bowler.runs < best.runs)
      ) {
        best = {
          name: bowler.name,
          wickets: bowler.wickets,
          runs: bowler.runs,
          balls: bowler.balls,
          teamId: entry.bowlingTeamId,
        };
      }
    }
  }
  return best;
}

function playerOfMatch(scorecard: MatchScorecard) {
  const id = scorecard.result?.playerOfMatchId;
  if (!id) return null;
  for (const innings of scorecard.innings) {
    const bat = innings.batting.find((batter) => batter.playerId === id);
    const bowl = innings.bowling.find((bowler) => bowler.playerId === id);
    if (!bat && !bowl) continue;
    const detail: string[] = [];
    if (bat && bat.balls > 0) detail.push(`${bat.runs} (${bat.balls})`);
    if (bowl && bowl.balls > 0) detail.push(`${bowl.wickets}/${bowl.runs}`);
    return {
      name: bat?.name ?? bowl?.name ?? "Player",
      teamId: bat ? innings.battingTeamId : innings.bowlingTeamId,
      detail: detail.join(" · "),
    };
  }
  return null;
}

function matchesFilter(delivery: MatchCommentary, filter: CommentaryFilter): boolean {
  if (filter === "boundary") return !delivery.isWicket && delivery.runsTotal >= 4;
  if (filter === "wicket") return delivery.isWicket;
  if (filter === "extra") return delivery.extraType !== null;
  return true;
}

function methodLabel(method: string): string {
  switch (method) {
    case "runs":
      return "Margin: runs";
    case "wickets":
      return "Margin: wickets";
    case "super-over":
      return "Super over";
    case "boundary-count":
      return "Boundary count";
    case "tie-break":
      return "Tie-break";
    case "no-result":
      return "No result";
    default:
      return method;
  }
}
