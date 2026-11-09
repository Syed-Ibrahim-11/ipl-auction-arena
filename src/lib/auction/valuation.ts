import type { AiProfile } from "./modes";

export type RoleCounts = {
  batter: number;
  bowler: number;
  allRounder: number;
  wicketkeeper: number;
  unknown: number;
};

export type SquadRules = {
  minSquad: number;
  maxSquad: number;
  overseasMax: number;
  minSquadExempt: boolean;
};

export type BidLimits = {
  maxBidLakh: number;
  reserveLakh: number;
  blockedReason: string | null;
};

const MIN_BASE_LAKH = 30;
/** Strategic ceiling: AI franchises do not normally go past ₹27 crore. */
const MAX_AI_VALUATION_LAKH = 2_700;

export function squadReserveLakh(squadSize: number, rules: SquadRules): number {
  if (rules.minSquadExempt) return 0;
  const remainingRequired = Math.max(0, rules.minSquad - (squadSize + 1));
  return remainingRequired * MIN_BASE_LAKH;
}

/**
 * Purse that must stay untouched to fill the rest of a squad from the live
 * pool. The cheapest remaining base prices are the honest cost of a legal
 * squad, so a manager cannot spend the minimum-squad money on stars.
 */
export function poolReserveLakh(args: {
  squadSize: number;
  rules: SquadRules;
  poolBasePricesLakh: number[] | null | undefined;
}): number {
  const { squadSize, rules, poolBasePricesLakh } = args;
  if (rules.minSquadExempt) return 0;
  const remainingRequired = Math.max(0, rules.minSquad - (squadSize + 1));
  if (remainingRequired === 0) return 0;
  if (!poolBasePricesLakh || poolBasePricesLakh.length === 0) {
    return remainingRequired * MIN_BASE_LAKH;
  }
  const cheapest = [...poolBasePricesLakh].sort((a, b) => a - b);
  let total = 0;
  for (let index = 0; index < remainingRequired; index += 1) {
    total += cheapest[index] ?? MIN_BASE_LAKH;
  }
  return total;
}

export function maxAffordableBid(args: {
  purseLakh: number;
  squadSize: number;
  overseasCount: number;
  isOverseas: boolean;
  rules: SquadRules;
  /** Exact cost of the cheapest legal squad fill; overrides the flat reserve. */
  reserveLakh?: number | null;
}): BidLimits {
  const { purseLakh, squadSize, overseasCount, isOverseas, rules } = args;
  if (squadSize + 1 > rules.maxSquad) {
    return { maxBidLakh: 0, reserveLakh: 0, blockedReason: "Squad is full" };
  }
  if (isOverseas && overseasCount + 1 > rules.overseasMax) {
    return { maxBidLakh: 0, reserveLakh: 0, blockedReason: `Overseas limit (${rules.overseasMax}) reached` };
  }
  const reserve =
    args.reserveLakh !== null && args.reserveLakh !== undefined
      ? args.reserveLakh
      : squadReserveLakh(squadSize, rules);
  const maxBid = Math.max(0, purseLakh - reserve);
  if (maxBid <= 0) {
    return { maxBidLakh: 0, reserveLakh: reserve, blockedReason: "No usable purse remains" };
  }
  return { maxBidLakh: maxBid, reserveLakh: reserve, blockedReason: null };
}

export function simulatedBasePriceLakh(args: {
  ovr: number | null;
  capped: boolean | null;
  role: string;
  isOverseas?: boolean | null;
}): number {
  const ovr = args.ovr ?? 50;
  let base = 30;
  if (ovr >= 82) base = 200;
  else if (ovr >= 72) base = 150;
  else if (ovr >= 62) base = 100;
  else if (ovr >= 54) base = 50;
  if (args.capped === true && base < 100) base = 100;
  if ((args.role === "all-rounder" || args.role === "wicketkeeper") && base === 200) base = 200;
  // Overseas names carry a higher listing price: the same output costs an
  // overseas slot and a visa, so the market opens them 10% above domestic.
  if (args.isOverseas === true) base = Math.round(base * 1.1);
  return base;
}

