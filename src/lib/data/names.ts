export function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugify(value: string): string {
  return normalizeName(value).replace(/\s+/g, "-").replace(/^-|-$/g, "");
}

export function nameTokens(value: string): string[] {
  return normalizeName(value).split(" ").filter(Boolean);
}

const PARTICLES = new Set(["de", "da", "du", "der", "den", "van", "von", "bin", "al", "el", "le", "la", "di", "ten", "ter"]);

function splitCricsheetName(name: string): {
  initials: string;
  given: string[];
  family: string[];
  tokens: string[];
  hasInitials: boolean;
} {
  const rawTokens = name.trim().split(/\s+/).filter(Boolean);
  const tokens = rawTokens.map((token) => normalizeName(token)).filter(Boolean);
  if (tokens.length === 0) return { initials: "", given: [], family: [], tokens, hasInitials: false };

  let initialsCount = 0;
  while (initialsCount < rawTokens.length - 1) {
    const cleaned = rawTokens[initialsCount].replace(/[^A-Za-z]/g, "");
    if (cleaned.length > 0 && cleaned.length <= 4 && /^[A-Z]+$/.test(cleaned)) {
      initialsCount += 1;
    } else {
      break;
    }
  }

  let familyStart = tokens.length - 1;
  while (familyStart - 1 >= initialsCount && PARTICLES.has(tokens[familyStart - 1])) {
    familyStart -= 1;
  }

  const family = tokens.slice(familyStart);
  const given = tokens.slice(0, familyStart);
  const initials = initialsCount > 0 ? given.join("") : "";
  return { initials, given, family, tokens, hasInitials: initialsCount > 0 };
}

export function matchScore(auctionName: string, cricsheetName: string): number {
  const auctionTokens = nameTokens(auctionName);
  const cricsheet = splitCricsheetName(cricsheetName);
  if (auctionTokens.length === 0 || cricsheet.tokens.length === 0) return 0;

  const auctionNorm = auctionTokens.join(" ");
  const cricsheetNorm = cricsheet.tokens.join(" ");
  if (auctionNorm === cricsheetNorm) return 120;
  if (cricsheet.family.length === 0) return 0;

  const auctionFamily = auctionTokens.slice(-cricsheet.family.length);
  const familyMatches =
    auctionFamily.length === cricsheet.family.length &&
    auctionFamily.every((token, index) => token === cricsheet.family[index]);
  if (!familyMatches) return 0;

  const auctionGiven = auctionTokens.slice(0, auctionTokens.length - cricsheet.family.length);
  if (auctionGiven.length === 0) return 0;

  let score = 60;
  const fullGivenMatch = cricsheet.given.includes(auctionGiven[0]);
  const initialMatch = cricsheet.hasInitials && cricsheet.initials[0] === auctionGiven[0][0];

  if (fullGivenMatch) {
    score += 28;
  } else if (initialMatch) {
    score += 24;
  } else if (cricsheet.hasInitials && cricsheet.initials.includes(auctionGiven[0][0])) {
    score += 8;
  } else if (!cricsheet.hasInitials && cricsheet.given[0]?.[0] === auctionGiven[0][0]) {
    score += 10;
  } else {
    return 0;
  }

  if (cricsheet.hasInitials && cricsheet.initials.length > 1 && auctionGiven[1]) {
    if (cricsheet.initials[1] === auctionGiven[1][0]) score += 8;
  } else if (!cricsheet.hasInitials && cricsheet.given[1] && auctionGiven[1] === cricsheet.given[1]) {
    score += 6;
  }

  const shared = auctionTokens.filter((token) => cricsheet.tokens.includes(token)).length;
  score += Math.min(12, shared * 3);

  if (auctionTokens.length === cricsheet.tokens.length) score += 6;
  if (auctionGiven.join("") === cricsheet.initials) score += 4;

  return score;
}

export function bestNameMatch<T extends { name: string }>(
  auctionName: string,
  candidates: T[],
): { candidate: T; score: number } | null {
  let best: { candidate: T; score: number } | null = null;
  for (const candidate of candidates) {
    const score = matchScore(auctionName, candidate.name);
    if (!best || score > best.score) best = { candidate, score };
  }
  return best;
}
