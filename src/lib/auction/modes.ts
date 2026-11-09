export type AuctionModeId =
  | "replay-2026"
  | "mini-2026"
  | "mini-2027"
  | "mega-2026"
  | "rtm-2025-practice";

export type AuctionPoolKind = "auction-2026" | "all-2026" | "released-2027";

export type AuctionRetentionKind = "none" | "estimated" | "contract-2026";

export type AuctionMode = {
  id: AuctionModeId;
  name: string;
  kicker: string;
  tagline: string;
  description: string;
  rulebookId: string;
  season: number;
  asOfSeason: number;
  pool: AuctionPoolKind;
  retentionKind: AuctionRetentionKind;
  retainedSquads: boolean;
  minSquadExempt: boolean;
  rtmEnabled: boolean;
  /** Mode can be created with Right to Match turned on or off per room. */
  rtmOptional?: boolean;
  /** Rulebook used when the optional RTM switch is turned on. */
  rtmRulebookId?: string;
  simulatedBasePrices: boolean;
  simulatedRetention: boolean;
  expectedLots: number;
  difficulty: "Intro" | "Standard" | "Expert";
  features: string[];
  caveat: string;
  accent: string;
};

/**
 * Retired from the lobby but kept resolvable so rooms created before the
 * removal still open and settle correctly.
 */
const LEGACY_MODES: AuctionMode[] = [
  {
    id: "replay-2026",
    name: "2026 Replay Sprint",
    kicker: "Verified sold pool",
    tagline: "The 77 confirmed sales. Fresh bids. No RTM.",
    description:
      "Run an open-bid sprint through every player confirmed sold in the supplied 2026 auction list. Base prices and capped/overseas labels are verified; the bidding is yours.",
    rulebookId: "ipl-2026-mini",
    season: 2026,
    asOfSeason: 2025,
    pool: "auction-2026",
    retentionKind: "none",
    retainedSquads: false,
    minSquadExempt: true,
    rtmEnabled: false,
    simulatedBasePrices: false,
    simulatedRetention: false,
    expectedLots: 77,
    difficulty: "Intro",
    features: ["77 verified 2026 auction lots"],
    caveat: "Retired format. Existing rooms still settle.",
    accent: "#ff7a1a",
  },
  {
    id: "mini-2026",
    name: "2026 Mini Auction",
    kicker: "Existing squads · no RTM",
    tagline: "Fill the gaps without blowing the purse.",
    description: "Retired 2026 mini-auction format. Existing rooms still settle.",
    rulebookId: "ipl-2026-mini",
    season: 2026,
    asOfSeason: 2025,
    pool: "auction-2026",
    retentionKind: "estimated",
    retainedSquads: true,
    minSquadExempt: false,
    rtmEnabled: false,
    simulatedBasePrices: false,
    simulatedRetention: true,
    expectedLots: 77,
    difficulty: "Standard",
    features: [],
    caveat: "Retired format. Existing rooms still settle.",
    accent: "#f5c65b",
  },
  {
    id: "rtm-2025-practice",
    name: "2025 RTM Lab",
    kicker: "Verified procedure",
    tagline: "Invoke, survive the final raise, match or decline.",
    description:
      "Practise the verified 2025 Right to Match sequence using the 2026 player pool. No retentions are applied, so every franchise starts with six cards; original teams come from the verified 2025 match data.",
    rulebookId: "ipl-2025-mega-rtm-practice",
    season: 2025,
    asOfSeason: 2024,
    pool: "all-2026",
    retentionKind: "none",
    retainedSquads: false,
    minSquadExempt: false,
    rtmEnabled: true,
    simulatedBasePrices: true,
    simulatedRetention: false,
    expectedLots: 237,
    difficulty: "Expert",
    features: [
      "₹120 crore verified 2025 purse",
      "Six RTM cards per franchise",
      "Final-bidder raise followed by a match/decline decision",
      "Full RTM audit trail and 2025 increment slabs",
    ],
    caveat:
      "Retired format. Existing rooms still settle with the verified procedure.",
    accent: "#b18cff",
  },
];

