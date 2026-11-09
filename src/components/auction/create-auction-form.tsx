"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { TeamBadge } from "@/components/brand/team-badge";
import { RetentionPicker } from "@/components/auction/retention-picker";
import type { AuctionMode } from "@/lib/auction/modes";
import type { RetentionTeam } from "@/lib/auction/mini2027";
import { formatLakh } from "@/lib/money";
import { RULEBOOK_2026, RULEBOOK_2027 } from "@/lib/rules";
import { cn } from "@/lib/cn";

export type TeamOption = {
  id: string;
  name: string;
  shortName: string;
  city: string;
};

export function CreateAuctionForm({
  modes,
  teams,
  retentionTeams,
  poolUniverseSize,
  aiRetainedByTeam,
  initialMode,
}: {
  modes: AuctionMode[];
  teams: TeamOption[];
  retentionTeams: RetentionTeam[];
  poolUniverseSize: number;
  aiRetainedByTeam: Record<string, number>;
  initialMode?: string;
}) {
  const router = useRouter();
  const [modeId, setModeId] = useState(
    modes.some((mode) => mode.id === initialMode) ? (initialMode as string) : modes[0].id,
  );
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [retainedByTeam, setRetainedByTeam] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const team of retentionTeams) initial[team.teamId] = team.defaultIds;
    return initial;
  });
  const [name, setName] = useState("");
  const [rtmOn, setRtmOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode = modes.find((entry) => entry.id === modeId) ?? modes[0];
  const retentionMode = modeId === "mini-2027";
  const retentionTeam = retentionTeams.find((team) => team.teamId === teamId) ?? null;
  const retainedIds = retainedByTeam[teamId] ?? [];
  const poolLots =
    retentionMode && poolUniverseSize > 0
      ? Math.max(0, poolUniverseSize - (aiRetainedByTeam[teamId] ?? 0) - retainedIds.length)
      : mode.expectedLots;

  async function start() {
    if (starting || !teamId) return;
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modeId,
          userTeamId: teamId,
          name: name.trim() || null,
          retainedPlayerIds: retentionMode ? retainedIds : undefined,
          rtmEnabled: mode.rtmOptional ? rtmOn : undefined,
        }),
      });
      const payload = (await response.json()) as { session?: { id: string }; error?: string };
      if (!response.ok || !payload.session) {
        throw new Error(payload.error ?? "The auction could not be created.");
      }
      router.push(`/auction/${payload.session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The auction could not be created.");
      setStarting(false);
    }
  }

  return (
    <form
      id="create"
      className="surface-card scroll-mt-28 overflow-hidden"
      onSubmit={(event) => {
        event.preventDefault();
        void start();
      }}
    >
      <div className="border-b border-line px-5 py-4 sm:px-7">
        <p className="eyebrow">Set up your room</p>
        <h2 className="mt-2 font-display text-2xl font-bold uppercase tracking-wide">Choose a format</h2>
      </div>

      <fieldset className="border-b border-line px-5 py-5 sm:px-7">
        <legend className="field-label">Auction format</legend>
        <div className="grid gap-2.5 md:grid-cols-2">
          {modes.map((entry) => {
            const active = entry.id === modeId;
            return (
              <label
                key={entry.id}
                className={cn(
                  "relative cursor-pointer rounded-xl border p-4 transition-colors",
                  active
                    ? "border-accent/60 bg-accent/5"
                    : "border-line bg-surface2/40 hover:border-lineStrong hover:bg-surface2",
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  value={entry.id}
                  checked={active}
                  onChange={() => setModeId(entry.id)}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-lg font-semibold uppercase leading-tight tracking-wide">
                    {entry.name}
                  </span>
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full border"
                    style={{
                      borderColor: active ? entry.accent : "var(--lineStrong)",
                      background: active ? entry.accent : "transparent",
                      boxShadow: active ? `inset 0 0 0 2px var(--surface)` : undefined,
                    }}
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1.5 block text-[0.78rem] leading-relaxed text-muted">
                  {entry.tagline}
                </span>
                <span className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="chip">{entry.expectedLots} lots</span>
                  <span className="chip">{entry.difficulty}</span>
                  {(entry.rtmEnabled || entry.rtmOptional) && (
                    <span className="chip chip-gold">{entry.rtmOptional ? "RTM optional" : "RTM"}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {mode.rtmOptional && (
        <fieldset className="border-b border-line px-5 py-5 sm:px-7">
          <legend className="field-label">Right to Match</legend>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-surface2/40 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Enable RTM cards</span>
              <span className="mt-0.5 block text-[0.72rem] text-muted">
                {rtmOn
                  ? "Each franchise gets six cards. Eligibility follows the player's 2026 franchise."
                  : "Off: every player goes to the highest bidder."}
              </span>
            </span>
            <span className="relative inline-flex shrink-0">
              <input
                type="checkbox"
                checked={rtmOn}
                onChange={(event) => setRtmOn(event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "h-6 w-11 rounded-full border transition-colors",
                  rtmOn ? "border-accent bg-accent" : "border-lineStrong bg-surface3",
                )}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  rtmOn && "translate-x-5",
                )}
              />
            </span>
          </label>
        </fieldset>
      )}

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
                  name="team"
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

      <div className="border-b border-line px-5 py-5 sm:px-7">
        <label htmlFor="session-name" className="field-label">
          Room name <span className="font-normal normal-case tracking-normal text-faint">(optional)</span>
        </label>
        <input
          id="session-name"
          className="input"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Friday night RTM war"
        />
      </div>

      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted sm:grid-cols-4">
          <span>
            Purse{" "}
            <strong className="num text-fg">
              {formatLakh(mode.id === "mini-2027" ? RULEBOOK_2027.purseCapLakh : RULEBOOK_2026.purseCapLakh)}
            </strong>
          </span>
          <span>
            Pool <strong className="num text-fg">{poolLots}</strong>
          </span>
          <span>
            RTM{" "}
            <strong className="text-fg">
              {mode.rtmOptional ? (rtmOn ? "6 cards" : "Off") : mode.rtmEnabled ? "6 cards" : "Off"}
            </strong>
          </span>
          <span>
            Evidence <strong className="text-fg">{mode.asOfSeason}</strong>
          </span>
        </div>
        <button type="submit" className="btn btn-primary" disabled={starting || !teamId}>
          {starting ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Preparing lots…
            </>
          ) : (
            <>
              Open the auction <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 border-t border-danger/30 bg-danger/5 px-5 py-3 text-xs text-danger sm:px-7">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </form>
  );
}
