/**
 * Fair-value model for the auction room.
 *
 * This is the price a well-informed franchise should be willing to pay for a
 * player's expected IPL contribution, expressed in lakh (₹100,000). It is
 * deliberately separate from the player's rating: the rating answers "how good
 * is he?", the market value answers "what is that worth at this age, with this
 * evidence, and with this shelf life?".
 *
 * The price curve is deliberately steep. The league median OVR sits in the
 * mid-70s, and a median IPL cricketer is worth a couple of crore — not the
 * eight or nine crore a linear rating-to-price conversion implies. Only the
 * genuinely elite percentile earns a marquee price, which is how real auction
 * rooms behave: most of the money chases a handful of players, while the rest
 * of the pool trades near or a little above base price.
 *
 * Inputs: existing OVR / discipline grades, role, evidence quality, career
 * length, recency, age, overseas status and the auction base price as a floor.
 * Nothing here invents a second rating or changes stored player attributes.
 */

export type MarketValueInput = {
  ovr: number | null;
  batting?: number | null;
  bowling?: number | null;
  role: string;
  age: number | null;
  evidenceQuality?: string | null;
  isOverseas?: boolean | null;
  basePriceLakh?: number | null;
  /** Career IPL seasons used by the rating, and the most recent one. */
  seasons?: number | null;
  lastSeason?: number | null;
  asOfSeason?: number | null;
};

export type MarketValueFactor = {
  label: string;
  multiplier: number;
  note: string;
};

export type MarketValue = {
  valueLakh: number;
  /** Internal AI benchmark: fair value discounted by 10%. */
  referenceLakh: number;
  lowLakh: number;
  highLakh: number;
  tier: "Marquee" | "Premium" | "Core" | "Rotation" | "Development";
  factors: MarketValueFactor[];
  rationale: string;
  coreLakh: number;
};

/** Hard ceiling for a fair value; the AI bid ceiling is separate and lower. */
const MAX_VALUE_LAKH = 3_000;
/** Ratings below this are replacement-level rather than league-average. */
const RATING_FLOOR = 48;
const RATING_SPAN = 43;

export function ageFromBirthDate(birthDate: string | null | undefined, now = new Date()): number | null {
  if (!birthDate) return null;
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return null;
  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const month = now.getUTCMonth() - parsed.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < parsed.getUTCDate())) age -= 1;
  return age > 0 && age < 70 ? age : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roleMarketFactor(role: string): MarketValueFactor {
  switch (role) {
    case "all-rounder":
      return { label: "All-rounder premium", multiplier: 1.12, note: "Two disciplines in one overseas or XI slot." };
    case "wicketkeeper":
      return { label: "Keeper premium", multiplier: 1.07, note: "Keeper-batters who can bat in the top six are scarce." };
    case "bowler":
      return { label: "Bowling value", multiplier: 1.04, note: "Wicket-taking overs are the hardest auction commodity." };
    default:
      return { label: "Batting value", multiplier: 1, note: "Baseline role value." };
  }
}

export function ageMarketFactor(age: number | null, role: string): MarketValueFactor {
  if (age === null) {
    return {
      label: "Age unknown",
      multiplier: 0.95,
      note: "No verified birth date, so the projection carries a small uncertainty discount.",
    };
  }
  let multiplier: number;
  let note: string;
  if (age <= 21) {
    multiplier = 1.22;
    note = "Under-22 projection: the buying team owns the growth curve.";
  } else if (age <= 24) {
    multiplier = 1.14;
    note = "22–24 peak-arrival window; resale and peak years remain.";
  } else if (age <= 27) {
    multiplier = 1.07;
    note = "25–27 is the usual peak-value window.";
  } else if (age <= 30) {
    multiplier = 1.0;
    note = "28–30: at peak, little resale value.";
  } else if (age <= 33) {
    multiplier = 0.9;
    note = "31–33: performance holds, but the contract covers decline years.";
  } else if (age <= 35) {
    multiplier = 0.78;
    note = "34–35: short-term specialist pricing.";
  } else if (age <= 37) {
    multiplier = 0.64;
    note = "36–37: season-by-season value only.";
  } else {
    multiplier = 0.48;
    note = "38+: legacy and leadership premium are not priced by this model.";
  }
  if (role === "bowler" && age >= 33) {
    multiplier *= 0.96;
    note += " Pace workload adds a further 4% discount.";
  }
  return { label: `Age ${age}`, multiplier, note };
}

export function evidenceMarketFactor(evidence: string | null | undefined): MarketValueFactor {
  switch (evidence) {
    case "strong":
      return { label: "Strong evidence", multiplier: 1, note: "Large IPL sample supports the projection." };
    case "moderate":
      return { label: "Moderate evidence", multiplier: 0.9, note: "Enough evidence, but the range is wider." };
    case "limited":
      return { label: "Limited evidence", multiplier: 0.72, note: "Small IPL sample; the price carries a substantial discount." };
    case "insufficient":
      return { label: "Insufficient evidence", multiplier: 0.45, note: "No reliable IPL sample; priced as a speculative pick." };
    default:
      return { label: "Evidence unknown", multiplier: 0.6, note: "Evidence quality is not recorded; treated as unproven." };
  }
}

