/**
 * Fetches the official franchise crests, current squad portraits and jersey
 * numbers published on iplt20.com and stores them locally so the simulator
 * never hotlinks third-party media at runtime.
 *
 * Run with: node scripts/fetch-brand-assets.mjs
 */
import Database from "better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "data", "ipl-arena.db");
const TEAM_DIR = path.join(ROOT, "public", "brand", "teams");
const PLAYER_DIR = path.join(ROOT, "public", "brand", "players");
const MANIFEST_PATH = path.join(ROOT, "src", "lib", "data", "brand-assets.json");

const TEAM_SLUGS = [
  "chennai-super-kings",
  "mumbai-indians",
  "royal-challengers-bengaluru",
  "kolkata-knight-riders",
  "sunrisers-hyderabad",
  "delhi-capitals",
  "rajasthan-royals",
  "punjab-kings",
  "gujarat-titans",
  "lucknow-super-giants",
];

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  accept: "*/*",
};

function normalise(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function surname(value) {
  const parts = normalise(value).split(" ");
  return parts[parts.length - 1] ?? "";
}

async function download(url, destination) {
  try {
    const existing = await fs.stat(destination);
    if (existing.size > 0) return existing.size;
  } catch {
    // Not cached yet.
  }
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, buffer);
  return buffer.length;
}

function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) grid[i][0] = i;
  for (let j = 0; j < cols; j += 1) grid[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return grid[rows - 1][cols - 1];
}

async function fetchSquad(slug) {
  const url = `https://www.iplt20.com/api/bff/cms/teams/${slug}?tab=squad`;
  const response = await fetch(url, { headers: { ...HEADERS, accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  const payload = await response.json();
  if (!payload?.data?.squad?.players) throw new Error(`No squad payload for ${slug}`);
  return payload.data;
}

const db = new Database(DB_PATH, { readonly: true });
const dbPlayers = db
  .prepare("SELECT id, full_name, short_name FROM players")
  .all();
const aliasRows = db
  .prepare("SELECT player_id, alias FROM player_aliases")
  .all();
db.close();

const byFull = new Map();
const byNormalised = new Map();
const bySurname = new Map();
for (const player of dbPlayers) {
  byFull.set(player.full_name, player);
  const key = normalise(player.full_name);
  if (!byNormalised.has(key)) byNormalised.set(key, player);
  const key2 = normalise(player.short_name);
  if (!byNormalised.has(key2)) byNormalised.set(key2, player);
  const last = surname(player.full_name);
  if (!bySurname.has(last)) bySurname.set(last, []);
  bySurname.get(last).push(player);
}
for (const row of aliasRows) {
  const key = normalise(row.alias);
  if (!byNormalised.has(key)) {
    byNormalised.set(key, { id: row.player_id, full_name: row.alias, short_name: row.alias });
  }
}

function matchPlayer(name) {
  const exact = byFull.get(name);
  if (exact) return exact;
  const normal = normalise(name);
  const direct = byNormalised.get(normal);
  if (direct) return direct;
  const byLast = bySurname.get(surname(name)) ?? [];
  if (byLast.length === 1) return byLast[0];
  const firstInitial = normal.split(" ")[0]?.[0];
  const candidates = byLast.filter((player) => normalise(player.full_name).startsWith(firstInitial));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    const loose = dbPlayers.filter(
      (player) =>
        normalise(player.full_name).startsWith(firstInitial) &&
        editDistance(surname(name), surname(player.full_name)) <= 2,
    );
    if (loose.length === 1) return loose[0];
  }
  return null;
}

async function main() {
  await fs.mkdir(TEAM_DIR, { recursive: true });
  await fs.mkdir(PLAYER_DIR, { recursive: true });

  const teams = {};
  const players = {};
  const unmatched = [];
  const downloaded = new Set();

  for (const slug of TEAM_SLUGS) {
    process.stdout.write(`team ${slug} ... `);
    const data = await fetchSquad(slug);
    const ext = data.externalId;
    const logos = {
      light: `https://www.iplt20.com/api/team-assets?pathname=static%2Fteams%2F${ext}%2Ficon-light.svg`,
      dark: `https://www.iplt20.com/api/team-assets?pathname=static%2Fteams%2F${ext}%2Ficon-dark.svg`,
    };
    const lightPath = `/brand/teams/${slug}.svg`;
    const darkPath = `/brand/teams/${slug}-dark.svg`;
    const lightBytes = await download(logos.light, path.join(ROOT, "public", lightPath));
    const darkBytes = await download(logos.dark, path.join(ROOT, "public", darkPath));

    teams[slug] = {
      name: data.title,
      externalId: ext,
      logo: lightPath,
      logoDark: darkPath,
      source: `https://www.iplt20.com/teams/${slug}`,
    };

    let matched = 0;
    for (const entry of data.squad.players) {
      const player = matchPlayer(entry.name);
      if (!player) {
        unmatched.push({ team: slug, name: entry.name, jersey: entry.jerseyNumber });
        continue;
      }
      if (downloaded.has(player.id)) continue;
      const candidates = [
        { url: entry.imageUrlSet?.medium, ext: "webp" },
        { url: entry.imageUrlSet?.large, ext: "webp" },
        { url: entry.imageUrl, ext: "png" },
      ].filter((candidate) => Boolean(candidate.url));
      let savedPath = null;
      for (const candidate of candidates) {
        const relative = `/brand/players/${player.id}.${candidate.ext}`;
        try {
          await download(candidate.url, path.join(ROOT, "public", relative));
          savedPath = relative;
          break;
        } catch {
          // Try the next rendition.
        }
      }
      if (!savedPath) {
        unmatched.push({ team: slug, name: entry.name, reason: "No downloadable portrait" });
        continue;
      }
      downloaded.add(player.id);
      matched += 1;
      players[player.id] = {
        photo: savedPath,
        jersey: entry.jerseyNumber ? String(entry.jerseyNumber) : null,
        officialName: entry.name,
        teamId: slug,
        role: entry.role,
        country: entry.country,
        source: `https://www.iplt20.com/teams/${slug}/squad`,
      };
    }
    console.log(`${data.squad.players.length} squad rows, ${matched} portraits (${lightBytes + darkBytes} B crest)`);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "https://www.iplt20.com/teams",
    note:
      "Crests, squad portraits and jersey numbers are read from the official IPL team pages and stored locally with attribution. They remain the property of their respective owners.",
    teams,
    players,
    unmatched,
  };
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(
    `\nWrote ${MANIFEST_PATH}\n${Object.keys(teams).length} team crests, ${Object.keys(players).length} player portraits, ${unmatched.length} unmatched squad rows.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