export const AUCTION_MODES: AuctionMode[] = [
  {
    id: "mini-2027",
    name: "2027 Mini Auction",
    kicker: "2026 squads · contract retentions",
    tagline: "Keep your core at last year's price, then fill the gaps.",
    description:
      "Every franchise starts with its official 2026 squad. Keep a core of 6–8 players at their existing contract value, and bid for everyone else — including the stars you release — with what remains of the ₹130 crore purse.",
    rulebookId: "ipl-2027-mini",
    season: 2027,
    asOfSeason: 2026,
    pool: "released-2027",
    retentionKind: "contract-2026",
    retainedSquads: true,
    minSquadExempt: false,
    rtmEnabled: false,
    simulatedBasePrices: true,
    simulatedRetention: true,
    expectedLots: 205,
    difficulty: "Standard",
    features: [
      "Official 2026 squads with real contract values",
      "Recommended core of 6–8 retentions per franchise",
      "Released players enter the auction for every team",
      "Final squad 18–25 with at most 8 overseas",
    ],
    caveat:
      "Every listed 2026 contract comes from the official auction and retention list. Unchecked players join the auction pool, and the purse shrinks by exactly what you retain.",
    accent: "#f5c65b",
  },
  {
    id: "mega-2026",
    name: "2026 Open Mega Draft",
    kicker: "Full player pool · optional RTM",
    tagline: "Start empty. Build all 18–25 players yourself.",
    description:
      "A full reset with every 2026 appearance-roster player and every verified auction buyer in the pool. Build a complete squad from scratch under the 2026 rules, with Right to Match available as an optional switch.",
    rulebookId: "ipl-2026-mini",
    season: 2026,
    asOfSeason: 2025,
    pool: "all-2026",
    retentionKind: "none",
    retainedSquads: false,
    minSquadExempt: false,
    rtmEnabled: false,
    rtmOptional: true,
    rtmRulebookId: "ipl-2026-mega-rtm",
    simulatedBasePrices: true,
    simulatedRetention: false,
    expectedLots: 237,
    difficulty: "Expert",
    features: [
      "Full 2026 appearance plus auction pool",
      "Every team starts from zero players",
      "Right to Match on or off before the first lot",
      "Complete 18-player squad target with overseas cap",
    ],
    caveat:
      "Most base prices are modelled because the supplied dataset only verifies prices for the 77 sold auction players. RTM is optional in this draft.",
    accent: "#5aa7ff",
  },
];

export function getAuctionMode(id: string | null | undefined): AuctionMode | undefined {
  return AUCTION_MODES.find((mode) => mode.id === id) ?? LEGACY_MODES.find((mode) => mode.id === id);
}

export type AiProfileId = "balanced" | "aggressive" | "analytical" | "conservative" | "maverick";

export type AiProfile = {
  id: AiProfileId;
  label: string;
  short: string;
  description: string;
  aggression: number;
  discipline: number;
  color: string;
};

export const AI_PROFILES: Record<AiProfileId, AiProfile> = {
  balanced: {
    id: "balanced",
    label: "Balanced operator",
    short: "Balanced",
    description: "Fair-value bids with a mild squad-needs overlay.",
    aggression: 1,
    discipline: 1,
    color: "#5aa7ff",
  },
  aggressive: {
    id: "aggressive",
    label: "Aggressive buyer",
    short: "Aggressive",
    description: "Pushes star players and tolerates smaller surpluses.",
    aggression: 1.14,
    discipline: 0.94,
    color: "#ff6b6b",
  },
  analytical: {
    id: "analytical",
    label: "Analytical scout",
    short: "Analytical",
    description: "Hard evidence thresholds and strict budget reserves.",
    aggression: 0.97,
    discipline: 1.12,
    color: "#3ddc97",
  },
  conservative: {
    id: "conservative",
    label: "Value investor",
    short: "Value",
    description: "Waits for value, protects the minimum-squad reserve.",
    aggression: 0.88,
    discipline: 1.08,
    color: "#f5c65b",
  },
  maverick: {
    id: "maverick",
    label: "Maverick owner",
    short: "Maverick",
    description: "Unpredictable premiums, especially for marquee names.",
    aggression: 1.08,
    discipline: 0.88,
    color: "#b18cff",
  },
};

export const TEAM_AI_PROFILES: Record<string, AiProfileId> = {
  "chennai-super-kings": "analytical",
  "mumbai-indians": "aggressive",
  "royal-challengers-bengaluru": "maverick",
  "kolkata-knight-riders": "balanced",
  "sunrisers-hyderabad": "aggressive",
  "delhi-capitals": "analytical",
  "rajasthan-royals": "conservative",
  "punjab-kings": "maverick",
  "gujarat-titans": "balanced",
  "lucknow-super-giants": "conservative",
};

export function profileForTeam(teamId: string): AiProfile {
  return AI_PROFILES[TEAM_AI_PROFILES[teamId] ?? "balanced"];
}