/** Legacy fallback used only when a market value is unavailable for the player. */
export function ratingValueLakh(ovr: number | null, basePriceLakh = MIN_BASE_LAKH): number {
  if (ovr === null) return basePriceLakh;
  const quality = Math.max(0, Math.min(1, (ovr - 46) / 40));
  return Math.round(
    Math.min(basePriceLakh + 30 + 2_900 * quality ** 2.55, MAX_AI_VALUATION_LAKH),
  );
}

/** Squad-need multiplier applied to a player's fair market value. */
export function squadNeedMultiplier(role: string, roleCounts: RoleCounts): number {
  if (role === "wicketkeeper") {
    return roleCounts.wicketkeeper === 0 ? 1.18 : roleCounts.wicketkeeper >= 2 ? 0.86 : 1.05;
  }
  if (role === "all-rounder") {
    return roleCounts.allRounder >= 5 ? 0.92 : roleCounts.allRounder < 2 ? 1.09 : 1.06;
  }
  if (role === "batter") {
    return roleCounts.batter >= 7 ? 0.9 : roleCounts.batter < 4 ? 1.05 : 1;
  }
  if (role === "bowler") {
    return roleCounts.bowler >= 7 ? 0.9 : roleCounts.bowler < 4 ? 1.06 : 1.02;
  }
  return 1;
}

export function hashUnit(...parts: Array<string | number>): number {
  const value = parts.join("|");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function aiValuationLakh(args: {
  basePriceLakh: number;
  ovr: number | null;
  evidenceQuality: string | null;
  role: string;
  capped: boolean | null;
  marketValueLakh?: number | null;
  profile: AiProfile;
  roleCounts: RoleCounts;
  squadSize: number;
  rules: SquadRules;
  jitter: number;
  /** 0..1 franchise affinity for the bidding team; legacy icons command a premium. */
  legacyStrength?: number;
}): number {
  const {
    basePriceLakh,
    ovr,
    evidenceQuality,
    role,
    capped,
    marketValueLakh,
    profile,
    roleCounts,
    squadSize,
    rules,
    jitter,
  } = args;
  const legacy = Math.max(0, Math.min(1, args.legacyStrength ?? 0));
  let value: number;
  if (marketValueLakh && marketValueLakh > 0) {
    // The fair market value is the anchor: profile aggression is a personal
    // premium/discount, squad needs nudge it, and a small jitter keeps rooms
    // from converging on identical prices.
    value = marketValueLakh;
    value *= squadNeedMultiplier(role, roleCounts);
  } else if (ovr !== null) {
    value = ratingValueLakh(ovr, basePriceLakh);
    // Legacy path carries evidence itself; the market model already prices it.
    if (evidenceQuality === "limited") value *= 0.94;
    if (evidenceQuality === "insufficient") value *= 0.88;
    value *= squadNeedMultiplier(role, roleCounts);
  } else {
    value = basePriceLakh * (capped ? 2.7 : 1.7) + 40;
    value *= squadNeedMultiplier(role, roleCounts);
  }

  value *= profile.aggression;
  value *= 1 + (jitter - 0.5) * 0.16 * profile.discipline;
  // A franchise icon is worth more to the club that built him than to the
  // market. This premium is folded into the valuation so the AI keeps bidding
  // through fair value, but the purse/squad limits still cap what it can do.
  value *= 1 + 0.5 * legacy;
  if (squadSize < rules.minSquad) value = Math.max(value, basePriceLakh);
  const ceiling = MAX_AI_VALUATION_LAKH * (1 + 0.5 * legacy);
  return Math.round(Math.max(basePriceLakh, Math.min(value, ceiling)));
}

export function aiRetentionPremium(profile: AiProfile): number {
  return 1 + (profile.aggression - 1) * 0.4 + 0.03;
}

export function nearestBidAmount(target: number, minimum: number, increment: number): number {
  if (target <= minimum) return minimum;
  const step = Math.max(5, increment);
  return Math.max(minimum, Math.round(target / step) * step);
}
