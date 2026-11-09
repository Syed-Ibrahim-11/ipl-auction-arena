import manifest from "./data/brand-assets.json";

type ManifestPlayer = {
  photo: string;
  jersey: string | null;
  officialName: string;
  teamId: string;
  role: string;
  country: string;
  source: string;
};

type ManifestTeam = {
  name: string;
  externalId: number;
  logo: string;
  logoDark: string;
  source: string;
};

const teams = manifest.teams as Record<string, ManifestTeam>;
const players = manifest.players as Record<string, ManifestPlayer>;

function normaliseName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const playersByName = new Map<string, ManifestPlayer>();
for (const entry of Object.values(players)) {
  playersByName.set(normaliseName(entry.officialName), entry);
}

// Scorecards use shortened or transliterated names for the same player.
const BRAND_NAME_ALIASES: Record<string, string> = {
  "AA Kulkarni": "Arshin Kulkarni",
  "Anukul Roy priyansh Kumar": "Anukul Roy",
  "DS Rathi": "Digvesh Singh Rathi",
  "Donavon Ferreira": "Donovan Ferreira",
  "LG Pretorius": "Lhuan-dré Pretorius",
  "Lungisani Ngidi": "Lungi Ngidi",
  "M Siddharth": "Manimaran Siddharth",
  "Matthew Short": "Matt Short",
  "Mitchell Marsh": "Mitch Marsh",
  "Mitchell Santner": "Mitch Santner",
  "Mohammad Izhar": "Mohammed Izhar",
  "Nicolas Pooran": "Nicholas Pooran",
  "Philip Salt": "Phil Salt",
  "Pravin Dubey": "Praveen Dubey",
  "R Smaran": "Ravichandran Smaran",
  "RS Ghosh": "Ramakrishna Ghosh",
  "Raj Angad Bawa": "Raj Bawa",
  "Rasikh Salam": "Rasikh Dar",
  "Ravisrinivasan Sai Kishore": "Sai Kishore",
  "Sahabaz Ahmed": "Shahbaz Ahmed",
  "Simran Singh": "Prabhsimran Singh",
  "T Dahiya": "Tejasvi Dahiya",
  "V Nigam": "Vipraj Nigam",
  "Varun Chakravarthy": "Varun Chakaravarthy",
  "Vyshak Vijay Kumar": "Vijaykumar Vyshak",
  "Yash Raj Punja": "Yash Punja",
};
for (const [alias, official] of Object.entries(BRAND_NAME_ALIASES)) {
  const entry = playersByName.get(normaliseName(official));
  if (entry) playersByName.set(normaliseName(alias), entry);
}

export type BrandPlayer = {
  photo: string;
  jersey: string | null;
  officialName: string;
};

export function getTeamLogo(teamId: string | null | undefined): string | null {
  if (!teamId) return null;
  return teams[teamId]?.logo ?? null;
}

export function getTeamLogoDark(teamId: string | null | undefined): string | null {
  if (!teamId) return null;
  return teams[teamId]?.logoDark ?? null;
}

export function getPlayerBrand(
  playerId?: string | null,
  name?: string | null,
): BrandPlayer | null {
  if (playerId && players[playerId]) {
    const entry = players[playerId];
    return { photo: entry.photo, jersey: entry.jersey, officialName: entry.officialName };
  }
  if (name) {
    const entry = playersByName.get(normaliseName(name));
    if (entry) {
      return { photo: entry.photo, jersey: entry.jersey, officialName: entry.officialName };
    }
  }
  return null;
}

export function getJerseyNumber(playerId?: string | null, name?: string | null): string | null {
  return getPlayerBrand(playerId, name)?.jersey ?? null;
}

export function brandAssetCoverage(): { teams: number; players: number; generatedAt: string } {
  return {
    teams: Object.keys(teams).length,
    players: Object.keys(players).length,
    generatedAt: manifest.generatedAt,
  };
}
