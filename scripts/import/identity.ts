import type { AuctionSoldPlayer } from "./auction";
import type { CricsheetImport } from "./cricsheet";
import { matchScore, normalizeName, slugify } from "@/lib/data/names";

export type LinkMethod = "manual" | "exact" | "fuzzy" | "auction_only";

export type ResolvedAuctionIdentity = {
  auction: AuctionSoldPlayer;
  playerId: string;
  cricsheetId: string | null;
  matchName: string | null;
  method: LinkMethod;
  note: string | null;
};

const MANUAL_LINKS: Record<string, { cricsheetId: string; matchName: string; note: string }> = {
  "Wanindu Hasaranga": {
    cricsheetId: "a97c8ec2",
    matchName: "PWH de Silva",
    note: "Known as Wanindu Hasaranga; Cricsheet registers him by his legal initials and surname.",
  },
  "Auqib Dar": {
    cricsheetId: "7c3c0337",
    matchName: "Auqib Nabi",
    note: "Auqib Nabi Dar is registered in Cricsheet as Auqib Nabi.",
  },
  "Cameron Green": {
    cricsheetId: "eaa76d3c",
    matchName: "C Green",
    note: "Disambiguated from CJ Green (Chris Green), a different player.",
  },
  "Jack Edwards": {
    cricsheetId: "f787e0eb",
    matchName: "J Edwards",
    note: "Disambiguated from JD Edwards (born 1860), a historical namesake.",
  },
};

const AUCTION_ONLY = new Set(["Mangesh Yadav"]);

export const NATIONALITY_OVERRIDES: Record<string, { countries: string[]; note: string }> = {
  "Chris Gayle": {
    countries: ["Jamaica"],
    note: "Wikidata P27 incorrectly lists Australia; overridden to Jamaica for this simulator.",
  },
  "Jacob Duffy": {
    countries: ["New Zealand"],
    note: "Wikidata returned an implausible additional citizenship; overridden to New Zealand.",
  },
};

type Candidate = {
  id: string;
  name: string;
  source: "ipl" | "global";
  team2026: string | null;
};

function latestTeams(cs: CricsheetImport): Map<string, { teamId: string; season: number }> {
  const latest = new Map<string, { teamId: string; season: number }>();
  for (const match of cs.matches) {
    for (const stat of match.playerStats) {
      const existing = latest.get(stat.playerId);
      if (!existing || match.season >= existing.season) {
        latest.set(stat.playerId, { teamId: stat.teamId, season: match.season });
      }
    }
  }
  return latest;
}

export function resolveAuctionIdentities(
  auctionPlayers: AuctionSoldPlayer[],
  cs: CricsheetImport,
  team2026: Map<string, string>,
): { identities: ResolvedAuctionIdentity[]; warnings: string[] } {
  const warnings: string[] = [];
  const latest = latestTeams(cs);
  const candidates: Candidate[] = [
    ...cs.people.values().map((person) => ({
      id: person.id,
      name: person.name,
      source: "ipl" as const,
      team2026: team2026.get(person.id) ?? null,
    })),
    ...[...cs.registry.values()]
      .filter((person) => !cs.people.has(person.id) && !person.id.startsWith("csname-"))
      .map((person) => ({
        id: person.id,
        name: person.name,
        source: "global" as const,
        team2026: null,
      })),
  ];
  const globalExact = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    if (candidate.source !== "global") continue;
    const key = normalizeName(candidate.name);
    const list = globalExact.get(key) ?? [];
    list.push(candidate);
    globalExact.set(key, list);
  }

  const identities: ResolvedAuctionIdentity[] = [];
  const usedPlayerIds = new Map<string, string>();

  for (const auction of auctionPlayers) {
    let chosen: Candidate | null = null;
    let method: LinkMethod = "auction_only";
    let note: string | null = null;

    const manual = MANUAL_LINKS[auction.name];
    if (manual) {
      const person = cs.people.get(manual.cricsheetId) ?? cs.registry.get(manual.cricsheetId);
      if (!person) {
        warnings.push(`Manual link for ${auction.name} points to missing Cricsheet ID ${manual.cricsheetId}`);
      } else {
        chosen = {
          id: person.id,
          name: person.name,
          source: cs.people.has(person.id) ? "ipl" : "global",
          team2026: team2026.get(person.id) ?? null,
        };
        method = "manual";
        note = manual.note;
      }
    } else if (!AUCTION_ONLY.has(auction.name)) {
      const exactIpl = [...cs.people.values()].filter(
        (person) => normalizeName(person.name) === normalizeName(auction.name),
      );
      if (exactIpl.length === 1) {
        const person = exactIpl[0];
        chosen = {
          id: person.id,
          name: person.name,
          source: "ipl",
          team2026: team2026.get(person.id) ?? null,
        };
        method = "exact";
      } else {
        const scored = candidates
          .filter((candidate) => candidate.source === "ipl")
          .map((candidate) => ({ candidate, score: matchScore(auction.name, candidate.name) }))
          .filter((row) => row.score >= 90)
          .sort((a, b) => b.score - a.score);
        const topScore = scored[0]?.score ?? 0;
        const tied = scored.filter((row) => row.score === topScore);
        const teamTop = tied.filter(
          (row) =>
            row.candidate.team2026 === auction.teamId ||
            latest.get(row.candidate.id)?.teamId === auction.teamId,
        );
        chosen = (teamTop[0] ?? tied[0])?.candidate ?? null;
        if (chosen) method = "fuzzy";

        if (!chosen) {
          const exactGlobal = globalExact.get(normalizeName(auction.name)) ?? [];
          if (exactGlobal.length === 1) {
            chosen = exactGlobal[0];
            method = "exact";
          }
        }
      }
    } else {
      note = "No reliable Cricsheet identity; kept as an auction-only prospect rather than fuzzy-matched to a namesake.";
    }

    let playerId: string;
    if (chosen) {
      playerId = chosen.id;
      const previous = usedPlayerIds.get(playerId);
      if (previous) {
        warnings.push(
          `Auction players ${previous} and ${auction.name} both resolved to ${chosen.name} (${playerId}); ${auction.name} will be auction-only.`,
        );
        chosen = null;
        method = "auction_only";
        note = "Identity collision with another auction player; kept auction-only.";
        playerId = `auc-${slugify(auction.name)}`;
      }
    } else {
      playerId = `auc-${slugify(auction.name)}`;
    }
    usedPlayerIds.set(playerId, auction.name);
    identities.push({
      auction,
      playerId,
      cricsheetId: chosen?.id ?? null,
      matchName: chosen?.name ?? null,
      method,
      note,
    });
  }

  for (const identity of identities) {
    if (identity.method === "auction_only" && !AUCTION_ONLY.has(identity.auction.name)) {
      const hasManual = Boolean(MANUAL_LINKS[identity.auction.name]);
      if (!hasManual && !identity.note) {
        warnings.push(`No identity match for auction player ${identity.auction.name}; kept auction-only.`);
      }
    }
  }

  return { identities, warnings };
}

export function manualLinkCount(): number {
  return Object.keys(MANUAL_LINKS).length;
}

export function auctionOnlyCount(identities: ResolvedAuctionIdentity[]): number {
  return identities.filter((identity) => identity.method === "auction_only").length;
}
