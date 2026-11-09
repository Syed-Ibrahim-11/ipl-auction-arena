"use client";

import { Check, RotateCcw, Sparkles } from "lucide-react";
import type { RetentionTeam } from "@/lib/auction/mini2027";
import { formatLakh } from "@/lib/money";
import { cn } from "@/lib/cn";

export function RetentionPicker({
  team,
  selectedIds,
  onChange,
  capLakh,
  squadMax,
  overseasMax,
}: {
  team: RetentionTeam;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  capLakh: number;
  squadMax: number;
  overseasMax: number;
}) {
  const selected = new Set(selectedIds);
  const chosen = team.players.filter((player) => selected.has(player.playerId));
  const spend = chosen.reduce((sum, player) => sum + player.contractLakh, 0);
  const overseas = chosen.filter((player) => player.isOverseas).length;
  const purse = Math.max(0, capLakh - spend);
  const official = chosen.filter((player) => player.source === "contract-2026").length;

  function toggle(playerId: string) {
    if (selected.has(playerId)) {
      onChange(selectedIds.filter((id) => id !== playerId));
      return;
    }
    const player = team.players.find((entry) => entry.playerId === playerId);
    if (!player) return;
    if (chosen.length >= squadMax) return;
    if (player.isOverseas && overseas >= overseasMax) return;
    if (spend + player.contractLakh > capLakh) return;
    onChange([...selectedIds, playerId]);
  }

  return (
    <div className="rounded-xl border border-line bg-surface2/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="font-display text-sm font-bold uppercase tracking-[0.12em]">Retain your 2026 squad</p>
          <p className="mt-0.5 text-[0.65rem] text-faint">
            Most franchises keep a core of 6–8. Each player costs his official 2026 contract.
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onChange(team.defaultIds)}
          >
            <Sparkles size={12} /> Recommended
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange([])}
            disabled={selectedIds.length === 0}
          >
            <RotateCcw size={12} /> Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-line px-4 py-2.5 text-[0.65rem] sm:grid-cols-4">
        <Stat label="Retained" value={`${chosen.length} / ${squadMax}`} tone={chosen.length > squadMax ? "danger" : undefined} />
        <Stat label="Overseas" value={`${overseas} / ${overseasMax}`} tone={overseas > overseasMax ? "danger" : undefined} />
        <Stat label="Contracts" value={formatLakh(spend)} />
        <Stat label="Auction purse" value={formatLakh(purse)} />
      </div>

      <ul className="max-h-[19rem] divide-y divide-line/60 overflow-y-auto scrollbar-thin">
        {team.players.map((player) => {
          const active = selected.has(player.playerId);
          const blocked =
            !active &&
            (chosen.length >= squadMax ||
              (player.isOverseas && overseas >= overseasMax) ||
              spend + player.contractLakh > capLakh);
          return (
            <li key={player.playerId}>
              <button
                type="button"
                onClick={() => toggle(player.playerId)}
                disabled={blocked}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors",
                  active ? "bg-accent/5" : "hover:bg-surface2/70",
                  blocked && "cursor-not-allowed opacity-45",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    active ? "border-accent bg-accent text-bg" : "border-lineStrong",
                  )}
                  aria-hidden="true"
                >
                  {active && <Check size={11} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[0.76rem] font-semibold">{player.name}</span>
                    {player.isOverseas && <span className="chip chip-gold px-1.5 py-0 text-[0.5rem]">OS</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[0.58rem] text-faint">
                    <span className="capitalize">{player.role.replace("-", " ")}</span>
                    <span>·</span>
                    <span className={player.source === "contract-2026" ? "text-success" : "text-muted"}>
                      {player.source === "contract-2026" ? "Official 2026 contract" : "Contract estimate"}
                    </span>
                  </span>
                </span>
                <span className="num shrink-0 text-right">
                  <span className="block text-[0.72rem] font-semibold">{formatLakh(player.contractLakh)}</span>
                  {player.auctionPriceLakh !== null && (
                    <span className="block text-[0.52rem] text-faint">2026 deal</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-line px-4 py-2 text-[0.58rem] leading-relaxed text-faint">
        {chosen.length < 18
          ? `${18 - chosen.length} more player${18 - chosen.length === 1 ? "" : "s"} needed at auction to reach the 18-player minimum. Unchecked players join the auction.`
          : `${official} official 2026 contract${official === 1 ? "" : "s"} · final squad may hold ${squadMax}.`}
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <p className="text-[0.52rem] uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className={cn("num mt-0.5 text-sm font-semibold", tone === "danger" && "text-danger")}>{value}</p>
    </div>
  );
}
