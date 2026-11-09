"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { OvrBadge, RoleChip } from "@/components/ui";
import type { RecapLot } from "@/lib/auction/recap";
import { formatLakh } from "@/lib/money";
import { cn } from "@/lib/cn";

type Sort = "price-desc" | "price-asc" | "lot" | "ovr";

const TOP_LIMIT = 15;

export function RecapLedger({
  lots,
  userTeamId,
}: {
  lots: RecapLot[];
  userTeamId: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("price-desc");
  const [showUnsold, setShowUnsold] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = lots.filter((lot) => {
      if (lot.status !== "sold" && lot.status !== "unsold") return false;
      if (!showUnsold && lot.status !== "sold") return false;
      if (needle && !lot.playerName.toLowerCase().includes(needle) && !lot.setName.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      if (sort === "price-desc" || sort === "price-asc") {
        const diff = (b.finalPriceLakh ?? 0) - (a.finalPriceLakh ?? 0);
        return sort === "price-desc" ? diff : -diff;
      }
      if (sort === "ovr") return (b.ovr ?? 0) - (a.ovr ?? 0);
      return a.lotNumber - b.lotNumber;
    });
  }, [lots, query, sort, showUnsold]);

  const shown = showAll ? filtered : filtered.slice(0, TOP_LIMIT);

  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Search players</span>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player or set"
            className="input h-9 min-h-0 pl-8 text-xs"
          />
        </label>
        <select
          className="select h-9 min-h-0 w-auto text-xs"
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
          aria-label="Sort lots"
        >
          <option value="price-desc">Sort: highest price</option>
          <option value="price-asc">Sort: lowest price</option>
          <option value="lot">Sort: lot order</option>
          <option value="ovr">Sort: rating</option>
        </select>
        <button
          type="button"
          onClick={() => setShowUnsold((value) => !value)}
          aria-pressed={showUnsold}
          className={cn(
            "rounded-full border px-3 py-1.5 text-[0.68rem] font-semibold transition-colors",
            showUnsold ? "border-accent/50 bg-accent/10 text-accent2" : "border-line bg-surface2 text-muted hover:text-fg",
          )}
        >
          Unsold
        </button>
        <span className="text-[0.68rem] text-faint">
          {showAll ? filtered.length : Math.min(filtered.length, TOP_LIMIT)} of {filtered.length}
        </span>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="data-table min-w-[620px]">
          <thead>
            <tr>
              <th>Player</th>
              <th>Role</th>
              <th className="text-right">Base</th>
              <th className="text-right">Hammer</th>
              <th>Team</th>
              <th className="text-right">OVR</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((lot) => (
              <tr key={lot.id}>
                <td>
                  <Link href={`/players/${lot.playerId}`} className="font-medium hover:text-accent2">
                    {lot.playerName}
                  </Link>
                  <span className="mt-0.5 block text-[0.6rem] uppercase tracking-[0.08em] text-faint">
                    {lot.setName}
                  </span>
                </td>
                <td>
                  <RoleChip role={lot.role} />
                </td>
                <td className="num text-right text-muted">{formatLakh(lot.basePriceLakh, { compact: true })}</td>
                <td className="num text-right font-semibold">
                  {lot.status === "unsold" ? <span className="text-faint">Unsold</span> : formatLakh(lot.finalPriceLakh)}
                </td>
                <td>
                  {lot.winningTeamShort ? (
                    <span className={cn("text-xs font-semibold", lot.winningTeamId === userTeamId && "text-accent2")}>
                      {lot.winningTeamShort}
                      {lot.winningTeamId === userTeamId && " · you"}
                    </span>
                  ) : (
                    <span className="text-xs text-faint">—</span>
                  )}
                </td>
                <td className="text-right">
                  <span className="inline-flex justify-end">
                    <OvrBadge value={lot.ovr} size="sm" />
                  </span>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-faint">
                  No resolved lots match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > TOP_LIMIT && (
        <div className="border-t border-line p-3 text-center">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll((value) => !value)}>
            {showAll ? `Show top ${TOP_LIMIT}` : `Show all ${filtered.length} lots`}
          </button>
        </div>
      )}
    </div>
  );
}
