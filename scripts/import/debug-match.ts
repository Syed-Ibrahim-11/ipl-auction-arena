import path from "node:path";
import { parseCricsheet } from "./cricsheet";
import { parseAuctionCsv } from "./auction";
import { parseOpenIpl } from "./openipl";
import { matchScore } from "@/lib/data/names";

const cs = parseCricsheet(
  path.join(process.cwd(), "data/sources/cricsheet/cricsheet-ipl-json-2026-10-07.zip"),
  path.join(process.cwd(), "data/sources/cricsheet/people.csv"),
);
const auction = parseAuctionCsv(
  path.join(process.cwd(), "data/sources/auction/IPL_Auction_2026_Sold_Player.csv"),
);
const openipl = parseOpenIpl(path.join(process.cwd(), "data/sources/openipl-2026"), 2026);
const team2026 = new Map(openipl.players.map((p) => [p.cricsheetId, p.teamId]));
const latest = new Map<string, { team: string; season: number }>();
for (const match of cs.matches) {
  for (const stat of match.playerStats) {
    const existing = latest.get(stat.playerId);
    if (!existing || match.season >= existing.season) {
      latest.set(stat.playerId, { team: stat.teamId, season: match.season });
    }
  }
}

type Candidate = { id: string; name: string; lastTeam?: string; lastSeason?: number; source: "ipl" | "global" | "openauc" };
const candidates: Candidate[] = [
  ...cs.people.values().map((person) => ({
    id: person.id,
    name: person.name,
    lastTeam: latest.get(person.id)?.team,
    lastSeason: latest.get(person.id)?.season,
    source: "ipl" as const,
  })),
  ...[...cs.registry.values()]
    .filter((person) => !cs.people.has(person.id))
    .map((person) => ({ id: person.id, name: person.name, source: "global" as const })),
];
console.log("candidates", candidates.length);

for (const player of auction.players) {
  const scored = candidates
    .map((candidate) => ({ candidate, score: matchScore(player.name, candidate.name) }))
    .filter((row) => row.score >= 84)
    .sort((a, b) => b.score - a.score || b.candidate.name.localeCompare(a.candidate.name));
  const topScore = scored[0]?.score;
  const exact = scored.filter((row) => row.score === topScore);
  const iplTop = exact.filter((row) => row.candidate.source === "ipl");
  const teamTop = exact.filter((row) => team2026.get(row.candidate.id) === player.teamId || row.candidate.lastTeam === player.teamId);
  const chosen = teamTop[0] ?? iplTop[0] ?? exact[0];
  if (!chosen || chosen.score < 90) {
    console.log(`UNLINKED: ${player.name} -> ${player.teamName}  top=${topScore ?? 0}`);
    console.log("   candidates", exact.slice(0, 4).map((row) => `${row.candidate.name}/${row.candidate.source}/${team2026.get(row.candidate.id) ?? row.candidate.lastTeam ?? "?"}/${row.score}`));
  } else if (exact.length > 1 && teamTop.length !== 1 && iplTop.length !== 1) {
    console.log(`AMBIGUOUS: ${player.name} -> ${chosen.candidate.name} (${chosen.score})`);
    console.log("   ", exact.slice(0, 5).map((row) => `${row.candidate.name}/${row.candidate.source}/${team2026.get(row.candidate.id) ?? row.candidate.lastTeam ?? "?"}/${row.score}`));
  } else if (teamTop.length > 1) {
    console.log(`TEAM-AMBIGUOUS: ${player.name} -> ${chosen.candidate.name}`, teamTop.map((r) => r.candidate.name));
  }
}
