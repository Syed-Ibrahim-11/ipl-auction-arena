import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Filter, SlidersHorizontal } from "lucide-react";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import { EmptyState, PageHeader, RoleChip } from "@/components/ui";
import { getPlayerFilterOptions, listPlayers, type PlayerSort } from "@/lib/data/queries";
import { formatLakh } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Player Explorer",
  description:
    "Search and filter every IPL player in the dataset by role, franchise, overseas status and career record. Compare career evidence and 2026 auction prices.",
};

const SORTS: Array<{ id: PlayerSort; label: string }> = [
  { id: "runs", label: "Career runs" },
  { id: "wickets", label: "Career wickets" },
  { id: "matches", label: "Matches played" },
  { id: "auction", label: "2026 hammer price" },
  { id: "name", label: "Name (A–Z)" },
];

interface SearchParams {
  q?: string;
  role?: string;
  team?: string;
  overseas?: string;
  capped?: string;
  sort?: string;
  page?: string;
}

function normalize(params: SearchParams) {
  const sort = SORTS.some((entry) => entry.id === params.sort) ? (params.sort as PlayerSort) : "runs";
  const overseas: "overseas" | "domestic" | "all" =
    params.overseas === "overseas" || params.overseas === "domestic" ? params.overseas : "all";
  const capped: "capped" | "uncapped" | "all" =
    params.capped === "capped" || params.capped === "uncapped" ? params.capped : "all";
  return {
    q: params.q?.trim() ?? "",
    role: params.role ?? "all",
    team: params.team ?? "all",
    overseas,
    capped,
    sort,
    page: Math.max(1, Number(params.page) || 1),
  };
}

