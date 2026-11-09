import type { LineupInput } from "./types";

export type AutoXiCandidate = {
  id: string;
  name: string;
  role: string;
  isOverseas: boolean;
  isKeeper: boolean;
  batting: number;
  bowling: number;
  fielding: number;
  score: number;
};

export type AutoXiResult = {
  playerIds: string[];
  battingOrder: string[];
  captainId: string;
  keeperId: string;
};

const ROLE_ORDER_PENALTY: Record<string, number> = {
  batter: 0,
  wicketkeeper: 4,
  "all-rounder": 7,
  bowler: 55,
  unknown: 12,
};

function addCandidate(
  selected: AutoXiCandidate[],
  used: Set<string>,
  candidate: AutoXiCandidate,
  overseasMax: number,
): boolean {
  if (used.has(candidate.id)) return false;
  const overseas = selected.filter((player) => player.isOverseas).length;
  if (candidate.isOverseas && overseas >= overseasMax) return false;
  selected.push(candidate);
  used.add(candidate.id);
  return true;
}

export function autoSelectXi(candidates: AutoXiCandidate[], overseasMax = 4): AutoXiResult {
  if (candidates.length < 11) {
    throw new Error(`A squad needs at least 11 players to name an XI; only ${candidates.length} are registered.`);
  }
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const selected: AutoXiCandidate[] = [];
  const used = new Set<string>();

  const bestKeeper = sorted.find((candidate) => candidate.isKeeper);
  if (bestKeeper) addCandidate(selected, used, bestKeeper, overseasMax);

  const bowlers = [...candidates]
    .filter((candidate) => !used.has(candidate.id) && candidate.bowling >= 55)
    .sort((a, b) => b.bowling - a.bowling || b.score - a.score);
  for (const bowler of bowlers) {
    if (selected.filter((candidate) => candidate.bowling >= 55).length >= 4) break;
    addCandidate(selected, used, bowler, overseasMax);
  }

  for (const candidate of sorted) {
    if (selected.length >= 11) break;
    addCandidate(selected, used, candidate, overseasMax);
  }
  if (selected.length < 11) {
    throw new Error("Not enough eligible players to name an XI under the four-overseas limit.");
  }

  const battingOrder = [...selected]
    .sort((a, b) => {
      const scoreA = 100 - a.batting + (ROLE_ORDER_PENALTY[a.role] ?? 12);
      const scoreB = 100 - b.batting + (ROLE_ORDER_PENALTY[b.role] ?? 12);
      if (scoreA !== scoreB) return scoreA - scoreB;
      return b.batting - a.batting || a.name.localeCompare(b.name);
    })
    .map((candidate) => candidate.id);

  const captain = [...selected].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))[0];
  const keeper =
    selected.find((candidate) => candidate.isKeeper) ??
    [...selected].sort((a, b) => b.fielding - a.fielding || b.score - a.score)[0];

  return {
    playerIds: selected.map((candidate) => candidate.id),
    battingOrder,
    captainId: captain.id,
    keeperId: keeper.id,
  };
}

export function validateLineup(
  input: LineupInput,
  candidates: AutoXiCandidate[],
  overseasMax = 4,
): string | null {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const ids = [...new Set(input.playerIds)];
  if (ids.length !== 11 || input.playerIds.length !== 11) {
    return "Name exactly 11 players in the XI.";
  }
  if (ids.some((id) => !byId.has(id))) {
    return "The XI includes a player who is not in this squad.";
  }
  const overseas = ids.filter((id) => byId.get(id)?.isOverseas).length;
  if (overseas > overseasMax) {
    return `The XI includes ${overseas} overseas players; the limit is ${overseasMax}.`;
  }
  const order = [...new Set(input.battingOrder)];
  if (order.length !== 11 || input.battingOrder.length !== 11) {
    return "Set a unique batting position for all 11 players.";
  }
  if (order.some((id) => !ids.includes(id))) {
    return "The batting order contains a player who is not in the XI.";
  }
  if (!ids.includes(input.captainId)) return "Choose a captain from the XI.";
  if (!ids.includes(input.keeperId)) return "Choose a wicketkeeper from the XI.";
  return null;
}
