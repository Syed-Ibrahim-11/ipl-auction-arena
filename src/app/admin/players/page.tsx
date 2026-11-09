import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Filter, Search, ShieldCheck } from "lucide-react";
import { AdminLogin } from "@/components/admin/admin-login";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import { EmptyState, OvrBadge, PageHeader, RoleChip } from "@/components/ui";
import { adminConfigured, isAdminAuthenticated } from "@/lib/admin/auth";
import { ADMIN_PLAYER_SORTS, loadAdminPlayers, type AdminPlayerSort } from "@/lib/admin/players";
import { formatLakh } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Players",
  description: "Operator-only player directory with portraits, IPL career records, overall ratings and fair prices.",
  robots: { index: false, follow: false },
};

interface SearchParams {
  q?: string;
  role?: string;
  sort?: string;
  page?: string;
}

function normalize(params: SearchParams) {
  const sort: AdminPlayerSort = ADMIN_PLAYER_SORTS.some((entry) => entry.id === params.sort)
    ? (params.sort as AdminPlayerSort)
    : "ovr";
  return {
    q: params.q?.trim() ?? "",
    role: params.role ?? "all",
    sort,
    page: Math.max(1, Number(params.page) || 1),
  };
}

function buildHref(current: ReturnType<typeof normalize>, page: number): string {
  const query = new URLSearchParams();
  if (current.q) query.set("q", current.q);
  if (current.role !== "all") query.set("role", current.role);
  if (current.sort !== "ovr") query.set("sort", current.sort);
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/admin/players?${suffix}` : "/admin/players";
}

export default async function AdminPlayersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return <AdminLogin configured={adminConfigured()} />;
  }

  const current = normalize(await searchParams);
  const result = loadAdminPlayers({
    q: current.q,
    role: current.role,
    sort: current.sort,
    page: current.page,
    pageSize: 30,
  });
  const activeRole = result.roles.find((role) => role.id === current.role)?.label;

  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Operator directory"
        title="Player ledger"
        description="Operator-only view of the active pool: portrait, career record, OVR and fair price."
        actions={
          <>
            <Link href="/admin" className="btn btn-outline">
              <ChevronLeft size={14} /> Control room
            </Link>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-success">
              <ShieldCheck size={11} /> Operator verified
            </span>
            <span className="chip">{result.rated} rated of {result.poolTotal}</span>
            <span className="chip chip-info">Fair price = model × 0.82</span>
            <span className="chip">2026 ratings</span>
          </div>
        }
      />

      <form method="get" className="surface-card mt-8 p-4" aria-label="Filter admin players">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto]">
          <div>
            <label htmlFor="q" className="field-label">
              Search
            </label>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                id="q"
                name="q"
                defaultValue={current.q}
                placeholder="Player name or franchise"
                className="input w-full pl-9"
              />
            </div>
          </div>
          <div>
            <label htmlFor="role" className="field-label">
              Role
            </label>
            <select id="role" name="role" defaultValue={current.role} className="select">
              <option value="all">All roles</option>
              {result.roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label} ({role.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="field-label">
              Sort
            </label>
            <select id="sort" name="sort" defaultValue={current.sort} className="select">
              {ADMIN_PLAYER_SORTS.map((sort) => (
                <option key={sort.id} value={sort.id}>
                  {sort.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-primary btn-sm">
              <Filter size={14} /> Apply
            </button>
            <Link href="/admin/players" className="btn btn-ghost btn-sm">
              Reset
            </Link>
          </div>
        </div>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {result.total.toLocaleString("en-IN")} players
            {activeRole && <span className="ml-2 font-normal text-faint">· {activeRole}</span>}
            {current.q && <span className="ml-2 font-normal text-faint">· “{current.q}”</span>}
          </p>
          <p className="mt-1 text-xs text-faint">
            Page {result.page} of {result.pages} · career records aggregate every IPL season on file
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
              result.page === result.pages ? "btn btn-ghost btn-sm pointer-events-none opacity-40" : "btn btn-ghost btn-sm"
            }
          >
            Next <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {result.players.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No players match"
            description="Clear the search or widen the role filter to see the full ledger."
            action={
              <Link href="/admin/players" className="btn btn-primary">
                Clear filters
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="surface-card mt-4 hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1080px]">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Player</th>
                    <th>Role</th>
                    <th>Franchise</th>
                    <th className="text-center">OVR</th>
                    <th className="text-right">Fair price</th>
                    <th className="text-center">M</th>
                    <th className="text-right">Runs</th>
                    <th className="text-right">SR</th>
                    <th className="text-right">Wkts</th>
                    <th className="text-right">Econ</th>
                    <th className="text-right">Band</th>
                  </tr>
                </thead>
                <tbody>
                  {result.players.map((player, index) => {
                    const rank = (result.page - 1) * result.pageSize + index + 1;
                    return (
                      <tr key={player.id}>
                        <td className="text-faint">{rank}</td>
                        <td>
                          <Link href={`/admin/players/${player.id}`} className="group flex items-center gap-2.5">
                            <PlayerAvatar name={player.name} teamId={player.teamId} role={player.role} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold group-hover:text-accent2">
                                {player.name}
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-[0.6rem] text-faint">
                                {player.country ?? "Country unavailable"}
                                {player.isOverseas && <span className="text-info">OS</span>}
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
                        <td className="text-center">
                          <span className="inline-flex justify-center">
                            <OvrBadge value={player.ovr} />
                          </span>
                        </td>
                        <td className="num text-right font-semibold">
                          {player.fairValue ? formatLakh(player.fairValue.valueLakh) : "—"}
                        </td>
                        <td className="num text-center">{player.career.matches}</td>
                        <td className="num text-right">{player.career.runs.toLocaleString("en-IN")}</td>
                        <td className="num text-right">{player.career.strikeRate?.toFixed(1) ?? "—"}</td>
                        <td className="num text-right">{player.career.wickets}</td>
                        <td className="num text-right">{player.career.economy?.toFixed(2) ?? "—"}</td>
                        <td className="text-right">
                          {player.fairValue ? (
                            <span className="chip">{player.fairValue.tier}</span>
                          ) : (
                            <span className="text-xs text-faint">Unrated</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:hidden">
            {result.players.map((player) => (
              <Link
                key={player.id}
                href={`/admin/players/${player.id}`}
                className="panel card-hover flex items-center gap-3 p-3.5"
              >
                <PlayerAvatar name={player.name} teamId={player.teamId} role={player.role} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-semibold uppercase leading-tight tracking-wide">
                    {player.name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <RoleChip role={player.role} label={player.roleLabel} />
                    {player.teamShort && <span className="text-[0.65rem] text-faint">{player.teamShort}</span>}
                  </div>
                  <p className="num mt-1.5 text-[0.68rem] text-muted">
                    OVR {player.ovr ?? "—"} · {player.fairValue ? formatLakh(player.fairValue.valueLakh) : "—"}
                  </p>
                  <p className="num mt-0.5 text-[0.62rem] text-faint">
                    {player.career.matches} M · {player.career.runs.toLocaleString("en-IN")} runs ·{" "}
                    {player.career.wickets} wkts
                  </p>
                </div>
              </Link>
            ))}
          </div>

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

        </>
      )}
    </div>
  );
}
