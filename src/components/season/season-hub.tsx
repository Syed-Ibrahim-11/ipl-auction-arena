"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Award,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Crown,
  Flame,
  GitBranch,
  Loader2,
  MapPin,
  Play,
  Shield,
  Sparkles,
  Swords,
  Table2,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { TeamBadge } from "@/components/brand/team-badge";
import { FormPips } from "@/components/ui";
import { fetchSeasonSnapshot, formatSeasonDate, postSeasonAction } from "@/components/season/api";
import { loadSeat } from "@/lib/auction/seat-storage";
import type {
  SeasonAward,
  SeasonFixtureSummary,
  SeasonSnapshot,
  SeasonTeamSummary,
} from "@/lib/season/types";
import { cn } from "@/lib/cn";

type TabId = "fixtures" | "table" | "playoffs" | "awards";
type FixtureFilter = "mine" | "upcoming" | "results" | "all";

const TABS: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: "fixtures", label: "Season", icon: <CalendarDays size={15} /> },
  { id: "table", label: "Table", icon: <Table2 size={15} /> },
  { id: "playoffs", label: "Playoffs", icon: <GitBranch size={15} /> },
  { id: "awards", label: "Awards", icon: <Award size={15} /> },
];

const AWARD_ICONS: Record<string, ReactNode> = {
  mvp: <Sparkles size={16} />,
  runs: <Flame size={16} />,
  wickets: <CircleDot size={16} />,
  "strike-rate": <Zap size={16} />,
  economy: <Shield size={16} />,
  sixes: <Swords size={16} />,
  fielding: <Users size={16} />,
  franchise: <Trophy size={16} />,
};

