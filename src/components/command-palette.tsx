"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CornerDownLeft,
  Gavel,
  Search,
  Shield,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { cn } from "@/lib/cn";

type SearchPlayer = {
  id: string;
  name: string;
  shortName: string;
  role: string;
  roleLabel: string;
  country: string | null;
  isOverseas: boolean;
  ovr: number | null;
  teamId: string | null;
  teamName: string | null;
  teamShort: string | null;
  basePriceLakh: number | null;
  winningBidLakh: number | null;
};

type SearchTeam = {
  id: string;
  name: string;
  shortName: string;
  city: string | null;
  active: boolean;
  primary: string;
  secondary: string;
  ink: string;
};

type SearchResponse = { players: SearchPlayer[]; teams: SearchTeam[] };

type PlayerEntry = {
  key: string;
  kind: "player";
  href: string;
  title: string;
  subtitle: string;
  meta: string | null;
  teamId: string | null;
  role: string;
  country: string | null;
  ovr: number | null;
};

type TeamEntry = {
  key: string;
  kind: "team";
  href: string;
  title: string;
  subtitle: string;
  meta: string | null;
  shortName: string;
  primary: string;
  secondary: string;
  ink: string;
};

type PageEntry = {
  key: string;
  kind: "page";
  href: string;
  title: string;
  subtitle: string;
  meta?: string | null;
  icon: typeof Gavel;
};

type RecentEntry = {
  key: string;
  kind: "recent";
  href: string;
  title: string;
  subtitle: string;
  meta: string | null;
  teamId: string | null;
  role: string;
  country: string | null;
};

type Entry = PlayerEntry | TeamEntry | PageEntry | RecentEntry;

const PAGES: PageEntry[] = [
  { key: "page-auction", kind: "page", href: "/auction", title: "Auction Room", subtitle: "Live bidding floor", icon: Gavel },
  { key: "page-players", kind: "page", href: "/players", title: "Player registry", subtitle: "Every rated IPL player", icon: UsersRound },
  { key: "page-teams", kind: "page", href: "/teams", title: "Franchises", subtitle: "Ten squads, one crown", icon: Shield },
  { key: "page-compare", kind: "page", href: "/compare", title: "Compare players", subtitle: "Head-to-head scouting", icon: Trophy },
  { key: "page-multiplayer", kind: "page", href: "/auction/multiplayer", title: "Play with friends", subtitle: "Host or join a private auction", icon: UserRound },
  { key: "page-rulebook", kind: "page", href: "/rulebook", title: "Rulebook", subtitle: "Auction laws and formats", icon: BookOpen },
];

const RECENT_KEY = "arena-search-recent";
const GROUP_LABEL: Record<Entry["kind"], string> = {
  recent: "Recent",
  player: "Players",
  team: "Franchises",
  page: "Jump to",
};

function readRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item.href === "string" && typeof item.title === "string")
          .slice(0, 4)
          .map((item) => ({ ...item, kind: "recent", key: `recent-${item.href}` }))
      : [];
  } catch {
    return [];
  }
}

function groupEntries(entries: Entry[]): Array<{ kind: Entry["kind"]; items: Entry[] }> {
  const order: Entry["kind"][] = ["recent", "player", "team", "page"];
  return order
    .map((kind) => ({ kind, items: entries.filter((entry) => entry.kind === kind) }))
    .filter((group) => group.items.length > 0);
}

