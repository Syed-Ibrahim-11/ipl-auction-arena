import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyAggregate, type Aggregate } from "../src/lib/data/stats";
import { matchScore, bestNameMatch, normalizeName, slugify } from "../src/lib/data/names";
import {
  croreToLakh,
  formatLakh,
  lakhToCrore,
  parseIndianPriceToLakh,
} from "../src/lib/money";
import { computeRatings, ratingRoleWeights } from "../src/lib/ratings";
import {
  isValidBidAmount,
  nextValidBid,
  RULEBOOK_2025,
  RULEBOOK_2026,
} from "../src/lib/rules";
import { AI_PROFILES } from "../src/lib/auction/modes";
import { aiBidInterest, shouldMatchRtm } from "../src/lib/auction/ai";
import { legacyStrength } from "../src/lib/auction/legacy";
import {
  aiValuationLakh,
  hashUnit,
  maxAffordableBid,
  poolReserveLakh,
  simulatedBasePriceLakh,
  squadReserveLakh,
} from "../src/lib/auction/valuation";
import { ageFromBirthDate, marketValueFor, tierForValue } from "../src/lib/market-value";
import { defaultRetentionIds, retentionTargetForTeam } from "../src/lib/auction/mini2027";

const RULES = { minSquad: 18, maxSquad: 25, overseasMax: 8, minSquadExempt: false };

test("money helpers convert and format integer lakh values", () => {
  assert.equal(parseIndianPriceToLakh("₹2,00,00,000"), 200);
  assert.equal(parseIndianPriceToLakh("75,00,000"), 75);
  assert.equal(parseIndianPriceToLakh("₹20,00,00,000"), 2_000);
  assert.equal(parseIndianPriceToLakh(""), 0);
  assert.throws(() => parseIndianPriceToLakh("not a price"));

  assert.equal(croreToLakh(125), 12_500);
  assert.equal(lakhToCrore(200), 2);
  assert.equal(formatLakh(12_500), "₹125 Cr");
  assert.equal(formatLakh(200), "₹2 Cr");
  assert.equal(formatLakh(150), "₹1.50 Cr");
  assert.equal(formatLakh(75), "₹75L");
  assert.equal(formatLakh(null), "—");
});

test("bid increments follow the verified 2025 slabs and the documented 2026 custom slabs", () => {
  assert.equal(nextValidBid(null, 200, RULEBOOK_2026.increments), 200);
  assert.equal(nextValidBid(95, 200, RULEBOOK_2026.increments), 200);
  assert.equal(nextValidBid(195, 200, RULEBOOK_2026.increments), 200);
  assert.equal(nextValidBid(100, 200, RULEBOOK_2026.increments), 200);
  assert.equal(nextValidBid(200, 200, RULEBOOK_2026.increments), 220);

  assert.equal(nextValidBid(100, 200, RULEBOOK_2025.increments), 200);
  assert.equal(nextValidBid(200, 200, RULEBOOK_2025.increments), 220);
  assert.equal(nextValidBid(490, 200, RULEBOOK_2025.increments), 510);
  assert.equal(nextValidBid(500, 200, RULEBOOK_2025.increments), 525);
  assert.equal(nextValidBid(2_000, 200, RULEBOOK_2025.increments), 2_025);
});

test("bid amount validation rejects fractions and bids below the next increment", () => {
  assert.equal(isValidBidAmount(200, null, 200), true);
  assert.equal(isValidBidAmount(210, null, 200), true);
  assert.equal(isValidBidAmount(199, null, 200), false);
  assert.equal(isValidBidAmount(200.5, null, 200), false);
  assert.equal(isValidBidAmount(219, 200, 200), false);
  assert.equal(isValidBidAmount(220, 200, 200), true);
  assert.equal(isValidBidAmount(230, 200, 200), true);
});

test("name normalisation strips punctuation, accents and suffixes", () => {
  assert.equal(normalizeName("  A.B. de Villiers Jr.  "), "ab de villiers");
  assert.equal(normalizeName("M.S. Dhoni"), "ms dhoni");
  assert.equal(normalizeName("Virat Kohli"), "virat kohli");
  assert.equal(slugify("R. Ashwin"), "r-ashwin");
  assert.equal(normalizeName("Émile Smith"), "emile smith");
});