function buildHref(current: ReturnType<typeof normalize>, page: number): string {
  const query = new URLSearchParams();
  if (current.q) query.set("q", current.q);
  if (current.role !== "all") query.set("role", current.role);
  if (current.team !== "all") query.set("team", current.team);
  if (current.overseas !== "all") query.set("overseas", current.overseas);
  if (current.capped !== "all") query.set("capped", current.capped);
  if (current.sort !== "runs") query.set("sort", current.sort);
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/players?${suffix}` : "/players";
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const current = normalize(await searchParams);
  const options = getPlayerFilterOptions();
  const result = listPlayers({
    q: current.q,
    role: current.role,
    team: current.team,
    overseas: current.overseas === "all" ? undefined : current.overseas,
    capped: current.capped === "all" ? undefined : current.capped,
    sort: current.sort,
    page: current.page,
    pageSize: 24,
  });
  const activeFilters = [
    current.q ? `“${current.q}”` : null,
    current.role !== "all" ? options.roles.find((role) => role.id === current.role)?.label : null,
    current.team !== "all" ? options.teams.find((team) => team.id === current.team)?.shortName : null,
    current.overseas !== "all" ? current.overseas : null,
    current.capped !== "all" ? current.capped : null,
  ].filter(Boolean);

  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Current IPL 2026 pool · auction lots + appearance rosters"
        title="Player explorer"
        description="Only players in the current IPL 2026 pool: the supplied auction lots plus every player who appeared in the 2026 season. Filter by role, franchise and eligibility — every score links back to the underlying IPL evidence."
        actions={
          <>
            <Link href="/compare" className="btn btn-primary">
              Compare players
            </Link>
            <Link href="/methodology" className="btn btn-outline">
              How ratings work
            </Link>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-info">Batting</span>
            <span className="chip chip-danger">Bowling</span>
            <span className="chip chip-success">Fielding</span>
            <span className="chip chip-gold">2026 sale prices</span>
          </div>
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside>
          <form method="get" className="surface-card sticky top-24 p-4" aria-label="Filter players">
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <SlidersHorizontal size={16} className="text-accent2" />
              <p className="font-display text-base font-bold uppercase tracking-wide">Filters</p>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="q" className="field-label">
                  Search
                </label>
                <input
                  id="q"
                  name="q"
                  defaultValue={current.q}
                  placeholder="Player name"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="role" className="field-label">
                  Role
                </label>
                <select id="role" name="role" defaultValue={current.role} className="select">
                  <option value="all">All roles</option>
                  {options.roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label} ({role.count})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="team" className="field-label">
                  Latest franchise
                </label>
                <select id="team" name="team" defaultValue={current.team} className="select">
                  <option value="all">All franchises</option>
                  {options.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset>
                <legend className="field-label">Eligibility</legend>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 rounded-lg border border-line bg-surface2/50 px-2.5 py-2 text-xs">
                    <input type="radio" name="overseas" value="all" defaultChecked={current.overseas === "all"} />
                    All
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-line bg-surface2/50 px-2.5 py-2 text-xs">
                    <input type="radio" name="overseas" value="overseas" defaultChecked={current.overseas === "overseas"} />
                    Overseas
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-line bg-surface2/50 px-2.5 py-2 text-xs">
                    <input type="radio" name="overseas" value="domestic" defaultChecked={current.overseas === "domestic"} />
                    Domestic
                  </label>
                </div>
              </fieldset>
              <div>
                <label htmlFor="capped" className="field-label">
                  Capped status
                </label>
                <select id="capped" name="capped" defaultValue={current.capped} className="select">
                  <option value="all">Any status</option>
                  <option value="capped">Capped</option>
                  <option value="uncapped">Uncapped</option>
                </select>
              </div>
              <div>
                <label htmlFor="sort" className="field-label">
                  Sort by
                </label>
                <select id="sort" name="sort" defaultValue={current.sort} className="select">
                  {SORTS.map((sort) => (
                    <option key={sort.id} value={sort.id}>
                      {sort.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" className="btn btn-primary btn-sm flex-1">
                  <Filter size={14} /> Apply
                </button>
                <Link href="/players" className="btn btn-ghost btn-sm">
                  Reset
                </Link>
              </div>
            </div>
          </form>
        </aside>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {result.total.toLocaleString("en-IN")} current IPL players
                {activeFilters.length > 0 && (
                  <span className="ml-2 font-normal text-faint">matching {activeFilters.join(" · ")}</span>
                )}
              </p>
              <p className="mt-1 text-xs text-faint">
                Page {result.page} of {result.pages} · career records shown as of the 2026 season
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Link
                href={buildHref(current, Math.max(1, result.page - 1))}
                aria-disabled={result.page === 1}
                className={result.page === 1 ? "btn btn-ghost btn-sm pointer-events-none opacity-40" : "btn btn-ghost btn-sm"}
              >
                <ChevronLeft size={14} /> Prev
              </Link>
              <Link
                href={buildHref(current, Math.min(result.pages, result.page + 1))}
                aria-disabled={result.page === result.pages}
                className={
                  result.page === result.pages
                    ? "btn btn-ghost btn-sm pointer-events-none opacity-40"
                    : "btn btn-ghost btn-sm"
                }
              >
                Next <ChevronRight size={14} />
              </Link>
            </div>
          </div>

          {result.players.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="No players found"
                description="Try a shorter name, widen the role filter, or clear the eligibility constraints."
                action={
                  <Link href="/players" className="btn btn-primary">
                    Clear filters
                  </Link>
                }
              />
            </div>
          ) : (
            <>
              <div className="surface-card mt-4 hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="data-table min-w-[900px]">
                    <thead>
                      <tr>
                        <th className="w-10">#</th>
                        <th>Player</th>
                        <th>Role</th>
                        <th>Franchise</th>
                        <th className="text-center">M</th>
                        <th className="text-right">Runs</th>
                        <th className="text-right">SR</th>
                        <th className="text-right">Wkts</th>
                        <th className="text-right">Econ</th>
                        <th className="text-right">2026 price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.players.map((player, index) => {
                        const rank = (result.page - 1) * result.pageSize + index + 1;
                        return (
                          <tr key={player.id}>
                            <td className="text-faint">{rank}</td>
                            <td>
                              <Link href={`/players/${player.id}`} className="flex items-center gap-2.5 group">
                                <PlayerAvatar name={player.name} teamId={player.teamId} role={player.role} size="sm" />
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold group-hover:text-accent2">
                                    {player.name}
                                  </span>
                                  <span className="mt-0.5 flex items-center gap-1.5 text-[0.6rem] text-faint">
                                    {player.country ?? "Country unavailable"}
                                    {player.isOverseas && <span className="text-info">OS</span>}
                                    {player.capped === false && <span>Uncapped</span>}
                                  </span>
                                </span>
                              </Link>
                            </td>
                            <td>
                              <RoleChip role={player.role} label={player.roleLabel} />
                            </td>
                            <td>
                              {player.teamShort ? (
                                <span className="flex items-center gap-1.5 text-xs">
                                  <TeamBadge teamId={player.teamId} size={18} />
                                  {player.teamShort}
                                </span>
                              ) : (
                                <span className="text-xs text-faint">—</span>
                              )}
                            </td>
                            <td className="num text-center">{player.matches}</td>
                            <td className="num text-right">{player.runs.toLocaleString("en-IN")}</td>
                            <td className="num text-right">{player.strikeRate?.toFixed(1) ?? "—"}</td>
                            <td className="num text-right">{player.wickets}</td>
                            <td className="num text-right">{player.economy?.toFixed(2) ?? "—"}</td>
                            <td className="text-right">
                              {player.winningBidLakh !== null ? (
                                <span className="num text-xs font-semibold">{formatLakh(player.winningBidLakh)}</span>
                              ) : player.auctionBaseLakh !== null ? (
                                <span className="num text-xs text-faint">base {formatLakh(player.auctionBaseLakh)}</span>
                              ) : (
                                <span className="text-xs text-faint">Not in 2026 sale</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 md:hidden">
                {result.players.map((player) => (
                  <Link
                    key={player.id}
                    href={`/players/${player.id}`}
                    className="panel card-hover flex items-center gap-3 p-3.5"
                  >
                    <PlayerAvatar name={player.name} teamId={player.teamId} role={player.role} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg font-semibold uppercase leading-tight tracking-wide">
                        {player.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <RoleChip role={player.role} label={player.roleLabel} />
                        {player.teamShort && <span className="text-[0.65rem] text-faint">{player.teamShort}</span>}
                      </div>
                      <p className="num mt-1.5 text-[0.68rem] text-muted">
                        {player.matches} M · {player.runs.toLocaleString("en-IN")} runs · {player.wickets} wkts
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}

          {result.pages > 1 && (
            <nav className="mt-6 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
              {result.page > 1 && (
                <Link href={buildHref(current, result.page - 1)} className="btn btn-ghost btn-sm">
                  <ChevronLeft size={14} /> Previous
                </Link>
              )}
              {(() => {
                const pages = new Set<number>();
                for (let index = 1; index <= result.pages; index += 1) {
                  if (index === 1 || index === result.pages || Math.abs(index - result.page) <= 2) pages.add(index);
                }
                return [...pages]
                  .sort((a, b) => a - b)
                  .map((page, index, array) => (
                    <span key={page} className="flex items-center gap-1.5">
                      {index > 0 && page - array[index - 1] > 1 && <span className="px-1 text-faint">…</span>}
                      <Link
                        href={buildHref(current, page)}
                        className={
                          page === result.page
                            ? "btn btn-primary btn-sm min-w-9 px-2.5"
                            : "btn btn-ghost btn-sm min-w-9 px-2.5"
                        }
                        aria-current={page === result.page ? "page" : undefined}
                      >
                        {page}
                      </Link>
                    </span>
                  ));
              })()}
              {result.page < result.pages && (
                <Link href={buildHref(current, result.page + 1)} className="btn btn-ghost btn-sm">
                  Next <ChevronRight size={14} />
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