export function CommandPalette({ autoOpen = false }: { autoOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [players, setPlayers] = useState<SearchPlayer[]>([]);
  const [teams, setTeams] = useState<SearchTeam[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [recent, setRecent] = useState<RecentEntry[]>(() => readRecent());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, SearchResponse>());

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => {
          if (!value) {
            setQuery("");
            setActive(0);
            setStatus("idle");
            setRecent(readRecent());
          }
          return !value;
        });
      } else if (event.key === "Escape") {
        setOpen((value) => (value ? false : value));
      }
    };
    const onOpenEvent = () => {
      setOpen(true);
      setActive(0);
      setStatus("idle");
      setRecent(readRecent());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("arena:open-search", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("arena:open-search", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const focus = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      document.body.style.overflow = "";
      window.clearTimeout(focus);
    };
  }, [open]);

  const runSearch = useCallback((value: string) => {
    const cleaned = value.trim();
    if (cleaned.length < 2) {
      abortRef.current?.abort();
      setPlayers([]);
      setTeams([]);
      setStatus("idle");
      return;
    }
    const cached = cacheRef.current.get(cleaned.toLowerCase());
    if (cached) {
      setPlayers(cached.players);
      setTeams(cached.teams);
      setStatus("done");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    fetch(`/api/search?q=${encodeURIComponent(cleaned)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("search failed"))))
      .then((data: SearchResponse) => {
        cacheRef.current.set(cleaned.toLowerCase(), data);
        setPlayers(data.players ?? []);
        setTeams(data.teams ?? []);
        setStatus("done");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPlayers([]);
        setTeams([]);
        setStatus("error");
      });
  }, []);

  const onQueryChange = (value: string) => {
    setQuery(value);
    setActive(0);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(value), 170);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const cleaned = query.trim().toLowerCase();
    if (cleaned.length < 2) {
      return [...recent, ...PAGES];
    }

    const playerEntries: PlayerEntry[] = players.map((player) => ({
      key: `player-${player.id}`,
      kind: "player",
      href: `/players/${player.id}`,
      title: player.name,
      subtitle: [player.roleLabel, player.teamShort ?? player.teamName ?? "Free agent", player.country ?? "—"]
        .filter(Boolean)
        .join(" · "),
      meta:
        player.winningBidLakh !== null
          ? `₹${(player.winningBidLakh / 100).toFixed(2)} Cr`
          : player.basePriceLakh !== null
            ? `Base ₹${(player.basePriceLakh / 100).toFixed(2)} Cr`
            : null,
      teamId: player.teamId,
      role: player.role,
      country: player.country,
      ovr: player.ovr,
    }));

    const teamEntries: TeamEntry[] = teams.map((team) => ({
      key: `team-${team.id}`,
      kind: "team",
      href: `/teams/${team.id}`,
      title: team.name,
      subtitle: [team.city, team.active ? "Active franchise" : "Historic franchise"].filter(Boolean).join(" · "),
      meta: team.shortName,
      shortName: team.shortName,
      primary: team.primary,
      secondary: team.secondary,
      ink: team.ink,
    }));

    const pageEntries = PAGES.filter(
      (page) =>
        page.title.toLowerCase().includes(cleaned) || page.subtitle.toLowerCase().includes(cleaned),
    );

    return [...playerEntries, ...teamEntries, ...pageEntries];
  }, [query, players, teams, recent]);

  const groups = useMemo(() => groupEntries(entries), [entries]);
  const indexByKey = useMemo(() => new Map(entries.map((entry, index) => [entry.key, index])), [entries]);
  const activeIndex = entries.length > 0 ? Math.min(active, entries.length - 1) : -1;
  const flat = entries;
  const activeEntry = activeIndex >= 0 ? flat[activeIndex] : null;

  useEffect(() => {
    const container = listRef.current;
    if (!container || !open) return;
    const node = container.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, entries.length]);

  const remember = useCallback((entry: Entry) => {
    if (entry.kind !== "player") return;
    const entryToStore: RecentEntry = {
      key: `recent-${entry.href}`,
      kind: "recent",
      href: entry.href,
      title: entry.title,
      subtitle: entry.subtitle,
      meta: entry.meta,
      teamId: entry.teamId,
      role: entry.role,
      country: entry.country,
    };
    const next: RecentEntry[] = [
      entryToStore,
      ...readRecent().filter((item) => item.href !== entry.href),
    ].slice(0, 4);
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable in private mode; recents are optional.
    }
    setRecent(next);
  }, []);

  const go = useCallback(
    (entry: Entry) => {
      remember(entry);
      close();
      router.push(entry.href);
    },
    [close, remember, router],
  );

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!flat.length) return;
      setActive((value) => (Math.min(value, flat.length - 1) + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!flat.length) return;
      setActive((value) => (Math.min(value, flat.length - 1) - 1 + flat.length) % flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeEntry) go(activeEntry);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  if (!open) return null;

  const showEmpty = query.trim().length >= 2 && status === "done" && entries.length === 0;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]" role="presentation">
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm"
        onClick={close}
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="command-palette relative w-full max-w-2xl overflow-hidden rounded-2xl border border-lineStrong bg-surface shadow-[0_40px_120px_-24px_rgba(0,0,0,0.9)]"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(242,181,68,0.16),transparent)]" />
        <div className="command-search-bar relative flex items-center gap-3 border-b border-line px-4 py-3 transition-colors">
          <Search size={18} className="shrink-0 text-accent" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search players, franchises or pages…"
            aria-label="Search players, franchises or pages"
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-full bg-transparent text-[0.98rem] font-medium text-fg outline-none placeholder:text-faint"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                onQueryChange("");
                inputRef.current?.focus();
              }}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-faint transition-colors hover:text-fg"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
          <kbd className="hidden shrink-0 rounded-md border border-line bg-surface2 px-1.5 py-1 text-[0.6rem] font-semibold text-faint sm:block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="relative max-h-[58vh] overflow-y-auto overflow-x-hidden px-2 py-2 scrollbar-thin">
          {status === "loading" && entries.length === 0 ? (
            <div className="space-y-1.5 p-2">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <span className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-surface3" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-2.5 w-2/5 animate-pulse rounded-full bg-surface3" />
                    <span className="block h-2 w-3/5 animate-pulse rounded-full bg-surface3/70" />
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {showEmpty ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-semibold text-fg">No results for “{query.trim()}”</p>
              <p className="mt-1 text-xs text-faint">
                Try a shorter spelling, a franchise code like CSK, or a page name such as Rulebook.
              </p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-semibold text-fg">Search is unavailable right now</p>
              <p className="mt-1 text-xs text-faint">Check the connection and try again in a moment.</p>
            </div>
          ) : null}

          {groups.map((group) => (
            <div key={group.kind} className="mb-1.5">
              <p className="px-3 pb-1 pt-2 text-[0.58rem] font-bold uppercase tracking-[0.18em] text-faint">
                {GROUP_LABEL[group.kind]}
              </p>
              <ul role="listbox" aria-label={GROUP_LABEL[group.kind]} className="space-y-0.5">
                {group.items.map((entry) => {
                  const index = indexByKey.get(entry.key) ?? 0;
                  const isActive = index === activeIndex;
                  return (
                    <li key={entry.key} role="option" aria-selected={isActive}>
                      <button
                        type="button"
                        data-active={isActive ? "true" : undefined}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(entry)}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                          isActive ? "bg-accent/12" : "hover:bg-surface2",
                        )}
                      >
                        <EntryGlyph entry={entry} />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm font-semibold", isActive ? "text-fg" : "text-fg/90")}>
                            {entry.title}
                          </span>
                          <span className="block truncate text-[0.68rem] text-faint">{entry.subtitle}</span>
                        </span>
                        {entry.kind === "player" && entry.ovr !== null ? (
                          <span className="num shrink-0 rounded-md border border-line bg-surface2 px-1.5 py-0.5 text-[0.62rem] font-bold text-accent2">
                            {entry.ovr}
                          </span>
                        ) : null}
                        {entry.meta && entry.kind !== "player" ? (
                          <span className="shrink-0 text-[0.62rem] font-semibold text-faint">{entry.meta}</span>
                        ) : null}
                        {entry.kind === "player" && entry.meta ? (
                          <span className="num hidden shrink-0 text-[0.62rem] font-semibold text-faint sm:block">
                            {entry.meta}
                          </span>
                        ) : null}
                        {isActive ? (
                          <CornerDownLeft size={14} className="shrink-0 text-accent" aria-hidden="true" />
                        ) : (
                          <ArrowRight size={13} className="shrink-0 text-transparent" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface2/60 px-4 py-2 text-[0.6rem] font-medium text-faint">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-surface px-1 py-0.5">↑</kbd>
              <kbd className="rounded border border-line bg-surface px-1 py-0.5">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-surface px-1 py-0.5">↵</kbd>
              open
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <kbd className="rounded border border-line bg-surface px-1 py-0.5">⌘</kbd>
              <kbd className="rounded border border-line bg-surface px-1 py-0.5">K</kbd>
              anywhere
            </span>
          </span>
          <span className="hidden sm:block">IPL Auction Arena · global search</span>
        </div>
      </div>
    </div>
  );
}

function EntryGlyph({ entry }: { entry: Entry }) {
  if (entry.kind === "player" || entry.kind === "recent") {
    return (
      <PlayerAvatar
        name={entry.title}
        teamId={entry.teamId}
        role={entry.role}
        country={entry.country}
        size="sm"
        className="shrink-0"
      />
    );
  }
  if (entry.kind === "team") {
    return (
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/15 text-[0.62rem] font-black tracking-wide"
        style={{
          background: `linear-gradient(135deg, ${entry.primary}, ${entry.secondary})`,
          color: entry.ink,
          boxShadow: `0 8px 24px -14px ${entry.primary}`,
        }}
        aria-hidden="true"
      >
        {entry.shortName}
      </span>
    );
  }
  const Icon = entry.icon;
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-surface2 text-muted">
      <Icon size={16} aria-hidden="true" />
    </span>
  );
}