test("name matching rewards family and initial agreement and rejects different surnames", () => {
  assert.equal(matchScore("Rohit Sharma", "Rohit Sharma"), 120);
  assert.ok(matchScore("MS Dhoni", "MS Dhoni") > 100);
  assert.ok(matchScore("M.S. Dhoni", "MS Dhoni") > 60);
  assert.equal(matchScore("Rohit Sharma", "Mohit Sharma"), 0);
  const best = bestNameMatch("M.S. Dhoni", [
    { name: "MS Dhoni" },
    { name: "Manoj Tiwary" },
  ]);
  assert.equal(best?.candidate.name, "MS Dhoni");
  assert.ok((best?.score ?? 0) > 60);
});

test("squad reserve and affordability limits encode squad, overseas and purse constraints", () => {
  assert.equal(squadReserveLakh(0, RULES), 510);
  assert.equal(squadReserveLakh(16, RULES), 30);
  assert.equal(squadReserveLakh(17, RULES), 0);
  assert.equal(squadReserveLakh(0, { ...RULES, minSquadExempt: true }), 0);

  // The pool-aware reserve prices the cheapest legal fill, not a flat ₹30L.
  assert.equal(
    poolReserveLakh({ squadSize: 10, rules: RULES, poolBasePricesLakh: [30, 30, 50, 100] }),
    300,
  );
  assert.equal(
    poolReserveLakh({
      squadSize: 10,
      rules: RULES,
      poolBasePricesLakh: [30, 30, 50, 100, 200, 200, 200],
    }),
    810,
  );
  assert.equal(
    poolReserveLakh({ squadSize: 16, rules: RULES, poolBasePricesLakh: [30, 50, 100] }),
    30,
  );
  assert.equal(
    poolReserveLakh({ squadSize: 10, rules: { ...RULES, minSquadExempt: true }, poolBasePricesLakh: [30] }),
    0,
  );

  const normal = maxAffordableBid({
    purseLakh: 1_000,
    squadSize: 16,
    overseasCount: 0,
    isOverseas: false,
    rules: RULES,
  });
  assert.equal(normal.blockedReason, null);
  assert.equal(normal.maxBidLakh, 970);
  assert.equal(normal.reserveLakh, 30);

  const fullSquad = maxAffordableBid({
    purseLakh: 1_000,
    squadSize: 25,
    overseasCount: 0,
    isOverseas: false,
    rules: RULES,
  });
  assert.equal(fullSquad.blockedReason, "Squad is full");

  const overseasBlocked = maxAffordableBid({
    purseLakh: 1_000,
    squadSize: 10,
    overseasCount: 8,
    isOverseas: true,
    rules: RULES,
  });
  assert.match(overseasBlocked.blockedReason ?? "", /Overseas limit/);

  const broke = maxAffordableBid({
    purseLakh: 20,
    squadSize: 0,
    overseasCount: 0,
    isOverseas: false,
    rules: RULES,
  });
  assert.equal(broke.maxBidLakh, 0);
  assert.equal(broke.blockedReason, "No usable purse remains");
});

test("simulated base prices are deterministic and respect rating bands", () => {
  assert.equal(simulatedBasePriceLakh({ ovr: 90, capped: true, role: "batter" }), 200);
  assert.equal(simulatedBasePriceLakh({ ovr: 75, capped: false, role: "batter" }), 150);
  assert.equal(simulatedBasePriceLakh({ ovr: 58, capped: false, role: "batter" }), 50);
  assert.equal(simulatedBasePriceLakh({ ovr: 58, capped: true, role: "batter" }), 100);
  assert.equal(simulatedBasePriceLakh({ ovr: 40, capped: false, role: "bowler" }), 30);
  assert.equal(simulatedBasePriceLakh({ ovr: null, capped: false, role: "bowler" }), 30);
});

