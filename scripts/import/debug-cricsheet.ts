import path from "node:path";
import { parseCricsheet } from "./cricsheet";

const t0 = Date.now();
const result = parseCricsheet(
  path.join(process.cwd(), "data/sources/cricsheet/cricsheet-ipl-json-2026-10-07.zip"),
  path.join(process.cwd(), "data/sources/cricsheet/people.csv"),
);
console.log("seconds", ((Date.now() - t0) / 1000).toFixed(1));
console.log(result.stats);
console.log("people", result.people.size, "career", result.career.size, "seasons", result.seasons.size);
console.log("warnings", result.warnings.slice(0, 10), "total", result.warnings.length);
const seasons = new Map<number, number>();
for (const match of result.matches) seasons.set(match.season, (seasons.get(match.season) ?? 0) + 1);
console.log("matches by season", [...seasons.entries()].sort((a, b) => a[0] - b[0]));
const virat = [...result.people.values()].find((person) => person.name === "V Kohli");
console.log("virat", virat, virat ? result.career.get(virat.id) : null);
const recent = result.matches.filter((match) => match.season === 2026);
console.log("2026 matches", recent.length, "deliveries", recent.reduce((sum, match) => sum + match.deliveries.length, 0));
console.log("first 2026", recent[0]?.team1Id, recent[0]?.team1Score, recent[0]?.team2Id, recent[0]?.team2Score, recent[0]?.result, recent[0]?.playerOfMatch);
