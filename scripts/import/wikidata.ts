import fs from "node:fs";
import path from "node:path";

export type WikidataPlayer = {
  qid: string;
  label: string | null;
  wikiTitle: string | null;
  countries: string[];
  birthDate: string | null;
  bowlingStyle: string | null;
  sitelinks: number;
};

export type WikidataCache = {
  retrievedAt: string;
  source: string;
  licence: string;
  records: Record<string, WikidataPlayer>;
};

export const WIKIDATA_CACHE_PATH = path.join(
  process.cwd(),
  "data",
  "sources",
  "wikidata",
  "players.json",
);

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "IPLAuctionArena/0.1 (educational cricket analytics project; Wikidata enrichment)";

type SparqlBinding = {
  espn?: { value: string };
  person?: { value: string };
  personLabel?: { value: string };
  birth?: { value: string };
  countryLabel?: { value: string };
  bowlingLabel?: { value: string };
  sitelinks?: { value: string };
  article?: { value: string };
};

export function loadWikidataCache(): WikidataCache | null {
  if (!fs.existsSync(WIKIDATA_CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(WIKIDATA_CACHE_PATH, "utf8")) as WikidataCache;
  } catch {
    return null;
  }
}

function buildQuery(keys: string[]): string {
  const values = keys.map((key) => `"${key}"`).join(" ");
  return `SELECT ?espn ?person ?personLabel ?birth ?countryLabel ?bowlingLabel ?sitelinks ?article WHERE {
  VALUES ?espn { ${values} }
  ?person wdt:P2697 ?espn .
  OPTIONAL { ?person wdt:P569 ?birth . }
  OPTIONAL { ?person wdt:P27 ?country . }
  OPTIONAL { ?person wdt:P2545 ?bowling . }
  OPTIONAL { ?person wikibase:sitelinks ?sitelinks . }
  OPTIONAL { ?article schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

async function queryBatch(keys: string[]): Promise<SparqlBinding[]> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(buildQuery(keys))}`;
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`Wikidata returned HTTP ${response.status}`);
      const payload = (await response.json()) as {
        results?: { bindings?: SparqlBinding[] };
      };
      return payload.results?.bindings ?? [];
    } catch (error) {
      lastError = error as Error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError ?? new Error("Wikidata query failed");
}

export async function fetchWikidata(
  keys: string[],
  options: { batchSize?: number; delayMs?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ cache: WikidataCache; warnings: string[] }> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  const batchSize = options.batchSize ?? 75;
  const delayMs = options.delayMs ?? 300;
  const warnings: string[] = [];
  const records: Record<string, WikidataPlayer> = {};
  let done = 0;

  for (let start = 0; start < uniqueKeys.length; start += batchSize) {
    const batch = uniqueKeys.slice(start, start + batchSize);
    let bindings: SparqlBinding[] = [];
    try {
      bindings = await queryBatch(batch);
    } catch (error) {
      warnings.push(`Wikidata batch ${start / batchSize + 1} failed: ${(error as Error).message}`);
      done += batch.length;
      options.onProgress?.(done, uniqueKeys.length);
      continue;
    }
    const grouped = new Map<string, SparqlBinding[]>();
    for (const binding of bindings) {
      const key = binding.espn?.value;
      if (!key) continue;
      const list = grouped.get(key) ?? [];
      list.push(binding);
      grouped.set(key, list);
    }
    for (const [key, rows] of grouped) {
      const best = rows.reduce((current, row) => {
        const currentLinks = Number(current.sitelinks?.value ?? 0);
        const rowLinks = Number(row.sitelinks?.value ?? 0);
        return rowLinks > currentLinks ? row : current;
      }, rows[0]);
      const qid = best.person?.value.split("/").pop() ?? "";
      if (!qid) continue;
      const countries = [
        ...new Set(rows.map((row) => row.countryLabel?.value).filter((v): v is string => Boolean(v))),
      ].sort((a, b) => (a === "India" ? -1 : b === "India" ? 1 : a.localeCompare(b)));
      const bowlingStyles = [
        ...new Set(rows.map((row) => row.bowlingLabel?.value).filter((v): v is string => Boolean(v))),
      ];
      const birthValues = rows
        .map((row) => row.birth?.value)
        .filter((v): v is string => Boolean(v))
        .sort();
      const articleUrl = rows.map((row) => row.article?.value).find(Boolean);
      const wikiTitle = articleUrl
        ? decodeURIComponent(articleUrl.split("/wiki/")[1] ?? "").replace(/_/g, " ") || null
        : null;
      const rawLabel = best.personLabel?.value ?? null;
      records[key] = {
        qid,
        label: rawLabel && !/^Q\d+$/.test(rawLabel) ? rawLabel : null,
        wikiTitle,
        countries,
        birthDate: birthValues[0]?.slice(0, 10) ?? null,
        bowlingStyle: bowlingStyles.join(" / ") || null,
        sitelinks: Number(best.sitelinks?.value ?? 0),
      };
    }
    done += batch.length;
    options.onProgress?.(done, uniqueKeys.length);
    if (start + batchSize < uniqueKeys.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const cache: WikidataCache = {
    retrievedAt: new Date().toISOString(),
    source: "Wikidata Query Service (P2697 ESPNcricinfo player ID)",
    licence: "CC0 1.0 (Wikidata structured data)",
    records,
  };
  fs.mkdirSync(path.dirname(WIKIDATA_CACHE_PATH), { recursive: true });
  const temporary = `${WIKIDATA_CACHE_PATH}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(cache, null, 2));
  fs.renameSync(temporary, WIKIDATA_CACHE_PATH);
  return { cache, warnings };
}