test("AI valuation is deterministic, bounded and profile-sensitive", () => {
  const base = {
    basePriceLakh: 200,
    ovr: 82,
    evidenceQuality: "moderate",
    role: "batter",
    capped: true,
    profile: AI_PROFILES.balanced,
    roleCounts: { batter: 2, bowler: 2, allRounder: 1, wicketkeeper: 1, unknown: 0 },
    squadSize: 6,
    rules: RULES,
    jitter: 0.5,
  } as const;
  const value = aiValuationLakh({ ...base, roleCounts: { ...base.roleCounts } });
  assert.equal(value, aiValuationLakh({ ...base, roleCounts: { ...base.roleCounts } }));
  assert.ok(value >= base.basePriceLakh);
  assert.ok(value <= 3_000);

  const aggressive = aiValuationLakh({
    ...base,
    roleCounts: { ...base.roleCounts },
    profile: AI_PROFILES.aggressive,
  });
  const conservative = aiValuationLakh({
    ...base,
    roleCounts: { ...base.roleCounts },
    profile: AI_PROFILES.conservative,
  });
  assert.ok(aggressive > conservative);

  const limited = aiValuationLakh({
    ...base,
    roleCounts: { ...base.roleCounts },
    evidenceQuality: "limited",
  });
  assert.ok(limited < value);

  const low = aiValuationLakh({
    ...base,
    ovr: 25,
    roleCounts: { ...base.roleCounts },
    profile: AI_PROFILES.conservative,
    jitter: 0,
  });
  assert.ok(low >= base.basePriceLakh);

  const top = aiValuationLakh({
    ...base,
    ovr: 99,
    roleCounts: { ...base.roleCounts },
    profile: AI_PROFILES.aggressive,
    jitter: 1,
  });
  assert.equal(top, 2_700);
});

test("market value is explainable, age-aware and bounded", () => {
  const prime = marketValueFor({ ovr: 88, role: "batter", age: 26, evidenceQuality: "strong" });
  const veteran = marketValueFor({ ovr: 88, role: "batter", age: 37, evidenceQuality: "strong" });
  const unknown = marketValueFor({ ovr: 88, role: "batter", age: null, evidenceQuality: "limited" });
  assert.ok(prime.valueLakh > veteran.valueLakh);
  assert.ok(prime.valueLakh > unknown.valueLakh);
  assert.ok(prime.highLakh > prime.valueLakh && prime.lowLakh < prime.valueLakh);
  assert.ok(prime.factors.length >= 4);
  assert.equal(marketValueFor({ ovr: 88, role: "batter", age: 26, evidenceQuality: "strong" }).valueLakh, prime.valueLakh);
  assert.equal(tierForValue(2_000), "Marquee");
  assert.equal(tierForValue(1_200), "Premium");
  assert.equal(tierForValue(500), "Core");
  assert.equal(tierForValue(200), "Rotation");
  assert.equal(tierForValue(80), "Development");
  assert.equal(ageFromBirthDate("2000-01-15", new Date("2026-11-07T00:00:00Z")), 26);
});

test("fair values behave like an IPL auction rather than a linear rating table", () => {
  const median = marketValueFor({
    ovr: 74,
    role: "batter",
    age: 28,
    evidenceQuality: "strong",
    seasons: 6,
    lastSeason: 2026,
    asOfSeason: 2026,
  });
  const fringe = marketValueFor({
    ovr: 65,
    role: "batter",
    age: 29,
    evidenceQuality: "limited",
    seasons: 2,
    lastSeason: 2026,
    asOfSeason: 2026,
  });
  const star = marketValueFor({
    ovr: 90,
    role: "batter",
    age: 27,
    evidenceQuality: "strong",
    seasons: 8,
    lastSeason: 2026,
    asOfSeason: 2026,
  });
  const unrated = marketValueFor({
    ovr: null,
    role: "bowler",
    age: 24,
    evidenceQuality: null,
    basePriceLakh: 30,
  });
  const stale = marketValueFor({
    ovr: 76,
    role: "batter",
    age: 29,
    evidenceQuality: "limited",
    seasons: 1,
    lastSeason: 2022,
    asOfSeason: 2026,
  });

  assert.ok(median.valueLakh >= 150 && median.valueLakh <= 400, `median fair value was ${median.valueLakh}L`);
  assert.ok(fringe.valueLakh <= 120, `fringe fair value was ${fringe.valueLakh}L`);
  assert.ok(star.valueLakh >= 1_600 && star.valueLakh <= 3_000, `star fair value was ${star.valueLakh}L`);
  assert.ok(unrated.valueLakh <= 50, `unrated fair value was ${unrated.valueLakh}L`);
  assert.ok(stale.valueLakh <= 120, `stale fair value was ${stale.valueLakh}L`);
  assert.equal(median.referenceLakh, Math.round((median.valueLakh * 0.9) / 5) * 5);
  assert.ok(star.referenceLakh < star.valueLakh);
});

