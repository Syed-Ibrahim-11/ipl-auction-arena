"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, X } from "lucide-react";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import { OvrBadge, RoleChip } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { PlayerProfile } from "@/lib/data/queries";
import { formatLakh } from "@/lib/money";

type PoolEntry = {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  teamShort: string | null;
  ovr: number | null;
};

const COLORS = ["var(--accent)", "var(--info)", "var(--success)"];

function radarPoints(values: number[], radius: number, center = 120): string {
  const angles = [-90, 150, 30];
  return values
    .map((value, index) => {
      const angle = (angles[index] * Math.PI) / 180;
      const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
      return `${(center + r * Math.cos(angle)).toFixed(1)},${(center + r * Math.sin(angle)).toFixed(1)}`;
    })
    .join(" ");
}

function CompareRadar({ profiles }: { profiles: PlayerProfile[] }) {
  return (
    <svg
      viewBox="0 0 240 220"
      className="mx-auto w-full max-w-[340px]"
      role="img"
      aria-label={`Rating comparison for ${profiles.map((profile) => profile.player.name).join(", ")}`}
    >
      {[25, 50, 75, 100].map((level) => (
        <polygon
          key={level}
          points={radarPoints([level, level, level], 80)}
          fill="none"
          stroke="var(--line)"
          strokeWidth={level === 100 ? 1.2 : 0.7}
          strokeDasharray={level === 100 ? undefined : "3 4"}
        />
      ))}
      {[-90, 150, 30].map((angle) => {
        const radians = (angle * Math.PI) / 180;
        return (
          <line
            key={angle}
            x1="120"
            y1="120"
            x2={120 + 80 * Math.cos(radians)}
            y2={120 + 80 * Math.sin(radians)}
            stroke="var(--line)"
            strokeWidth="0.8"
          />
        );
      })}
      {profiles.map((profile, index) => {
        const values = [profile.rating?.batting ?? 0, profile.rating?.bowling ?? 0, profile.rating?.fielding ?? 0];
        return (
          <g key={profile.player.id}>
            <polygon
              points={radarPoints(values, 80)}
              fill={COLORS[index]}
              fillOpacity="0.1"
              stroke={COLORS[index]}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {values.map((value, axis) => {
              const angle = ([-90, 150, 30][axis] * Math.PI) / 180;
              const r = (Math.max(0, Math.min(100, value)) / 100) * 80;
              return (
                <circle
                  key={axis}
                  cx={120 + r * Math.cos(angle)}
                  cy={120 + r * Math.sin(angle)}
                  r="2.6"
                  fill={COLORS[index]}
                  stroke="var(--surface)"
                  strokeWidth="1.2"
                />
              );
            })}
          </g>
        );
      })}
      {(
        [
          ["BATTING", -90],
          ["BOWLING", 150],
          ["FIELDING", 30],
        ] as const
      ).map(([label, angle]) => {
        const radians = (angle * Math.PI) / 180;
        return (
          <text
            key={label}
            x={120 + 101 * Math.cos(radians)}
            y={120 + 101 * Math.sin(radians)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--muted)"
            fontSize="8.5"
            fontWeight="600"
            fontFamily="Inter, sans-serif"
            letterSpacing="0.08em"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function PlayerPicker({
  pool,
  selectedIds,
  onSelect,
  slot,
}: {
  pool: PoolEntry[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  slot: number;
}) {
  const [query, setQuery] = useState("");
  const selected = new Set(selectedIds);
  const needle = query.trim().toLowerCase();
  const matches = pool
    .filter((entry) => !selected.has(entry.id))
    .filter((entry) => (needle ? entry.name.toLowerCase().includes(needle) : true))
    .slice(0, 8);

  return (
    <div className="flex h-full min-h-[210px] flex-col rounded-xl border border-dashed border-line-strong/70 bg-surface2/40 p-4">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-faint">
        Slot {slot + 1} · Add a player
      </p>
      <div className="relative mt-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the rated pool"
          className="input min-h-9 py-1.5 pl-8 text-xs"
          aria-label={`Search players for slot ${slot + 1}`}
        />
      </div>
      <ul className="mt-2 max-h-[190px] flex-1 space-y-1 overflow-y-auto scrollbar-thin pr-0.5">
        {matches.length === 0 ? (
          <li className="px-2 py-4 text-center text-[0.68rem] text-faint">No rated player matches that search.</li>
        ) : (
          matches.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onSelect(entry.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <PlayerAvatar name={entry.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{entry.name}</span>
                    <span className="text-[0.58rem] text-faint">
                      {entry.roleLabel}
                      {entry.teamShort ? ` · ${entry.teamShort}` : ""}
                    </span>
                  </span>
                </span>
                <span className="num shrink-0 text-[0.7rem] font-semibold text-muted">{entry.ovr ?? "—"}</span>
              </button>
            </li>
          ))
        )}
      </ul>
      <p className="mt-2 border-t border-line/70 pt-2 text-[0.56rem] text-faint">
        Showing the {matches.length === 8 ? "top 8" : "best"} rated matches.
      </p>
    </div>
  );
}

type Metric = {
  label: string;
  values: Array<number | null>;
  format: (value: number) => string;
  better?: "higher" | "lower";
  suffix?: string;
};

function bestIndex(metric: Metric): number | null {
  if (!metric.better) return null;
  const numeric = metric.values
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => entry.value !== null && Number.isFinite(entry.value));
  if (numeric.length < 2) return null;
  const best = numeric.reduce((current, entry) => {
    if (metric.better === "higher") return entry.value > current.value ? entry : current;
    return entry.value < current.value ? entry : current;
  });
  const tied = numeric.filter((entry) => entry.value === best.value).length;
  if (tied === numeric.length) return null;
  return best.index;
}

export function CompareBoard({ pool, profiles }: { pool: PoolEntry[]; profiles: PlayerProfile[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ids = profiles.map((profile) => profile.player.id);

  function update(next: string[]) {
    const unique = [...new Set(next)].slice(0, 3);
    const href = unique.length > 0 ? `/compare?${unique.map((id) => `p=${encodeURIComponent(id)}`).join("&")}` : "/compare?p=none";
    startTransition(() => router.push(href));
  }

  const season2026 = useMemo(
    () =>
      profiles.map((profile) => {
        const rows = profile.seasonStats.filter((row) => row.season === 2026);
        return {
          runs: rows.reduce((sum, row) => sum + row.runs, 0),
          wickets: rows.reduce((sum, row) => sum + row.wickets, 0),
          matches: rows.reduce((sum, row) => sum + row.matches, 0),
        };
      }),
    [profiles],
  );

  const groups: Array<{ title: string; rows: Metric[] }> = [
    {
      title: "Analytical ratings",
      rows: [
        { label: "Overall (OVR)", values: profiles.map((p) => p.rating?.ovr ?? null), format: (v) => String(v), better: "higher" },
        { label: "Batting", values: profiles.map((p) => p.rating?.batting ?? null), format: (v) => String(v), better: "higher" },
        { label: "Bowling", values: profiles.map((p) => p.rating?.bowling ?? null), format: (v) => String(v), better: "higher" },
        { label: "Fielding", values: profiles.map((p) => p.rating?.fielding ?? null), format: (v) => String(v), better: "higher" },
      ],
    },
    {
      title: "Career batting",
      rows: [
        { label: "Matches", values: profiles.map((p) => p.career.matches), format: (v) => String(v) },
        { label: "Runs", values: profiles.map((p) => p.career.runs), format: (v) => v.toLocaleString("en-IN"), better: "higher" },
        { label: "Average", values: profiles.map((p) => p.career.average), format: (v) => v.toFixed(2), better: "higher" },
        { label: "Strike rate", values: profiles.map((p) => p.career.strikeRate), format: (v) => v.toFixed(1), better: "higher" },
        { label: "Fifties", values: profiles.map((p) => p.career.fifties), format: (v) => String(v), better: "higher" },
        { label: "Hundreds", values: profiles.map((p) => p.career.hundreds), format: (v) => String(v), better: "higher" },
      ],
    },
    {
      title: "Career bowling",
      rows: [
        { label: "Wickets", values: profiles.map((p) => p.career.wickets), format: (v) => String(v), better: "higher" },
        { label: "Economy", values: profiles.map((p) => p.career.economy), format: (v) => v.toFixed(2), better: "lower" },
        { label: "Bowling average", values: profiles.map((p) => p.career.bowlingAverage), format: (v) => v.toFixed(2), better: "lower" },
        { label: "Dot-ball share", values: profiles.map((p) => p.career.dotPercent), format: (v) => `${v.toFixed(1)}%`, better: "higher" },
      ],
    },
    {
      title: "Fielding",
      rows: [
        { label: "Catches", values: profiles.map((p) => p.career.catches), format: (v) => String(v), better: "higher" },
        { label: "Stumpings", values: profiles.map((p) => p.career.stumpings), format: (v) => String(v), better: "higher" },
        { label: "Run-outs", values: profiles.map((p) => p.career.runOuts), format: (v) => String(v), better: "higher" },
      ],
    },
    {
      title: "2026 context",
      rows: [
        { label: "2026 matches", values: season2026.map((row) => (row.matches > 0 ? row.matches : null)), format: (v) => String(v) },
        { label: "2026 runs", values: season2026.map((row) => row.runs), format: (v) => v.toLocaleString("en-IN"), better: "higher" },
        { label: "2026 wickets", values: season2026.map((row) => row.wickets), format: (v) => String(v), better: "higher" },
        {
          label: "2026 auction price",
          values: profiles.map((p) => p.auctionHistory.find((row) => row.year === 2026)?.winningBidLakh ?? null),
          format: (v) => formatLakh(v),
        },
      ],
    },
  ];

  if (profiles.length === 0) {
    return (
      <div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((slot) => (
            <PlayerPicker
              key={slot}
              pool={pool}
              selectedIds={[]}
              slot={slot}
              onSelect={(id) => update([...ids, id])}
            />
          ))}
        </div>
        <div className="surface-card mt-6 flex flex-col items-center px-6 py-14 text-center">
          <p className="font-display text-xl font-bold uppercase tracking-wide">Pick your matchup</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            Choose two or three rated players above. The board compares role-weighted ratings, career evidence and
            2026 context side by side.
          </p>
          <Link href="/players" className="btn btn-primary mt-6">
            Browse the player pool
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("transition-opacity", pending && "opacity-60")}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {profiles.map((profile, index) => (
          <div
            key={profile.player.id}
            className="surface-card relative overflow-hidden p-4"
            style={{ borderTop: `3px solid ${COLORS[index]}` }}
          >
            <button
              type="button"
              onClick={() => update(ids.filter((id) => id !== profile.player.id))}
              className="absolute right-2.5 top-2.5 rounded-md p-1 text-faint transition-colors hover:bg-surface3 hover:text-fg"
              aria-label={`Remove ${profile.player.name}`}
            >
              <X size={14} />
            </button>
            <div className="flex items-center gap-3 pr-6">
              <PlayerAvatar
                name={profile.player.name}
                teamId={profile.player.primaryTeamId}
                role={profile.player.role}
                country={profile.player.country}
                size="md"
              />
              <div className="min-w-0">
                <Link href={`/players/${profile.player.id}`} className="block truncate font-display text-xl font-bold uppercase tracking-wide hover:text-accent2">
                  {profile.player.name}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <RoleChip role={profile.player.role} label={profile.player.roleLabel} />
                  {profile.player.teamShort && (
                    <span className="flex items-center gap-1 text-[0.65rem] text-faint">
                      <TeamBadge teamId={profile.player.primaryTeamId} size={14} />
                      {profile.player.teamShort}
                    </span>
                  )}
                </div>
              </div>
              <span className="ml-auto">
                <OvrBadge value={profile.rating?.ovr ?? null} size="sm" />
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
              <div>
                <dt className="text-[0.55rem] uppercase tracking-[0.12em] text-faint">Matches</dt>
                <dd className="num text-sm font-semibold">{profile.career.matches}</dd>
              </div>
              <div>
                <dt className="text-[0.55rem] uppercase tracking-[0.12em] text-faint">Runs</dt>
                <dd className="num text-sm font-semibold">{profile.career.runs.toLocaleString("en-IN")}</dd>
              </div>
              <div>
                <dt className="text-[0.55rem] uppercase tracking-[0.12em] text-faint">Wickets</dt>
                <dd className="num text-sm font-semibold">{profile.career.wickets}</dd>
              </div>
            </dl>
          </div>
        ))}
        {profiles.length < 3 && (
          <PlayerPicker
            pool={pool}
            selectedIds={ids}
            slot={profiles.length}
            onSelect={(id) => update([...ids, id])}
          />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide">Rating shape</h2>
            <span className="text-[0.6rem] text-faint">0–100 peer scale</span>
          </div>
          <CompareRadar profiles={profiles} />
          <ul className="mt-2 space-y-1.5">
            {profiles.map((profile, index) => (
              <li key={profile.player.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[index] }} />
                  <span className="truncate">{profile.player.name}</span>
                </span>
                <span className="num text-muted">
                  {profile.rating?.batting ?? "—"} / {profile.rating?.bowling ?? "—"} / {profile.rating?.fielding ?? "—"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-2 text-[0.58rem] leading-relaxed text-faint">
            Rating shape is role-weighted; a specialist bowler can trail on batting without losing their overall
            value. Missing evidence is shown as a dash, not zero.
          </p>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[680px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface">Metric</th>
                  {profiles.map((profile, index) => (
                    <th key={profile.player.id} className="text-right">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: COLORS[index] }} />
                        <span className="normal-case tracking-normal">{profile.player.name.split(" ").slice(-1)[0]}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.title}>
                    <tr>
                      <td colSpan={profiles.length + 1} className="bg-surface2/50 py-2">
                        <span className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-accent2">{group.title}</span>
                      </td>
                    </tr>
                    {group.rows.map((metric) => {
                      const best = bestIndex(metric);
                      return (
                        <tr key={`${group.title}-${metric.label}`}>
                          <td className="sticky left-0 bg-surface text-xs text-muted">{metric.label}</td>
                          {profiles.map((profile, index) => {
                            const value = metric.values[index];
                            return (
                              <td
                                key={profile.player.id}
                                className={cn(
                                  "num text-right text-sm",
                                  best === index && "font-semibold text-success",
                                )}
                              >
                                <span className="inline-flex items-center justify-end gap-1">
                                  {best === index && <Check size={12} />}
                                  {value === null ? <span className="text-faint">—</span> : metric.format(value)}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-[0.6rem] leading-relaxed text-faint">
            A green check marks the strongest value in each row; auction prices are context only and never marked.
            Rates and averages derive from ball-by-ball data; sample sizes differ by role.
          </p>
        </div>
      </div>

      {profiles.length === 1 && (
        <div className="panel mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-xs text-muted">
            <Plus size={13} className="mr-1 inline" /> Add a second player to start the head-to-head comparison.
          </p>
          <span className="chip chip-info">One player selected</span>
        </div>
      )}
    </div>
  );
}