export function SeasonHub({ initial }: { initial: SeasonSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [seatToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : (loadSeat(initial.season.sessionId)?.token ?? null),
  );
  const [tab, setTab] = useState<TabId>("fixtures");
  const [filter, setFilter] = useState<FixtureFilter>("mine");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { season, userTeam, standings } = snapshot;
  const sessionId = season.sessionId;
  const viewerTeamId = snapshot.viewer.teamId;
  const userRow = standings.find((row) => row.teamId === viewerTeamId);
  const completed = season.status === "completed";
  const playable = snapshot.fixtures.filter(
    (fixture) => fixture.status !== "completed" && fixture.homeTeamId && fixture.awayTeamId,
  );
  const aiPlayable = playable.filter((fixture) => !fixture.hasHuman);
  const nextDate = [...playable].map((fixture) => fixture.date).sort()[0] ?? null;
  const matchdayIncludesUser = playable.some(
    (fixture) => fixture.date === nextDate && fixture.isUserMatch,
  );
  const votes = snapshot.advanceVotes;

  useEffect(() => {
    if (!seatToken) return;
    let cancelled = false;
    void fetchSeasonSnapshot(sessionId, seatToken)
      .then((next) => {
        if (!cancelled && next) setSnapshot(next);
      })
      .catch(() => {
        // Keep the server-rendered snapshot; the next action retries with the seat.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, seatToken]);

  // Simulation agreements and other managers' results have to land without a
  // manual refresh, so an active season polls its snapshot while visible.
  useEffect(() => {
    if (!seatToken || snapshot.season.status !== "active") return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void fetchSeasonSnapshot(sessionId, seatToken)
        .then((next) => {
          if (next) setSnapshot(next);
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [sessionId, seatToken, snapshot.season.status]);

  async function run(key: string, action: Parameters<typeof postSeasonAction>[1]) {
    setBusy(key);
    setError(null);
    try {
      const next = await postSeasonAction(sessionId, action, seatToken);
      setSnapshot(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The season action could not be applied.");
    } finally {
      setBusy(null);
    }
  }

  function advance(scope: "other" | "matchday" | "league" | "season") {
    void run(`advance-${scope}`, { type: "advance", scope });
  }

  return (
    <div className="space-y-6">
      <section
        className="relative overflow-hidden rounded-[22px] border border-line shadow-[var(--shadow)]"
        style={{
          background: `radial-gradient(900px 420px at 12% -20%, ${userTeam?.primary ?? "#ff7a1a"}33, transparent 62%), linear-gradient(115deg, ${userTeam?.secondary ?? "#122033"}55, var(--surface) 62%)`,
        }}
      >
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.03))] lg:block" />
        <div className="relative px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip chip-gold">
                  <Crown size={12} /> Franchise Director · Season {season.year}
                </span>
                <span className={cn("chip", completed ? "chip-success" : "chip-info")}>
                  {completed ? "Season complete" : snapshot.progress.stageLabel}
                </span>
                <span className="chip">Ratings as of {season.asOfSeason}</span>
              </div>
              <div className="mt-4 flex items-center gap-4">
                {userTeam && <TeamBadge teamId={userTeam.id} size={56} />}
                <div className="min-w-0">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-faint">
                    {userTeam?.city ?? "Your franchise"}
                  </p>
                  <h1 className="font-display text-[clamp(2.4rem,5vw,4rem)] font-bold uppercase leading-[0.92] tracking-[0.01em]">
                    {userTeam?.name ?? "Your team"}
                  </h1>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                <span className="flex items-center gap-1.5">
                  <Trophy size={14} className="text-gold" />
                  <span className="font-semibold text-fg">{userRow?.position ?? "—"}</span> in the table
                </span>
                <span className="num">
                  <span className="font-semibold text-fg">{userRow?.won ?? 0}</span>W ·{" "}
                  <span className="font-semibold text-fg">{userRow?.lost ?? 0}</span>L
                  {userRow?.tied ? ` · ${userRow.tied}T` : ""}
                  {userRow?.noResult ? ` · ${userRow.noResult}NR` : ""}
                </span>
                <span className="num">
                  <span className="font-semibold text-fg">{userRow?.points ?? 0}</span> pts · NRR{" "}
                  {userRow ? formatNrr(userRow.nrr) : "—"}
                </span>
                <span>Squad {userTeam?.squadSize ?? 0} · XI OVR {userTeam?.playingXiOvr ?? "—"}</span>
              </div>
              <div className="mt-5 max-w-xl">
                <div className="flex items-center justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-faint">
                  <span>League progress</span>
                  <span className="num">
                    {snapshot.progress.leaguePlayed} / {snapshot.progress.leagueTotal}
                  </span>
                </div>
                <div className="progress-track mt-2" aria-hidden="true">
                  <div
                    className="progress-fill"
                    style={{ width: `${snapshot.progress.percent}%`, background: "var(--gold)" }}
                  />
                </div>
                <p className="mt-2 text-[0.68rem] text-faint">
                  {playoffLine(snapshot)} · {snapshot.progress.playoffsPlayed} of{" "}
                  {snapshot.progress.playoffsTotal} playoff matches played
                </p>
              </div>
            </div>

            <NextMatchCard snapshot={snapshot} busy={busy} onAdvance={advance} />
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {!snapshot.viewer.canAct && !completed && (
        <p className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-muted">
          You are viewing {snapshot.viewer.teamName ?? "a franchise"} without a seat token. Open your
          auction invite again to take the seat before acting on the season.
        </p>
      )}

      {completed && snapshot.champion && (
        <ChampionBanner champion={snapshot.champion} snapshot={snapshot} />
      )}

      {!completed && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickControl
          title="Play other results"
          description="Simulate AI fixtures matchday by matchday, stopping at the next human match."
          icon={<Play size={16} />}
          label={busy === "advance-other" ? "Simulating" : "Advance AI games"}
          busy={busy === "advance-other"}
          disabled={busy !== null || completed || aiPlayable.length === 0 || !snapshot.viewer.canAct}
          onClick={() => advance("other")}
        />
        <QuickControl
          title="Sim matchday"
          description={
            matchdayIncludesUser
              ? "Simulate the AI fixtures on the next date. Your head-to-head stays ready to play."
              : "Simulate every AI fixture on the next scheduled date, then stop."
          }
          icon={<CalendarDays size={16} />}
          label={busy === "advance-matchday" ? "Simulating" : "Play matchday"}
          busy={busy === "advance-matchday"}
          disabled={busy !== null || completed || aiPlayable.length === 0 || !snapshot.viewer.canAct}
          onClick={() => advance("matchday")}
        />
        <QuickControl
          title="Sim league"
          description={
            votes.required > 1
              ? `Every manager must agree. AI fixtures run matchday by matchday until the next human match. ${votes.league > 0 ? `Agreed: ${votes.league} of ${votes.required}.` : ""}`
              : "Run every remaining AI league fixture, one matchday at a time."
          }
          icon={<Table2 size={16} />}
          label={
            busy === "advance-league"
              ? "Simulating"
              : votes.viewer.league
                ? `Agreed · ${votes.league}/${votes.required}`
                : "Finish league"
          }
          busy={busy === "advance-league"}
          disabled={
            busy !== null || completed || aiPlayable.length === 0 || !snapshot.viewer.canAct || votes.viewer.league
          }
          onClick={() => advance("league")}
        />
        <QuickControl
          title="Sim season"
          description={
            votes.required > 1
              ? `Every manager must agree. Playoffs follow the same matchday order. ${votes.season > 0 ? `Agreed: ${votes.season} of ${votes.required}.` : ""}`
              : "Play out all remaining AI fixtures, playoffs, final and awards."
          }
          icon={<FastForwardIcon />}
          label={
            busy === "advance-season"
              ? "Simulating"
              : votes.viewer.season
                ? `Agreed · ${votes.season}/${votes.required}`
                : "Finish season"
          }
          busy={busy === "advance-season"}
          disabled={
            busy !== null || completed || aiPlayable.length === 0 || !snapshot.viewer.canAct || votes.viewer.season
          }
          onClick={() => advance("season")}
        />
        </div>
      )}

      {(votes.league > 0 || votes.season > 0) && !completed && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-[0.72rem] text-muted">
          <span className="font-semibold uppercase tracking-[0.12em] text-gold">Simulation agreement</span>
          {votes.league > 0 && (
            <span>
              League: <span className="num font-semibold text-fg">{votes.league}</span> of {votes.required} managers
            </span>
          )}
          {votes.season > 0 && (
            <span>
              Season: <span className="num font-semibold text-fg">{votes.season}</span> of {votes.required} managers
            </span>
          )}
          <span>Everyone in the room has to agree before it runs.</span>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/60 p-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition",
                tab === entry.id
                  ? "bg-accent text-accentInk"
                  : "text-muted hover:bg-surface2 hover:text-fg",
              )}
              aria-pressed={tab === entry.id}
            >
              {entry.icon} {entry.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/auction/${sessionId}/season/squad`} className="btn btn-ghost btn-sm">
            <Users size={14} /> XI &amp; tactics
          </Link>
          <Link href={`/auction/${sessionId}/recap`} className="btn btn-ghost btn-sm">
            Auction recap
          </Link>
        </div>
      </div>

      {tab === "fixtures" && (
        <FixturesPanel snapshot={snapshot} filter={filter} setFilter={setFilter} />
      )}
      {tab === "table" && <TablePanel snapshot={snapshot} />}
      {tab === "playoffs" && <PlayoffsPanel snapshot={snapshot} />}
      {tab === "awards" && <AwardsPanel snapshot={snapshot} />}
    </div>
  );
}

function NextMatchCard({
  snapshot,
  busy,
  onAdvance,
}: {
  snapshot: SeasonSnapshot;
  busy: string | null;
  onAdvance: (scope: "other" | "matchday") => void;
}) {
  const sessionId = snapshot.season.sessionId;
  const live = snapshot.liveFixture;
  const fixture = live ?? snapshot.nextUserFixture;
  const champion = snapshot.champion;
  return (
    <aside className="w-full shrink-0 rounded-2xl border border-line bg-bg2/70 p-4 backdrop-blur-sm xl:w-[360px]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">
          {live ? "Live now" : champion ? "Season finished" : "Your next fixture"}
        </p>
        {fixture && (
          <span className={cn("chip", live ? "chip-accent" : fixture.status === "completed" ? "chip-success" : fixture.isHumanMatch ? "chip-gold" : "chip-info")}>
            {live
              ? "In progress"
              : fixture.stage === "league"
                ? `Match ${fixture.matchNumber}`
                : fixture.stage}
          </span>
        )}
      </div>
      {fixture ? (
        <>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <TeamLine id={fixture.homeTeamId} name={fixture.homeTeamShort} score={fixture.homeScore} userTeamId={snapshot.viewer.teamId} />
            <span className="font-display text-xs font-bold uppercase tracking-[0.16em] text-faint">vs</span>
            <TeamLine id={fixture.awayTeamId} name={fixture.awayTeamShort} score={fixture.awayScore} userTeamId={snapshot.viewer.teamId} align="right" />
          </div>
          {fixture.isHumanMatch && fixture.status !== "completed" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={cn("chip", fixture.homeReady ? "chip-success" : "chip-info")}>
                {fixture.homeTeamShort ?? "Home"} {fixture.homeReady ? "ready" : "not ready"}
              </span>
              <span className={cn("chip", fixture.awayReady ? "chip-success" : "chip-info")}>
                {fixture.awayTeamShort ?? "Away"} {fixture.awayReady ? "ready" : "not ready"}
              </span>
              <span className="text-[0.62rem] text-faint">Both managers must ready up before toss.</span>
            </div>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-muted">
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={12} /> {formatSeasonDate(fixture.date)}
            </span>
            {fixture.venue && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} /> {fixture.venue}
              </span>
            )}
          </p>
          {fixture.resultSummary && (
            <p
              className={cn(
                "mt-2 rounded-lg border border-line bg-surface2/70 px-3 py-2 text-xs font-medium",
                fixture.winnerTeamId === snapshot.viewer.teamId
                  ? "text-success"
                  : fixture.winnerTeamId
                    ? "text-danger"
                    : "text-muted",
              )}
            >
              {fixture.resultSummary}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/auction/${sessionId}/season/match/${fixture.id}`}
              className="btn btn-primary btn-sm"
            >
              {live ? "Resume match" : "Take charge"} <ArrowRight size={14} />
            </Link>
            <Link href={`/auction/${sessionId}/season/squad`} className="btn btn-outline btn-sm">
              Manage XI
            </Link>
          </div>
          {!live && (
            <button
              type="button"
              onClick={() => onAdvance("other")}
              disabled={busy !== null || !snapshot.viewer.canAct}
              className="mt-3 inline-flex items-center gap-1.5 text-[0.68rem] font-semibold text-muted hover:text-accent2"
            >
              <Play size={11} /> Simulate other games before this one
            </button>
          )}
        </>
      ) : champion ? (
        <div className="mt-4">
          <p className="font-display text-2xl font-bold uppercase leading-none text-gold">
            {champion.shortName} are champions
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            The {snapshot.season.year} season is complete. Review the final, the awards and every
            scorecard.
          </p>
          <Link href={`/auction/${sessionId}/season/squad`} className="btn btn-outline btn-sm mt-4">
            <Users size={14} /> Review the squad
          </Link>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Your campaign is over for this season. Simulate the remaining fixtures to crown a champion.
        </p>
      )}
    </aside>
  );
}

function TeamLine({
  id,
  name,
  score,
  userTeamId,
  align = "left",
}: {
  id: string | null;
  name: string | null;
  score: string | null;
  userTeamId: string;
  align?: "left" | "right";
}) {
  const isUser = id === userTeamId;
  return (
    <div className={cn("flex flex-col gap-1", align === "right" ? "items-end text-right" : "items-start")}>
      <div className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse")}>
        {id ? <TeamBadge teamId={id} size={28} /> : <span className="h-7 w-7 rounded-full border border-line" />}
        <span className={cn("font-display text-lg font-bold uppercase leading-none", isUser && "text-accent2")}>
          {name ?? "TBD"}
        </span>
      </div>
      <span className="num text-[0.7rem] text-muted">{score ?? "—"}</span>
    </div>
  );
}

function QuickControl({
  title,
  description,
  icon,
  label,
  busy,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="panel flex flex-col p-4">
      <p className="flex items-center gap-2 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-accent2">
        {icon} {title}
      </p>
      <p className="mt-2 flex-1 text-[0.72rem] leading-relaxed text-muted">{description}</p>
      <button
        type="button"
        className="btn btn-ghost btn-sm mt-3 w-full"
        onClick={onClick}
        disabled={disabled}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
        {label}
      </button>
    </div>
  );
}

function FastForwardIcon() {
  return (
    <span className="inline-flex" aria-hidden="true">
      <ChevronRight size={16} className="-mr-1.5" />
      <ChevronRight size={16} />
    </span>
  );
}

function FixturesPanel({
  snapshot,
  filter,
  setFilter,
}: {
  snapshot: SeasonSnapshot;
  filter: FixtureFilter;
  setFilter: (filter: FixtureFilter) => void;
}) {
  const sessionId = snapshot.season.sessionId;
  const [expanded, setExpanded] = useState(false);
  const fixtures = useMemo(() => {
    const all = [...snapshot.fixtures].sort(
      (a, b) => a.date.localeCompare(b.date) || a.matchNumber - b.matchNumber,
    );
    if (filter === "mine") return all.filter((fixture) => fixture.isUserMatch);
    if (filter === "upcoming") return all.filter((fixture) => fixture.status !== "completed");
    if (filter === "results") return all.filter((fixture) => fixture.status === "completed").reverse();
    return all;
  }, [snapshot.fixtures, filter]);
  const collapsedCount = filter === "mine" ? 3 : 12;
  const visible = expanded ? fixtures : fixtures.slice(0, collapsedCount);

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Fixtures</p>
          <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">
            {filter === "mine"
              ? "Your campaign"
              : filter === "upcoming"
                ? "Still to play"
                : filter === "results"
                  ? "Completed matches"
                  : "Every fixture"}
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([
            ["mine", "My matches"],
            ["upcoming", "Upcoming"],
            ["results", "Results"],
            ["all", "All 74"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setFilter(id);
                setExpanded(false);
              }}
              className={cn(
                "chip",
                filter === id ? "border-accent/50 bg-accent/15 text-accent2" : "hover:text-fg",
              )}
              aria-pressed={filter === id}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ol className="divide-y divide-line/70">
        {visible.map((fixture) => (
          <FixtureRow key={fixture.id} fixture={fixture} sessionId={sessionId} userTeamId={snapshot.viewer.teamId} />
        ))}
        {visible.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-faint">No fixtures match this filter.</li>
        )}
      </ol>
      {fixtures.length > collapsedCount && (
        <div className="border-t border-line px-5 py-3 text-center">
          <button
            type="button"
            className="link-arrow"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                Show less <ChevronUp size={14} />
              </>
            ) : (
              <>
                Show all {fixtures.length} <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}

function FixtureRow({
  fixture,
  sessionId,
  userTeamId,
}: {
  fixture: SeasonFixtureSummary;
  sessionId: string;
  userTeamId: string;
}) {
  const isUser = fixture.isUserMatch;
  const canOpen = fixture.hasState || fixture.status === "completed" || isUser;
  const userWon = isUser && fixture.winnerTeamId !== null && fixture.winnerTeamId === userTeamId;
  const userLost = isUser && fixture.winnerTeamId !== null && fixture.winnerTeamId !== userTeamId;
  const resultTone = userWon ? "text-success" : userLost ? "text-danger" : "text-muted";
  const content = (
    <div
      className={cn(
        "flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        isUser && "bg-accent/[0.045]",
        canOpen && "transition hover:bg-surface2/60",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="w-12 shrink-0 text-center">
          <p className="num font-display text-lg font-bold leading-none">
            {fixture.stage === "league" ? fixture.matchNumber : stageShort(fixture.stage)}
          </p>
          <p className="mt-0.5 text-[0.55rem] uppercase tracking-[0.08em] text-faint">
            {formatSeasonDate(fixture.date)}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <MiniTeam id={fixture.homeTeamId} short={fixture.homeTeamShort} userTeamId={userTeamId} />
            <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-faint">v</span>
            <MiniTeam id={fixture.awayTeamId} short={fixture.awayTeamShort} userTeamId={userTeamId} />
            {isUser && <span className="chip chip-accent">You</span>}
            {fixture.stage !== "league" && <span className="chip chip-gold">{fixture.stage}</span>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.62rem] text-faint">
            {fixture.venue ?? "Venue TBD"}
            {fixture.homeScore && <span className="num text-muted">· {fixture.homeScore}</span>}
            {fixture.awayScore && <span className="num text-muted">/ {fixture.awayScore}</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-[3.75rem] sm:pl-0">
        {fixture.status === "completed" && fixture.resultSummary ? (
          <span className={cn("text-right text-[0.7rem] font-medium", resultTone)}>{fixture.resultSummary}</span>
        ) : fixture.status === "live" ? (
          <span className="chip chip-accent">Live</span>
        ) : fixture.status === "completed" && fixture.homeScore && fixture.awayScore ? (
          <span className={cn("text-right text-[0.7rem] font-medium", resultTone)}>
            {fixture.homeTeamShort} {fixture.homeScore} · {fixture.awayTeamShort} {fixture.awayScore}
          </span>
        ) : (
          <span className="chip">Scheduled</span>
        )}
        {canOpen && <ChevronRight size={15} className="shrink-0 text-faint" />}
      </div>
    </div>
  );
  return (
    <li>
      {canOpen ? (
        <Link href={`/auction/${sessionId}/season/match/${fixture.id}`} className="block">
          {content}
        </Link>
      ) : (
        content
      )}
    </li>
  );
}

function MiniTeam({ id, short, userTeamId }: { id: string | null; short: string | null; userTeamId: string }) {
  if (!id) return <span className="font-display text-sm font-bold uppercase text-faint">TBD</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <TeamBadge teamId={id} size={18} />
      <span className={cn("font-display text-sm font-bold uppercase tracking-wide", id === userTeamId && "text-accent2")}>
        {short}
      </span>
    </span>
  );
}

function TablePanel({ snapshot }: { snapshot: SeasonSnapshot }) {
  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="eyebrow">League table</p>
          <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">The race for the top four</h2>
        </div>
        <span className="chip">
          {snapshot.progress.leaguePlayed} of {snapshot.progress.leagueTotal} league matches
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[760px]">
          <thead>
            <tr>
              <th className="w-10 text-center">#</th>
              <th>Franchise</th>
              <th className="text-center">P</th>
              <th className="text-center">W</th>
              <th className="text-center">L</th>
              <th className="text-center">T</th>
              <th className="text-center">NR</th>
              <th className="text-right">Pts</th>
              <th className="text-right">NRR</th>
              <th>Form</th>
              <th className="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.standings.map((row) => (
              <tr key={row.teamId} className={cn(row.teamId === snapshot.viewer.teamId && "bg-accent/[0.06]")}>
                <td className="num text-center font-display text-lg font-bold">{row.position}</td>
                <td>
                  <span className="flex items-center gap-2">
                    <TeamBadge teamId={row.teamId} size={22} />
                    <span className={cn("font-medium", row.teamId === snapshot.viewer.teamId && "text-accent2")}>
                      {row.teamName}
                    </span>
                    {row.teamId === snapshot.viewer.teamId && <span className="chip chip-accent">You</span>}
                  </span>
                </td>
                <td className="num text-center">{row.played}</td>
                <td className="num text-center">{row.won}</td>
                <td className="num text-center">{row.lost}</td>
                <td className="num text-center">{row.tied}</td>
                <td className="num text-center">{row.noResult}</td>
                <td className="num text-right font-semibold">{row.points}</td>
                <td className={cn("num text-right", row.nrr >= 0 ? "text-success" : "text-danger")}>
                  {formatNrr(row.nrr)}
                </td>
                <td><FormPips form={row.form} /></td>
                <td className="text-center">
                  {row.qualification === "q1" ? (
                    <span className="chip chip-success">Q1</span>
                  ) : row.qualification === "eliminator" ? (
                    <span className="chip chip-gold">Eliminator</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-[0.65rem] leading-relaxed text-faint">
        Two points for a win, one for a tie or a no-result. NRR uses all 20 overs when a side is bowled out
        and ignores abandoned matches. The top two qualify for Qualifier 1; positions three and four contest
        the Eliminator. Status appears once the league stage is complete.
      </p>
    </section>
  );
}

function PlayoffsPanel({ snapshot }: { snapshot: SeasonSnapshot }) {
  const playoffFixtures = snapshot.fixtures.filter((fixture) => fixture.stage !== "league");
  const q1 = playoffFixtures.find((fixture) => fixture.stage === "Qualifier 1");
  const elim = playoffFixtures.find((fixture) => fixture.stage === "Eliminator");
  const q2 = playoffFixtures.find((fixture) => fixture.stage === "Qualifier 2");
  const final = playoffFixtures.find((fixture) => fixture.stage === "Final");
  if (!q1 || !elim || !q2 || !final) return null;
  const champion = snapshot.champion;
  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <p className="eyebrow">The bracket</p>
        <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">Four matches. One trophy.</h2>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted">
          The top two meet in Qualifier 1. Their loser gets a second life in Qualifier 2 against the
          Eliminator winner. The two winners contest the final. Home sides are seeded from the league table.
        </p>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <div className="space-y-4">
          <BracketCard fixture={q1} label="Qualifier 1" hint="1st vs 2nd · winner goes to the final" sessionId={snapshot.season.sessionId} />
          <BracketCard fixture={elim} label="Eliminator" hint="3rd vs 4th · loser is out" sessionId={snapshot.season.sessionId} />
        </div>
        <div className="space-y-4">
          <BracketCard fixture={q2} label="Qualifier 2" hint="Q1 loser vs Eliminator winner" sessionId={snapshot.season.sessionId} />
          <BracketCard fixture={final} label="Final" hint="Qualifier 1 winner vs Qualifier 2 winner" sessionId={snapshot.season.sessionId} />
        </div>
      </div>
      {champion && (
        <div className="border-t border-gold/30 bg-gold/5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Crown size={20} className="text-gold" />
            <p className="font-display text-xl font-bold uppercase tracking-wide text-gold">
              {champion.name} · 2026 champions
            </p>
            <span className="chip chip-gold">{snapshot.season.completedAt ? "Season complete" : "Champion"}</span>
          </div>
        </div>
      )}
      {!snapshot.standings.some((row) => row.qualification !== "none") && (
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          The bracket fills automatically when the 70-match league stage is complete.
        </p>
      )}
    </section>
  );
}

function BracketCard({
  fixture,
  label,
  hint,
  sessionId,
}: {
  fixture: SeasonFixtureSummary;
  label: string;
  hint: string;
  sessionId: string;
}) {
  const homeWon = fixture.winnerTeamId !== null && fixture.winnerTeamId === fixture.homeTeamId;
  const awayWon = fixture.winnerTeamId !== null && fixture.winnerTeamId === fixture.awayTeamId;
  return (
    <Link
      href={`/auction/${sessionId}/season/match/${fixture.id}`}
      className="block rounded-2xl border border-line bg-bg2/60 p-4 transition hover:border-accent/40"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-gold">{label}</p>
        <span className={cn("chip", fixture.status === "completed" ? "chip-success" : fixture.status === "live" ? "chip-accent" : "")}>
          {fixture.status === "completed" ? "Complete" : fixture.status === "live" ? "Live" : formatSeasonDate(fixture.date)}
        </span>
      </div>
      <p className="mt-1 text-[0.62rem] text-faint">{hint}</p>
      <div className="mt-3 space-y-2">
        <BracketTeam
          id={fixture.homeTeamId}
          name={fixture.homeTeamName}
          short={fixture.homeTeamShort}
          score={fixture.homeScore}
          won={homeWon}
        />
        <BracketTeam
          id={fixture.awayTeamId}
          name={fixture.awayTeamName}
          short={fixture.awayTeamShort}
          score={fixture.awayScore}
          won={awayWon}
        />
      </div>
      {fixture.resultSummary ? (
        <p className="mt-3 border-t border-line pt-2 text-[0.7rem] font-medium text-success">{fixture.resultSummary}</p>
      ) : (
        <p className="mt-3 border-t border-line pt-2 text-[0.65rem] text-faint">
          {fixture.homeTeamId ? `${fixture.venue ?? "Venue TBD"} · ${formatSeasonDate(fixture.date)}` : "Awaiting qualifiers"}
        </p>
      )}
    </Link>
  );
}

function BracketTeam({
  id,
  name,
  short,
  score,
  won,
}: {
  id: string | null;
  name: string | null;
  short: string | null;
  score: string | null;
  won: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-lg px-2 py-1.5", won && "bg-success/10")}>
      <span className="flex min-w-0 items-center gap-2">
        {id ? <TeamBadge teamId={id} size={20} /> : <span className="h-5 w-5 rounded-full border border-line" />}
        <span className={cn("truncate text-sm", won ? "font-semibold text-fg" : "text-muted")}>
          {name ?? "To be decided"}
        </span>
        {short && <span className="chip">{short}</span>}
      </span>
      <span className={cn("num text-xs", won ? "font-semibold text-success" : "text-muted")}>{score ?? "—"}</span>
    </div>
  );
}

function AwardsPanel({ snapshot }: { snapshot: SeasonSnapshot }) {
  return (
    <div className="space-y-4">
      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="eyebrow">Season honours</p>
            <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide">
              {snapshot.season.status === "completed" ? "The winners" : "Leaders so far"}
            </h2>
          </div>
          <span className="chip">{snapshot.progress.totalPlayed} matches counted</span>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {snapshot.awards.map((award) => (
            <AwardCard key={award.id} award={award} />
          ))}
        </div>
        <p className="border-t border-line px-5 py-3 text-[0.65rem] leading-relaxed text-faint">
          Awards are computed from simulated scorecards only. Strike-rate and economy awards use minimum
          samples of 120 balls. The MVP formula weights runs, boundaries, wickets, dot balls and fielding
          dismissals; it is a simulator metric, not an official award.
        </p>
      </section>
      {snapshot.season.status === "completed" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="panel p-5">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-gold">Champion</p>
            <div className="mt-3 flex items-center gap-3">
              {snapshot.champion && <TeamBadge teamId={snapshot.champion.id} size={40} />}
              <div>
                <p className="font-display text-2xl font-bold uppercase">{snapshot.champion?.name ?? "—"}</p>
                <p className="mt-1 text-xs text-muted">{snapshot.champion?.city ?? "IPL 2026"}</p>
              </div>
            </div>
          </div>
          <div className="panel p-5">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">Your finish</p>
            <p className="mt-3 font-display text-2xl font-bold uppercase">
              {snapshot.userTeam?.isChampion
                ? "Champions"
                : snapshot.standings.find((row) => row.teamId === snapshot.viewer.teamId)?.position
                  ? `${snapshot.standings.find((row) => row.teamId === snapshot.viewer.teamId)?.position} in the table`
                  : "Season complete"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {snapshot.userTeam?.isChampion
                ? "The trophy is yours."
                : "Review your campaign and start another auction to build a different squad."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function AwardCard({ award }: { award: SeasonAward }) {
  return (
    <div className="rounded-xl border border-line bg-bg2/60 p-4">
      <div className="flex items-center gap-2 text-accent2">
        {AWARD_ICONS[award.id] ?? <Award size={16} />}
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.1em]">{award.label}</p>
      </div>
      <p className="mt-3 font-display text-xl font-bold uppercase leading-none">{award.playerName}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="chip">{award.teamShort}</span>
        <span className="num text-sm font-semibold text-gold">{award.value}</span>
      </div>
      <p className="mt-2 text-[0.66rem] leading-relaxed text-faint">{award.detail}</p>
    </div>
  );
}

function ChampionBanner({ champion, snapshot }: { champion: SeasonTeamSummary; snapshot: SeasonSnapshot }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-gold/40 bg-[linear-gradient(110deg,rgba(245,198,91,0.16),rgba(245,198,91,0.03))] px-5 py-6 sm:px-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/40 bg-gold/10">
            <Crown size={28} className="text-gold" />
          </div>
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-gold">
              IPL 2026 champions
            </p>
            <h2 className="mt-1 font-display text-[clamp(1.8rem,4vw,2.8rem)] font-bold uppercase leading-none">
              {champion.name}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {snapshot.standings.find((row) => row.teamId === champion.id)?.won ?? 0} wins ·{" "}
              {snapshot.season.year} season · {snapshot.progress.totalPlayed} matches played
            </p>
          </div>
        </div>
        <Link
          href={`/auction/${snapshot.season.sessionId}/season/match/${snapshot.fixtures.find((fixture) => fixture.stage === "Final")?.id ?? ""}`}
          className="btn btn-outline btn-sm"
        >
          <Trophy size={14} /> View the final
        </Link>
      </div>
    </section>
  );
}

function formatNrr(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function stageShort(stage: string): string {
  if (stage === "Qualifier 1") return "Q1";
  if (stage === "Qualifier 2") return "Q2";
  if (stage === "Eliminator") return "EL";
  if (stage === "Final") return "F";
  return stage;
}

function playoffLine(snapshot: SeasonSnapshot): string {
  if (snapshot.season.status === "completed") return "Season complete";
  if (snapshot.progress.leaguePlayed < snapshot.progress.leagueTotal) {
    return `Matchweek ${Math.floor(snapshot.progress.leaguePlayed / 5) + 1}`;
  }
  return "Playoffs";
}