test("AI valuation anchors to fair market value and adds profile pressure", () => {
  const base = {
    basePriceLakh: 200,
    ovr: 82,
    evidenceQuality: "moderate",
    role: "batter" as const,
    capped: true,
    marketValueLakh: 1_200,
    profile: AI_PROFILES.balanced,
    roleCounts: { batter: 2, bowler: 2, allRounder: 1, wicketkeeper: 1, unknown: 0 },
    squadSize: 6,
    rules: RULES,
    jitter: 0.5,
  };
  const fair = aiValuationLakh({ ...base });
  const aggressive = aiValuationLakh({ ...base, profile: AI_PROFILES.aggressive });
  const conservative = aiValuationLakh({ ...base, profile: AI_PROFILES.conservative });
  assert.ok(aggressive > fair && fair > conservative);
  assert.ok(fair >= base.marketValueLakh * 0.85);
  assert.ok(fair <= base.marketValueLakh * 1.15);
});

test("franchise legacy scales with tenure and career share", () => {
  const icon = legacyStrength({ matches: 235, seasons: 16, careerMatches: 235 });
  const longServant = legacyStrength({ matches: 90, seasons: 7, careerMatches: 120 });
  const brief = legacyStrength({ matches: 12, seasons: 1, careerMatches: 60 });
  const none = legacyStrength({ matches: 0, seasons: 0, careerMatches: 60 });
  assert.ok(icon > 0.9, `icon legacy was ${icon}`);
  assert.ok(icon > longServant && longServant > brief);
  assert.ok(brief < 0.35, `brief legacy was ${brief}`);
  assert.equal(none, 0);
});

test("legacy clubs value their icons above market and can bid past the standard ceiling", () => {
  const base = {
    basePriceLakh: 200,
    ovr: 92,
    evidenceQuality: "strong",
    role: "batter" as const,
    capped: true,
    marketValueLakh: 2_400,
    profile: AI_PROFILES.balanced,
    roleCounts: { batter: 2, bowler: 4, allRounder: 2, wicketkeeper: 1, unknown: 0 },
    squadSize: 6,
    rules: RULES,
    jitter: 0.5,
  };
  const fair = aiValuationLakh({ ...base });
  const legacy = aiValuationLakh({ ...base, legacyStrength: 1 });
  assert.ok(legacy >= fair * 1.45, `legacy ${legacy} vs fair ${fair}`);
  assert.ok(fair <= 2_700);

  const atCap = aiValuationLakh({ ...base, marketValueLakh: 3_000, legacyStrength: 1 });
  assert.equal(atCap, 4_050);
});

test("legacy pressure keeps a club contesting raises and matching above fair value", () => {
  const args = {
    seed: 7,
    lotNumber: 3,
    teamId: "chennai-super-kings",
    valuationLakh: 1_000,
    nextBidLakh: 900,
    quietTicks: 0,
    bidCount: 2,
  };
  assert.ok(
    aiBidInterest({ ...args, legacyStrength: 0.9 }) > aiBidInterest({ ...args, legacyStrength: 0 }),
  );

  const rtm = {
    valuationLakh: 1_000,
    revisedPriceLakh: 1_100,
    maxBidLakh: 2_000,
    profile: AI_PROFILES.conservative,
  };
  assert.equal(shouldMatchRtm({ ...rtm, legacyStrength: 0 }), false);
  assert.equal(shouldMatchRtm({ ...rtm, legacyStrength: 0.9 }), true);
});

test("hashUnit is stable, uniform-bounded and sensitive to every input", () => {  const first = hashUnit(42, "player-1", "lot-order");
  assert.equal(first, hashUnit(42, "player-1", "lot-order"));
  assert.ok(first >= 0 && first < 1);
  assert.notEqual(first, hashUnit(43, "player-1", "lot-order"));
  assert.notEqual(first, hashUnit(42, "player-2", "lot-order"));
  assert.notEqual(first, hashUnit(42, "player-1", "different"));
});

function battingAggregate(overrides: Partial<Aggregate> = {}): Aggregate {
  const agg = emptyAggregate();
  agg.matches = 20;
  agg.inningsBat = 20;
  agg.runs = 600;
  agg.ballsFaced = 450;
  agg.dismissals = 15;
  agg.fours = 50;
  agg.sixes = 20;
  agg.catches = 10;
  return { ...agg, ...overrides };
}

