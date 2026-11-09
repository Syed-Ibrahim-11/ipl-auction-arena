import path from "node:path";
import Database from "better-sqlite3";
import { recomputeRatings } from "@/lib/ratings/recompute";

const DB_PATH = process.env.IPL_DB_PATH ?? path.join(process.cwd(), "data", "ipl-arena.db");

const db = new Database(DB_PATH);
const summary = recomputeRatings(db);
console.log(
  `formula ${summary.formulaVersion} · ${summary.asOfSeason} · ${summary.ratedPlayers} rated players`,
);
console.log("distribution", summary.distribution);
console.table(summary.top);
console.log(
  `wrote ${summary.seasonVersions} season versions and ${summary.ratedPlayers} current ratings`,
);
