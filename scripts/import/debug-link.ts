import path from "node:path";
import { parseCricsheet } from "./cricsheet";
import { parseAuctionCsv } from "./auction";
import { parseOpenIpl } from "./openipl";
import { loadWikidataCache } from "./wikidata";
import { matchScore } from "@/lib/data/names";

const cs = parseCricsheet(
  path.join(process.cwd(), "data/sources/cricsheet/cricsheet-ipl-json-2026-10-07.zip"),
  path.join(process.cwd(), "data/sources/cricsheet/people.csv"),
);
const auction = parseAuctionCsv(
  path.join(process.cwd(), "data/sources/auction/IPL_Auction_2026_Sold_Player.csv"),
);
const openipl = parseOpenIpl(path.join(process.cwd(), "data/sources/openipl-2026"), 2026);
const wiki = loadWikidataCache();
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
const candidates = [
  ...cs.people.values().map((p) => ({ id: p.id, name: p.name, source: "ipl" as const })),
  ...[...cs.registry.values()]
    .filter((p) => !cs.people.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, source: "global" as const })),
];

for (const player of auction.players) {
  const scored = candidates
    .map((candidate) => ({ candidate, score: matchScore(player.name, candidate.name) }))
    .filter((row) => row.score >= 90)
    .sort((a, b) => b.score - a.score);
  const topScore = scored[0]?.score ?? 0;
  const exact = scored.filter((row) => row.score === topScore);
  const teamTop = exact.filter(
    (row) => team2026.get(row.candidate.id) === player.teamId || latest.get(row.candidate.id)?.team === player.teamId,
  );
  const iplTop = exact.filter((row) => row.candidate.source === "ipl");
  const chosen = teamTop[0] ?? iplTop[0] ?? exact[0];
  if (!chosen) {
    console.log(`${player.name.padEnd(22)} UNLINKED (${player.teamName})`);
    continue;
  }
  const key = cs.people.get(chosen.candidate.id)?.keyCricinfo ?? cs.registry.get(chosen.candidate.id)?.keyCricinfo;
  const record = key ? wiki?.records[key] : undefined;
  const label = record?.label ?? record?.wikiTitle ?? "";
  console.log(
    `${player.name.padEnd(22)} -> ${chosen.candidate.name.padEnd(22)} ${String(chosen.score).padStart(3)} ${chosen.candidate.source.padEnd(6)} team=${(team2026.get(chosen.candidate.id) ?? latest.get(chosen.candidate.id)?.team ?? "-").padEnd(26)} wiki=${label} [${record?.countries.join("/") ?? ""}] ${exact.length > 1 ? "of " + exact.map((r) => r.candidate.name).join(",") : ""}`,
  );
}