test("role weights are role-aware and normalised", () => {
  for (const role of ["batter", "bowler", "all-rounder", "wicketkeeper", "unknown"] as const) {
    const weights = ratingRoleWeights(role);
    const total = weights.batting + weights.bowling + weights.fielding;
    assert.ok(Math.abs(total - 1) < 1e-9, `${role} weights should sum to 1`);
  }
  assert.ok(ratingRoleWeights("batter").batting > ratingRoleWeights("batter").bowling);
  assert.ok(ratingRoleWeights("bowler").bowling > ratingRoleWeights("bowler").batting);
  assert.equal(ratingRoleWeights("all-rounder").batting, 0.45);
  assert.equal(ratingRoleWeights("all-rounder").bowling, 0.45);
});

test("ratings use only evidence up to the requested season", () => {
  const historic = computeRatings(
    [{ playerId: "p1", role: "batter", seasons: [{ season: 2025, agg: battingAggregate() }] }],
    2026,
  ).get("p1");
  assert.ok(historic);
  assert.ok(historic.ovr !== null && historic.ovr >= 25 && historic.ovr <= 99);
  assert.ok(historic.batting !== null);
  assert.equal(historic.bowling, null);
  assert.notEqual(historic.fielding, null);
  assert.equal(historic.breakdown.asOfSeason, 2026);
  assert.deepEqual(historic.breakdown.weights, { batting: 0.9, bowling: 0, fielding: 0.1 });
  assert.equal(historic.evidenceQuality, "moderate");

  const withFuture = computeRatings(
    [
      {
        playerId: "p1",
        role: "batter",
        seasons: [
          { season: 2025, agg: battingAggregate() },
          {
            season: 2027,
            agg: battingAggregate({
              matches: 99,
              runs: 9_999,
              ballsFaced: 9_999,
              fours: 999,
              sixes: 999,
              catches: 99,
            }),
          },
        ],
      },
    ],
    2026,
  ).get("p1");
  assert.ok(withFuture);
  assert.equal(withFuture.ovr, historic.ovr);
  assert.deepEqual(withFuture.sample, historic.sample);
  assert.equal(withFuture.sample.lastSeason, 2025);

  const beforeEvidence = computeRatings(
    [{ playerId: "p1", role: "batter", seasons: [{ season: 2025, agg: battingAggregate() }] }],
    2024,
  );
  assert.equal(beforeEvidence.size, 0);
});

test("ratings refuse an overall score without usable evidence", () => {
  const tiny = emptyAggregate();
  tiny.matches = 1;
  tiny.inningsBat = 1;
  tiny.runs = 10;
  tiny.ballsFaced = 10;
  tiny.dismissals = 1;
  const result = computeRatings(
    [{ playerId: "tiny", role: "batter", seasons: [{ season: 2026, agg: tiny }] }],
    2026,
  ).get("tiny");
  assert.ok(result);
  assert.equal(result.ovr, null);
  assert.equal(result.batting, null);
  assert.equal(result.evidenceQuality, "insufficient");
});

test("mini-auction retention cores stay between six and eight players", () => {
  const players = Array.from({ length: 25 }, (_, index) => ({
    teamId: "team",
    playerId: `p${index}`,
    fullName: `Player ${index}`,
    role: "batter",
    isOverseas: index % 5 === 0,
    contractLakh: index < 8 ? 1_800 : 30,
    contractSource: "contract-2026" as const,
    auctionPriceLakh: 1_800,
    rating: 90 - index,
  }));
  const ids = defaultRetentionIds(players, 13_000, 8);
  assert.ok(ids.length >= 6 && ids.length <= 8, `expected 6-8 retentions, got ${ids.length}`);
  const spend = players.filter((player) => ids.includes(player.playerId)).reduce((sum, player) => sum + player.contractLakh, 0);
  assert.ok(spend <= 13_000 * 0.55 + 30, "retention spend must respect the budget");
  for (const teamId of ["mumbai-indians", "chennai-super-kings", "punjab-kings"]) {
    const target = retentionTargetForTeam(teamId);
    assert.ok(target >= 6 && target <= 8);
  }
});