function experienceMarketFactor(seasons: number | null | undefined): MarketValueFactor {
  if (seasons === null || seasons === undefined || seasons <= 0) {
    return { label: "No IPL seasons", multiplier: 0.94, note: "No completed IPL season in the sample." };
  }
  if (seasons >= 8) return { label: `${seasons} IPL seasons`, multiplier: 1.03, note: "Long, repeatable IPL track record." };
  if (seasons >= 4) return { label: `${seasons} IPL seasons`, multiplier: 1, note: "Established IPL sample." };
  if (seasons >= 2) return { label: `${seasons} IPL seasons`, multiplier: 0.97, note: "Short career; one-season spike is still possible." };
  return { label: `${seasons} IPL season`, multiplier: 0.92, note: "Single-season sample carries extra risk." };
}

/**
 * A player who has not appeared in the IPL for multiple seasons is not a
 * current auction asset, whatever his historic rating says. This is the single
 * largest correction for fringe and long-absent names.
 */
function recencyMarketFactor(
  lastSeason: number | null | undefined,
  asOfSeason: number | null | undefined,
): MarketValueFactor {
  if (!lastSeason || !asOfSeason) {
    return { label: "Recency unverified", multiplier: 0.97, note: "Last IPL appearance is not recorded." };
  }
  const gap = Math.max(0, asOfSeason - lastSeason);
  if (gap <= 0) return { label: `Active in ${lastSeason}`, multiplier: 1, note: "Current IPL season in the sample." };
  if (gap === 1) return { label: `Last IPL ${lastSeason}`, multiplier: 0.9, note: "Missed the latest season; small availability discount." };
  if (gap === 2) return { label: `Last IPL ${lastSeason}`, multiplier: 0.66, note: "Two seasons out; no current IPL evidence." };
  return {
    label: `Last IPL ${lastSeason}`,
    multiplier: gap >= 4 ? 0.36 : 0.46,
    note: `${gap} seasons since his last IPL appearance; priced as a comeback long shot.`,
  };
}

function roundPrice(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

export function tierForValue(valueLakh: number): MarketValue["tier"] {
  if (valueLakh >= 1_500) return "Marquee";
  if (valueLakh >= 800) return "Premium";
  if (valueLakh >= 350) return "Core";
  if (valueLakh >= 120) return "Rotation";
  return "Development";
}

/**
 * Core price for a rating percentile. The exponent is what keeps the market
 * honest: the 50th percentile earns a squad-player price, while the 95th
 * percentile owns most of the curve's value.
 */
function corePriceLakh(ovr: number): number {
  const quality = clamp((ovr - RATING_FLOOR) / RATING_SPAN, 0, 1);
  return 18 + 2_882 * quality ** 5.2;
}

/** Exact fair-value price for a player, in lakh. */
export function marketValueFor(input: MarketValueInput): MarketValue {
  const role = roleMarketFactor(input.role);
  const age = ageMarketFactor(input.age, input.role);
  const evidence = evidenceMarketFactor(input.evidenceQuality);
  const experience = experienceMarketFactor(input.seasons);
  const recency = recencyMarketFactor(input.lastSeason, input.asOfSeason);
  const overseas: MarketValueFactor =
    input.isOverseas === true
      ? {
          label: "Overseas slot",
          multiplier: 1.1,
          note: "Overseas names list higher and the quota adds scarcity: priced about 10% above a domestic equivalent.",
        }
      : { label: "Domestic player", multiplier: 1, note: "No overseas-slot constraint." };
  const floor = input.basePriceLakh && input.basePriceLakh > 0 ? input.basePriceLakh : 0;
  const core = input.ovr === null ? 0 : corePriceLakh(input.ovr);

  // Unrated players have no performance evidence to price. They trade at or
  // near their base price — a speculative pick, not a hidden star.
  const rated = input.ovr !== null && core > 0;
  const computed = rated
    ? core *
      role.multiplier *
      age.multiplier *
      evidence.multiplier *
      experience.multiplier *
      recency.multiplier *
      overseas.multiplier
    : Math.max(floor, (floor || 30) * 1.08);
  // A deliberate real-world haircut: franchise boards never pay the model's
  // full theoretical number, so quoted fair value sits 18% under it.
  const raw = computed * 0.82;

  const valueLakh = roundPrice(clamp(Math.max(raw, floor), 5, MAX_VALUE_LAKH));
  const uncertainty =
    0.12 +
    (input.age === null ? 0.06 : 0) +
    (evidence.multiplier < 0.9 ? 0.06 : 0) +
    (recency.multiplier < 0.9 ? 0.06 : 0);
  const tier = tierForValue(valueLakh);
  const factors: MarketValueFactor[] = rated
    ? [role, age, evidence, experience, recency, overseas]
    : [{ label: "No IPL rating", multiplier: 1, note: "No usable IPL sample; priced from base price." }, age, role];
  const rationale = [
    rated ? `${input.ovr} OVR` : "no verified IPL sample",
    input.age === null ? "age not verified" : `${input.age} years old`,
    input.role.replace("-", " "),
    `${tier.toLowerCase()} band`,
    `fair value ${(valueLakh / 100).toFixed(2)} Cr`,
  ].join(" · ");

  return {
    valueLakh,
    referenceLakh: roundPrice(Math.max(5, valueLakh * 0.9)),
    lowLakh: roundPrice(Math.max(5, valueLakh * (1 - uncertainty))),
    highLakh: roundPrice(Math.min(MAX_VALUE_LAKH, valueLakh * (1 + uncertainty))),
    tier,
    factors,
    rationale,
    coreLakh: roundPrice(clamp(core, 5, MAX_VALUE_LAKH)),
  };
}

/** Surplus/deficit against a price actually paid at auction. */
export function valueSurplusLakh(paidLakh: number | null | undefined, valueLakh: number): number | null {
  if (paidLakh === null || paidLakh === undefined) return null;
  return paidLakh - valueLakh;
}
