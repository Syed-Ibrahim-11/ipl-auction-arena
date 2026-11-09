import path from "node:path";
import { parseCricsheet } from "./cricsheet";
import { fetchWikidata, WIKIDATA_CACHE_PATH } from "./wikidata";

const result = parseCricsheet(
  path.join(process.cwd(), "data/sources/cricsheet/cricsheet-ipl-json-2026-10-07.zip"),
  path.join(process.cwd(), "data/sources/cricsheet/people.csv"),
);
const keys = [...result.people.values()]
  .map((person) => person.keyCricinfo)
  .filter((key): key is string => Boolean(key));

async function main() {
  console.log(`Fetching Wikidata for ${keys.length} players...`);
  const { cache, warnings } = await fetchWikidata(keys, {
    onProgress: (done, total) => console.log(`  ${done}/${total}`),
  });
  console.log("saved", WIKIDATA_CACHE_PATH, "records", Object.keys(cache.records).length);
  console.log("warnings", warnings);
}

void main();
