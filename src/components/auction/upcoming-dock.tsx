"use client";

import { useEffect, useMemo, useState } from "react";
import { Dices, Gavel, Loader2, Search, Sparkles, X } from "lucide-react";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import type { AuctionSnapshot } from "@/lib/auction/types";
import { formatLakh } from "@/lib/money";
import { cn } from "@/lib/cn";

const ROLE_LABEL: Record<string, string> = {
  batter: "Batter",
  bowler: "Bowler",
  "all-rounder": "All-rounder",
  wicketkeeper: "Keeper",
  unknown: "Player",
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function scramble<T>(items: T[], seed: number): T[] {
  const next = [...items];
  const random = mulberry32(seed || 1);
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

/**
 * The auctioneer calls lots in database order. This dock deliberately scrambles
 * the preview order so the next name stays a surprise while the player pool stays
 * visible. Lot numbers are hidden for the same reason.
 */
type PoolLot = {
  id: string;
  lotId: string;
  playerName: string;
  role: string;
  roleLabel: string;
  setName: string | null;
  basePriceLakh: number;
};

export function UpcomingDock({
  upcoming,
  remainingLots,
  sessionId,
}: {
  upcoming: AuctionSnapshot["upcomingLots"];
  remainingLots: number;
  sessionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState(7);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ token: string; results: PoolLot[] } | null>(null);

  const ordered = useMemo(() => scramble(upcoming, seed), [upcoming, seed]);
  const trimmed = query.trim();
  const searchingPool = trimmed.length >= 2;
  const results = search?.token === trimmed ? search.results : [];
  const searching = searchingPool && search?.token !== trimmed;

  useEffect(() => {
    if (!searchingPool) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      let found: PoolLot[] = [];
      try {
        const response = await fetch(
          `/api/search?sessionId=${encodeURIComponent(sessionId)}&q=${encodeURIComponent(trimmed)}`,
        );
        const data = (await response.json()) as { lots?: PoolLot[] };
        if (Array.isArray(data.lots)) found = data.lots;
      } catch {
        found = [];
      }
      if (!cancelled) setSearch({ token: trimmed, results: found });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, searchingPool, sessionId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (upcoming.length === 0) return null;

  const reshuffle = () => setSeed((value) => (value * 48271 + Date.now()) % 2_147_483_647);

  const toggle = () => {
    if (!open) reshuffle();
    setOpen(!open);
  };

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex items-center justify-end pb-6 pt-28">
      {open && (
        <div
          key={seed}
          className="animate-pop pointer-events-auto relative mr-11 flex max-h-full w-[min(86vw,340px)] flex-col overflow-hidden rounded-2xl border border-line bg-bg/95 shadow-2xl backdrop-blur-xl"
          role="dialog"
          aria-label="Upcoming players"
        >
          <div
            className="flex items-start justify-between gap-2 border-b border-line px-4 py-3"
            style={{
              background:
                "radial-gradient(320px 120px at 0% 0%, color-mix(in srgb, var(--gold) 16%, transparent), transparent 70%)",
            }}
          >
            <div>
              <p className="flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-[0.12em]">
                <Sparkles size={13} className="text-gold" /> Up next
              </p>
              <p className="mt-0.5 text-[0.58rem] text-faint">
                Surprise order · {Math.max(upcoming.length, remainingLots)} names in the pool
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={reshuffle}
                aria-label="Shuffle the preview"
                title="Shuffle"
              >
                <Dices size={15} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setOpen(false)}
                aria-label="Close upcoming players"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="border-b border-line px-3 py-2">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the remaining pool…"
                aria-label="Search remaining auction lots"
                className="input h-9 pl-8 pr-8 text-xs"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-fg"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <ul className="min-h-0 flex-1 divide-y divide-line/60 overflow-y-auto scrollbar-thin">
            {searchingPool ? (
              searching ? (
                <li className="flex items-center gap-2 px-4 py-6 text-xs text-faint">
                  <Loader2 size={13} className="animate-spin" /> Searching lots…
                </li>
              ) : results.length === 0 ? (
                <li className="px-4 py-6 text-xs text-faint">
                  No pending lot matches “{trimmed}”. They may already have been called.
                </li>
              ) : (
                results.map((entry, index) => (
                  <li
                    key={entry.lotId}
                    className="animate-fade-up flex items-center gap-2.5 px-3 py-2"
                    style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
                  >
                    <PlayerAvatar name={entry.playerName} role={entry.role} size="sm" className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.76rem] font-semibold leading-tight">{entry.playerName}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[0.56rem] uppercase tracking-[0.08em] text-faint">
                        <span>{entry.roleLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate normal-case tracking-normal">{entry.setName ?? "Pool"}</span>
                      </p>
                    </div>
                    <span className="num shrink-0 text-right">
                      <span className="block text-[0.68rem] font-semibold">
                        {formatLakh(entry.basePriceLakh, { compact: true })}
                      </span>
                      <span className="block text-[0.5rem] uppercase tracking-[0.1em] text-faint">base</span>
                    </span>
                  </li>
                ))
              )
            ) : (
              ordered.slice(0, 18).map((entry, index) => (
                <li
                  key={entry.id}
                  className="animate-fade-up flex items-center gap-2.5 px-3 py-2"
                  style={{ animationDelay: `${Math.min(index, 12) * 32}ms` }}
                >
                  <PlayerAvatar name={entry.playerName} role={entry.role} size="sm" className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.76rem] font-semibold leading-tight">{entry.playerName}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[0.56rem] uppercase tracking-[0.08em] text-faint">
                      <span>{ROLE_LABEL[entry.role] ?? entry.role}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate normal-case tracking-normal">{entry.setName}</span>
                    </p>
                  </div>
                  <span className="num shrink-0 text-right">
                    <span className="block text-[0.68rem] font-semibold">
                      {formatLakh(entry.basePriceLakh, { compact: true })}
                    </span>
                    <span className="block text-[0.5rem] uppercase tracking-[0.1em] text-faint">base</span>
                  </span>
                </li>
              ))
            )}
          </ul>

          <p className="border-t border-line bg-surface2/40 px-4 py-2 text-[0.55rem] leading-relaxed text-faint">
            {searchingPool
              ? `${results.length} matching ${results.length === 1 ? "lot" : "lots"} across the pending pool.`
              : remainingLots > upcoming.length
                ? `Showing ${Math.min(upcoming.length, 18)} random names from about ${remainingLots} lots still to call.`
                : `Showing ${Math.min(upcoming.length, 18)} random names.`}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Hide upcoming players" : "Show upcoming players"}
        className={cn(
          "pointer-events-auto group flex h-40 w-10 flex-col items-center justify-center gap-2 rounded-l-2xl border border-r-0 shadow-lg transition-all duration-300",
          open
            ? "border-accent/60 bg-accent text-black"
            : "border-line bg-bg/90 text-muted backdrop-blur-xl hover:border-accent/40 hover:text-fg",
        )}
      >
        <Gavel size={17} className={cn("transition-transform duration-300", open && "-rotate-12")} />
        <span className="rotate-180 text-[0.56rem] font-semibold uppercase tracking-[0.2em] [writing-mode:vertical-rl]">
          Up next
        </span>
        <span
          className={cn(
            "num flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.58rem] font-bold",
            open ? "bg-black/20 text-black" : "bg-surface3 text-fg",
          )}
        >
          {Math.max(upcoming.length, remainingLots)}
        </span>
      </button>
    </div>
  );
}
