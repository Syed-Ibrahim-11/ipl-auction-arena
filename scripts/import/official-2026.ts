import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { slugify, normalizeName } from "@/lib/data/names";

/**
 * Builds src/lib/auction/official-2026-deals.ts from the ESPNcricinfo sold list.
 *
 * The supplied 2026 "sold player" CSV only held 77 rows and disagreed with the
 * official page for several players. This source adds every officially retained
 * squad member (shown with a dash for the base price) so the 2027 mini auction
 * can charge retentions at the real 2026 contract value.
 */

const CSV_PATH = path.join(process.cwd(), "data", "sources", "auction", "IPL_Auction_2026_Official.csv");
const OUT_PATH = path.join(process.cwd(), "src", "lib", "auction", "official-2026-deals.ts");
const DB_PATH = process.env.IPL_DB_PATH ?? path.join(process.cwd(), "data", "ipl-arena.db");

const TEAM_BY_SHORT: Record<string, string> = {
  CSK: "chennai-super-kings",
  MI: "mumbai-indians",
  RCB: "royal-challengers-bengaluru",
  KKR: "kolkata-knight-riders",
  SRH: "sunrisers-hyderabad",
  DC: "delhi-capitals",
  RR: "rajasthan-royals",
  PBKS: "punjab-kings",
  GT: "gujarat-titans",
  LSG: "lucknow-super-giants",
};

// ESPN's full-name slugs differ from the Cricsheet spellings kept in `players`.
const NAME_OVERRIDES: Record<string, string> = {
  "praveen-dubey": "Pravin Dubey",
  "aman-rao": "Aman Rao Perala",
  "mohammed-izhar": "Mohammad Izhar",
  "lungi-ngidi": "Lungisani Ngidi",
  "tejasvi-dahiya": "T Dahiya",
  "vijaykumar-vyshak": "Vyshak Vijay Kumar",
  "digvesh-rathi": "DS Rathi",
  "arshin-kulkarni": "AA Kulkarni",
  "manimaran-siddharth": "M Siddharth",
  "nicholas-pooran": "Nicolas Pooran",
  "sai-kishore": "Ravisrinivasan Sai Kishore",
  "m-shahrukh-khan": "Shahrukh Khan",
  "lhuan-dre-pretorius": "LG Pretorius",
  "donovan-ferreira": "Donavon Ferreira",
  "anukul-roy": "Anukul Roy priyansh Kumar",
  "vipraj-nigam": "V Nigam",
  "t-natarajan": "Thangarasu Natarajan",
  "ramakrishna-ghosh": "RS Ghosh",
  "ravichandran-smaran": "R Smaran",
  "raj-bawa": "Raj Angad Bawa",
  "am-ghazanfar": "Allah Mohammad Ghazanfar",
  "phil-salt": "Philip Salt",
  "auqib-nabi": "Auqib Dar",
  "vaibhav-sooryavanshi": "Vaibhav Suryavanshi",
};

const ROLE_BY_TAG: Record<string, string> = {
  BAT: "batter",
  BOWL: "bowler",
  AR: "all-rounder",
};

type Deal = {
  playerId: string;
  teamId: string;
  role: string;
  basePriceLakh: number | null;
  priceLakh: number;
  acquisition: "auction" | "retained";
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function toLakh(value: string): number | null {
  if (!value || value === "-") return null;
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

const db = new Database(DB_PATH, { readonly: true });
const players = db.prepare("SELECT id, full_name, role FROM players").all() as Array<{
  id: string;
  full_name: string;
  role: string;
}>;

const bySlug = new Map(players.map((player) => [slugify(player.full_name), player]));
const byNormalized = new Map(players.map((player) => [normalizeName(player.full_name), player]));

const lines = fs.readFileSync(CSV_PATH, "utf8").split(/\r?\n/).filter(Boolean);
const deals: Deal[] = [];
const unmatched: string[] = [];

for (const line of lines.slice(1)) {
  const cells = parseCsvLine(line);
  const [name, espnSlug, roleTag, teamShort, baseCr, soldCr] = cells;
  const teamId = TEAM_BY_SHORT[teamShort];
  if (!teamId) {
    unmatched.push(`${name} (unknown team ${teamShort})`);
    continue;
  }
  const slug = espnSlug.replace(/-\d+$/, "");
  const override = NAME_OVERRIDES[slug];
  const player =
    (override ? byNormalized.get(normalizeName(override)) : undefined) ??
    bySlug.get(slug) ??
    byNormalized.get(normalizeName(slug.replace(/-/g, " ")));
  if (!player) {
    unmatched.push(`${name} (${teamShort})`);
    continue;
  }
  const basePriceLakh = toLakh(baseCr);
  const priceLakh = toLakh(soldCr);
  if (priceLakh === null) {
    unmatched.push(`${name} (no sold price)`);
    continue;
  }
  deals.push({
    playerId: player.id,
    teamId,
    role: ROLE_BY_TAG[roleTag] ?? player.role,
    basePriceLakh,
    priceLakh,
    acquisition: basePriceLakh === null ? "retained" : "auction",
  });
}

const seen = new Set<string>();
const unique = deals.filter((deal) => {
  if (seen.has(deal.playerId)) return false;
  seen.add(deal.playerId);
  return true;
});

unique.sort((a, b) => a.teamId.localeCompare(b.teamId) || b.priceLakh - a.priceLakh || a.playerId.localeCompare(b.playerId));

const body = unique
  .map(
    (deal) =>
      `  { playerId: "${deal.playerId}", teamId: "${deal.teamId}", role: "${deal.role}", basePriceLakh: ${
        deal.basePriceLakh ?? "null"
      }, priceLakh: ${deal.priceLakh}, acquisition: "${deal.acquisition}" },`,
  )
  .join("\n");

const file = `// Generated by scripts/import/official-2026.ts — do not edit by hand.
// Source: ESPNcricinfo, IPL 2026 auction sold players (fetched 2026-11-09)
// https://www.cricinfo.com/auction/ipl-2026-auction-1515016/sold-players
// Rows with a dash for the base price are pre-auction retentions, priced at the
// player's existing 2026 contract.

export type OfficialDeal = {
  playerId: string;
  teamId: string;
  role: string;
  basePriceLakh: number | null;
  priceLakh: number;
  acquisition: "auction" | "retained";
};

export const OFFICIAL_2026_DEALS: readonly OfficialDeal[] = [
${body}
];

export const OFFICIAL_2026_DEAL_COUNT = ${unique.length};
`;

fs.writeFileSync(OUT_PATH, file);
console.log(`wrote ${unique.length} deals to ${OUT_PATH}`);
console.log(`unmatched (${unmatched.length}):`);
for (const entry of unmatched) console.log(`  - ${entry}`);
