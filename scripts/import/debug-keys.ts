import path from "node:path";
import { parseCricsheet } from "./cricsheet";

const result = parseCricsheet(
  path.join(process.cwd(), "data/sources/cricsheet/cricsheet-ipl-json-2026-10-07.zip"),
  path.join(process.cwd(), "data/sources/cricsheet/people.csv"),
);
const withKey = [...result.people.values()].filter((person) => person.keyCricinfo);
console.log("people", result.people.size, "with keyCricinfo", withKey.length);
console.log("unique keys", new Set(withKey.map((person) => person.keyCricinfo)).size);
console.log("missing key sample", [...result.people.values()].filter((person) => !person.keyCricinfo).slice(0, 20));
