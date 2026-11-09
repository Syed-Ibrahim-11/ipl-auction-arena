import type { AiProfile } from "./modes";
import { legacyForTeam, type FranchiseLegacy } from "./legacy";
import {
  aiValuationLakh,
  hashUnit,
  maxAffordableBid,
  poolReserveLakh,
  type BidLimits,
  type SquadRules,
} from "./valuation";
import type { TeamContext } from "./internal";

export interface AiPlayerFacts {
  ovr: number | null;
  evidenceQuality: string | null;
  role: string;
  capped: boolean | null;
  isOverseas: boolean;
  age: number | null;
  marketValueLakh: number | null;
  /** Career franchise affinity keyed by team id, strength 0..1. */
  legacyTeams?: FranchiseLegacy | null;
}

export interface AiEvaluation {
  valuationLakh: number;
  limits: BidLimits;
  /** How strongly this player is tied to the evaluating team (0..1). */
  legacyStrength: number;
}

export function evaluateForTeam(args: {
  player: AiPlayerFacts;
  basePriceLakh: number;
  context: TeamContext;
  rules: SquadRules;
  profile: AiProfile;
  seed: number;
  lotNumber: number;
  poolBasePricesLakh?: number[] | null;
}): AiEvaluation {
  const { player, basePriceLakh, context, rules, profile, seed, lotNumber, poolBasePricesLakh } = args;
  const limits = maxAffordableBid({
    purseLakh: context.team.purse_lakh,
    squadSize: context.squadSize,
    overseasCount: context.overseasCount,
    isOverseas: player.isOverseas,
    rules,
    reserveLakh: poolReserveLakh({
      squadSize: context.squadSize,
      rules,
      poolBasePricesLakh,
    }),
  });
  const legacyStrength = legacyForTeam(player.legacyTeams, context.team.team_id);
  const value = aiValuationLakh({
    basePriceLakh,
    ovr: player.ovr,
    evidenceQuality: player.evidenceQuality,
    role: player.role,
    capped: player.capped,
    marketValueLakh: player.marketValueLakh,
    profile,
    roleCounts: context.roleCounts,
    squadSize: context.squadSize,
    rules,
    jitter: hashUnit(seed, lotNumber, context.team.team_id, "valuation"),
    legacyStrength,
  });
  return { valuationLakh: value, limits, legacyStrength };
}

export function aiBidInterest(args: {
  seed: number;
  lotNumber: number;
  teamId: string;
  valuationLakh: number;
  nextBidLakh: number;
  quietTicks: number;
  bidCount: number;
  /** 0..1 franchise affinity; a legacy club is more likely to contest every raise. */
  legacyStrength?: number;
}): number {
  const headroom = args.valuationLakh - args.nextBidLakh;
  if (headroom < 0) return -1;
  const legacy = Math.max(0, Math.min(1, args.legacyStrength ?? 0));
  const base = 1 + headroom / Math.max(40, args.nextBidLakh) + legacy * 0.5;
  const certainty = Math.min(1, headroom / Math.max(60, args.valuationLakh) + legacy);
  const noise =
    hashUnit(
      args.seed,
      args.lotNumber,
      args.teamId,
      "interest",
      args.quietTicks,
      args.bidCount,
    ) - 0.5;
  return base + noise * 0.85 * (1 - 0.35 * certainty);
}

export function shouldInvokeRtm(args: {
  valuationLakh: number;
  currentBidLakh: number;
  profile: AiProfile;
  seed: number;
  lotNumber: number;
  teamId: string;
  legacyStrength?: number;
}): boolean {
  const { valuationLakh, currentBidLakh, profile } = args;
  const legacy = Math.max(0, Math.min(1, args.legacyStrength ?? 0));
  const ceiling = currentBidLakh * (1 + (1 - profile.aggression) * 0.4 + 0.35 * legacy);
  if (valuationLakh < ceiling) return false;
  const risk = 0.08 * profile.discipline * (1 - 0.8 * legacy);
  return hashUnit(args.seed, args.lotNumber, args.teamId, "rtm-invoke") > risk;
}

export function aiRtmRaise(args: {
  currentBidLakh: number;
  nextBidLakh: number;
  valuationLakh: number;
  maxBidLakh: number;
  incrementLakh: number;
  profile: AiProfile;
  seed: number;
  lotNumber: number;
  teamId: string;
  legacyStrength?: number;
}): number | null {
  const { currentBidLakh, nextBidLakh, valuationLakh, maxBidLakh, incrementLakh, profile } = args;
  const legacy = Math.max(0, Math.min(1, args.legacyStrength ?? 0));
  if (nextBidLakh > maxBidLakh || nextBidLakh > valuationLakh) return null;
  const holdRoll = hashUnit(args.seed, args.lotNumber, args.teamId, "rtm-raise");
  // A legacy club does not bluff: it commits to the strongest legal raise.
  if (legacy < 0.35 && holdRoll < 0.05 * profile.discipline) return null;
  const step = Math.max(
    incrementLakh,
    Math.round((currentBidLakh * (0.09 + 0.06 * legacy)) / 5) * 5,
  );
  const target = Math.min(maxBidLakh, valuationLakh, currentBidLakh + step);
  const rounded = Math.max(nextBidLakh, Math.floor(target / 5) * 5);
  return rounded <= maxBidLakh ? rounded : null;
}

export function shouldMatchRtm(args: {
  valuationLakh: number;
  revisedPriceLakh: number;
  maxBidLakh: number;
  profile: AiProfile;
  legacyStrength?: number;
}): boolean {
  const { valuationLakh, revisedPriceLakh, maxBidLakh, profile } = args;
  const legacy = Math.max(0, Math.min(1, args.legacyStrength ?? 0));
  if (revisedPriceLakh > maxBidLakh) return false;
  const ceiling = valuationLakh * (0.99 + (profile.aggression - 1) * 0.2 + 0.35 * legacy);
  return revisedPriceLakh <= ceiling;
}
