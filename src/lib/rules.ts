import { formatLakh } from "@/lib/money";

export type IncrementSlab = { upToLakh: number | null; incrementLakh: number };
export type RuleSource = {
  label: string;
  url: string;
  published?: string;
  note?: string;
};
export type RulebookStatus = "verified" | "verified_with_gaps" | "pending";

export type Rulebook = {
  id: string;
  name: string;
  season: number;
  auctionType: "mega" | "mini" | "custom";
  status: RulebookStatus;
  purseCapLakh: number;
  purseCapVerified: boolean;
  squadMin: number;
  squadMax: number;
  overseasMax: number;
  rtmCards: number;
  rtmEnabled: boolean;
  increments: IncrementSlab[];
  incrementsVerified: boolean;
  sources: RuleSource[];
  notes: string[];
  limitations: string[];
};

export const RULEBOOK_2026: Rulebook = {
  id: "ipl-2026-mini",
  name: "TATA IPL 2026 Mini Auction",
  season: 2026,
  auctionType: "mini",
  status: "verified_with_gaps",
  purseCapLakh: 12_500,
  purseCapVerified: false,
  squadMin: 18,
  squadMax: 25,
  overseasMax: 8,
  rtmCards: 0,
  rtmEnabled: false,
  increments: [
    { upToLakh: 100, incrementLakh: 5 },
    { upToLakh: 200, incrementLakh: 10 },
    { upToLakh: null, incrementLakh: 20 },
  ],
  incrementsVerified: false,
  sources: [
    {
      label: "IPL Governing Council — TATA IPL Player Regulations 2025–27",
      url: "https://www.iplt20.com/news/article/ipl-governing-council-announces-tata-ipl-player-regulations-2025-27",
      published: "2024-09-28",
      note: "Squad size and overseas limits; three-season framework.",
    },
    {
      label: "IPL — TATA IPL 2026 Player Auction List Announced",
      url: "https://www.iplt20.com/news/article/tata-ipl-2026-player-auction-list-announced",
      published: "2025-12-09",
      note: "350 registered players; 42 sets; base price slabs.",
    },
    {
      label: "ESPNcricinfo — IPL auction 2026 FAQs",
      url: "https://www.cricinfo.com/story/ipl-auction-2026-faqs-when-where-who-and-how-much-1515453",
      published: "2025-12-12",
      note: "Mini auction, Abu Dhabi, reported ₹125 crore purse, no RTM.",
    },
    {
      label: "Sportstar — IPL 2026 auction sets explained",
      url: "https://sportstar.thehindu.com/cricket/ipl/ipl-news/ipl-auction-2026-sets-players-registered-rules-explained-latest-news-updates/article70389996.ece",
      published: "2025-12-13",
    },
    {
      label: "The Hindu — Overseas players' ₹18 crore fee cap",
      url: "https://www.thehindu.com/sport/cricket/overseas-players-wont-be-paid-more-than-18-crore-at-ipl-mini-auction/article70399639.ece",
      published: "2025-12-15",
    },
  ],
  notes: [
    "The supplied dataset confirms 77 players sold in the 2026 auction. The official 2026 unsold list is not supplied, so unsold players are not presented as verified auction lots.",
    "The ₹125 crore auction purse is reported by ESPNcricinfo and has not been confirmed in an official 2025–27 regulation PDF in this dataset. It is used with the \"reported\" status.",
    "No official 2026 bid-increment table was located. The simulator uses a 2026-compatible 20-lakh increment above ₹2 crore, which matches the supplied winning-bid multiples. This is clearly marked as a custom rule.",
    "Right to Match was not available in the 2026 mini auction. RTM is available in the separate 2025 Mega Auction practice rulebook.",
    "Overseas players are subject to a reported ₹18 crore maximum player fee in the 2026 auction; the full winning bid is still charged to the franchise purse. The simulator records both where relevant.",
  ],
  limitations: [
    "Retention contract values for the 2026 mini auction are not supplied, so any mini-auction opening purse in the simulator is an explicit custom estimate.",
    "The exact 2026 set list per player is not supplied. Set labels are simulator-derived from role, capped status and reserve price.",
  ],
};

export const RULEBOOK_2026_RTM: Rulebook = {
  id: "ipl-2026-mega-rtm",
  name: "TATA IPL 2026 Open Mega Draft — RTM",
  season: 2026,
  auctionType: "mega",
  status: "verified_with_gaps",
  purseCapLakh: 12_500,
  purseCapVerified: false,
  squadMin: 18,
  squadMax: 25,
  overseasMax: 8,
  rtmCards: 6,
  rtmEnabled: true,
  increments: RULEBOOK_2026.increments,
  incrementsVerified: false,
  sources: [
    ...RULEBOOK_2026.sources,
    {
      label: "ESPN — IPL mega auction RTM procedure",
      url: "https://www.espn.co.uk/cricket/story/_/id/41492797/ipl-2025-auction-retention-rules-six-retentions-per-team-right-match-returns-impact-player-stay",
      published: "2024-09-28",
      note: "Right to Match sequence used when the optional RTM switch is on.",
    },
  ],
  notes: [
    "Open mega draft variant. Every franchise starts from zero players and builds a full 18–25 squad from the 2026 pool.",
    "Right to Match is optional in this format. Turn it on to give every franchise six cards; eligibility follows the player's official 2026 franchise.",
    "The ₹125 crore purse is reported and the 2026 increment table is a simulator-compatible custom rule.",
  ],
  limitations: [
    "Most base prices are simulated because only the 77 sold auction players have verified winning bids.",
    "RTM cards are not reduced by retentions, because this format starts with no retentions.",
  ],
};

export const RULEBOOK_2025: Rulebook = {
  id: "ipl-2025-mega-rtm-practice",
  name: "TATA IPL 2025 Mega Auction — RTM Practice",
  season: 2025,
  auctionType: "mega",
  status: "verified",
  purseCapLakh: 12_000,
  purseCapVerified: true,
  squadMin: 18,
  squadMax: 25,
  overseasMax: 8,
  rtmCards: 6,
  rtmEnabled: true,
  increments: [
    { upToLakh: 100, incrementLakh: 5 },
    { upToLakh: 200, incrementLakh: 10 },
    { upToLakh: 500, incrementLakh: 20 },
    { upToLakh: null, incrementLakh: 25 },
  ],
  incrementsVerified: true,
  sources: [
    {
      label: "IPL — TATA IPL Player Regulations 2025–27",
      url: "https://www.iplt20.com/news/article/ipl-governing-council-announces-tata-ipl-player-regulations-2025-27",
      published: "2024-09-28",
      note: "₹120 crore auction purse, retention schedule, squad and overseas limits.",
    },
    {
      label: "ESPN — IPL mega auction: Six retentions, RTM back",
      url: "https://www.espn.co.uk/cricket/story/_/id/41492797/ipl-2025-auction-retention-rules-six-retentions-per-team-right-match-returns-impact-player-stay",
      published: "2024-09-28",
      note: "RTM cards = 6 minus retentions; only for players in the franchise's 2024 squad.",
    },
    {
      label: "Times of India — How the revised RTM rule was used",
      url: "https://timesofindia.indiatimes.com/sports/cricket/ipl/top-stories/explained-how-punjab-kings-used-new-rtm-rule-to-make-arshdeep-singh-their-first-purchase-of-ipl-2025-mega-auction/articleshow/115625319.cms",
      published: "2024-11-25",
      note: "Worked example: final bid, one final raise, matching decision.",
    },
    {
      label: "Sportstar — 2025 auction bid increments",
      url: "https://sportstar.thehindu.com/cricket/ipl/ipl-news/ipl-2025-auction-mega-incremental-bids-amount-price-process-explained-money/article68905026.ece",
      published: "2024-11-24",
      note: "₹5L / ₹10L / ₹20L / ₹25L slabs.",
    },
    {
      label: "Rajasthan Royals — RTM cards explained",
      url: "https://www.rajasthanroyals.com/latest-news/indian-premier-league-ipl-2025-mega-auction-right-to-match-rtm-card",
      note: "Card retained if the original team declines to match (conflicting secondary reporting noted in rulebook).",
    },
  ],
  notes: [
    "This is a practice rulebook. It applies the verified 2025 Mega Auction RTM procedure to the simulator's current player pool; it is not a reproduction of the 2025 auction results.",
    "No retentions are applied in this practice scenario, so each franchise starts with six RTM cards.",
    "RTM eligibility is derived from the player's most recent pre-auction franchise in the verified Cricsheet match data. That derivation is displayed on every RTM decision.",
    "Under the verified procedure: the highest bidder gets one final opportunity to raise the offer; the original franchise may then match the revised offer or decline. If the original franchise declines, the player joins the highest bidder at the final price.",
    "One secondary source (Scribd) conflicts on whether a declined RTM card is consumed. The implementation follows the ESPN/Times of India/Rajasthan Royals description that the card is retained when the original franchise declines.",
  ],
  limitations: [
    "Retention costs are not modelled in this practice scenario; the full ₹120 crore purse is available to every franchise.",
    "RTM cards in the real 2025 auction would be reduced by that franchise's retentions. This practice mode demonstrates the procedure, not the exact 2025 card counts.",
  ],
};

export const RULEBOOK_2027: Rulebook = {
  id: "ipl-2027-mini",
  name: "TATA IPL 2027 Mini Auction",
  season: 2027,
  auctionType: "mini",
  status: "verified_with_gaps",
  purseCapLakh: 13_000,
  purseCapVerified: false,
  squadMin: 18,
  squadMax: 25,
  overseasMax: 8,
  rtmCards: 0,
  rtmEnabled: false,
  increments: [
    { upToLakh: 100, incrementLakh: 5 },
    { upToLakh: 200, incrementLakh: 10 },
    { upToLakh: null, incrementLakh: 20 },
  ],
  incrementsVerified: false,
  sources: [
    {
      label: "IPL Governing Council — TATA IPL Player Regulations 2025–27",
      url: "https://www.iplt20.com/news/article/ipl-governing-council-announces-tata-ipl-player-regulations-2025-27",
      published: "2024-09-28",
      note: "Mini-auction retention: no cap on the number of retentions; existing contract value is charged to the following purse.",
    },
    {
      label: "ESPNcricinfo — IPL 2027 auction to be held in Goa in December",
      url: "https://www.cricinfo.com/story/ipl-2027-auction-to-be-held-in-goa-in-december-1555498",
      published: "2026-09-23",
      note: "Date and venue reported; no 2027-specific rulebook published.",
    },
    {
      label: "Livemint — Goa set to host IPL 2027 mini-auction",
      url: "https://www.livemint.com/sports/cricket-news/ipl-auction-date-revealed-goa-set-to-host-ipl-2027-mini-auction-on-december-16-bcci-franchises-11792252053523.html",
      published: "2026-10-01",
      note: "Reports 16 December 2026 and a ₹130 crore purse. Media-only.",
    },
    {
      label: "Supplied 2026 sold-player list (project dataset)",
      url: "/sources",
      published: "2025-12-16",
      note: "Official winning bids for the 77 players sold in the 2026 auction; used as the 2027 retention contract value where available.",
    },
  ],
  notes: [
    "Mini-auction retentions follow the 2025–27 framework: there is no maximum number of retentions. A franchise may retain as many players from its existing 2026 squad as it wants, provided the final roster stays between 18 and 25 players with no more than 8 overseas players.",
    "A retained player costs exactly his existing contract value from the previous season. The total is deducted from the auction purse, and the balance is available to bid with.",
    "The 77 winning bids from the 2026 auction are the official contract values for those players. Salaries for players outside that sold list are simulator estimates and are labelled on every retention row.",
    "The ₹130 crore purse is reported by media and has not been confirmed in an official 2027 regulation PDF in this dataset.",
  ],
  limitations: [
    "Official 2026 contract values are only known for the 77 players sold in that auction. Other squad salaries are transparent estimates derived from rating, role and overseas status.",
    "Bid increments, RTM availability and any 2027-specific provisions remain unverified; the 2026-compatible increment table is used.",
  ],
};

export const RULEBOOKS = [RULEBOOK_2026, RULEBOOK_2026_RTM, RULEBOOK_2025, RULEBOOK_2027];

export function getRulebook(id: string): Rulebook | undefined {
  return RULEBOOKS.find((rulebook) => rulebook.id === id);
}

export function nextValidBid(
  currentBidLakh: number | null | undefined,
  basePriceLakh: number,
  increments: IncrementSlab[] = RULEBOOK_2026.increments,
): number {
  if (!currentBidLakh || currentBidLakh < basePriceLakh) return basePriceLakh;
  const slab = increments.find((entry) => entry.upToLakh === null || currentBidLakh < entry.upToLakh!);
  return currentBidLakh + (slab?.incrementLakh ?? increments.at(-1)?.incrementLakh ?? 5);
}

export function isValidBidAmount(
  amountLakh: number,
  currentBidLakh: number | null | undefined,
  basePriceLakh: number,
  increments: IncrementSlab[] = RULEBOOK_2026.increments,
): boolean {
  const next = nextValidBid(currentBidLakh, basePriceLakh, increments);
  return Number.isInteger(amountLakh) && amountLakh >= next;
}

export const RTM_PROCEDURE_2025 = [
  {
    step: 1,
    title: "Ordinary bidding concludes",
    detail:
      "The auctioneer identifies the highest bidder and the final ordinary bid. RTM cannot begin while ordinary bidding is still open.",
  },
  {
    step: 2,
    title: "Original franchise decides",
    detail:
      "The eligible original franchise may invoke RTM using an available card. If it declines, the player is sold to the highest bidder at the final bid.",
  },
  {
    step: 3,
    title: "Highest bidder gets one final raise",
    detail:
      "If RTM is invoked, the highest bidder has one final opportunity to increase the offer. The raise is any valid higher amount within its purse.",
  },
  {
    step: 4,
    title: "Original franchise matches or declines",
    detail:
      "The original franchise may match the revised final price or decline. If it matches, the player joins the original franchise at the final price. If it declines, the player joins the highest bidder at that final price and the RTM card is retained under the primary interpretation used here.",
  },
  {
    step: 5,
    title: "Purse and squad records update atomically",
    detail:
      "The winning franchise's purse is debited and the player is added to its squad in one database transaction. The RTM card count is reduced only when RTM is successfully used.",
  },
];

export const RTM_WORKED_EXAMPLE = {
  title: "RTM worked example — illustrative numbers",
  steps: [
    {
      label: "Ordinary bidding",
      price: 800,
      detail: "A player reaches a final ordinary bid of ₹8.00 crore. The leading bidder is Franchise B.",
    },
    {
      label: "Original team invokes RTM",
      price: 800,
      detail: "Franchise A, the eligible original team with one RTM card, chooses to exercise RTM.",
    },
    {
      label: "Leading bidder raises",
      price: 1_000,
      detail: "Franchise B uses its one final opportunity and raises the offer to ₹10.00 crore.",
    },
    {
      label: "Original team matches",
      price: 1_000,
      detail:
        "Franchise A matches ₹10.00 crore. The player joins Franchise A, its purse is debited ₹10.00 crore and one RTM card is consumed.",
    },
  ],
  alternate:
    "If Franchise A declines to match, the player joins Franchise B at ₹10.00 crore. If Franchise B had not raised, Franchise A could complete the RTM at ₹8.00 crore.",
};

export function rulebookPurseLabel(rulebook: Rulebook): string {
  return `${formatLakh(rulebook.purseCapLakh)} ${rulebook.purseCapVerified ? "(verified)" : "(reported)"}`;
}

export function validBidSlabsLabel(rulebook: Rulebook): string {
  if (rulebook.increments.length === 0) return "Unverified";
  return rulebook.increments
    .map((slab) =>
      slab.upToLakh === null
        ? `${formatLakh(slab.incrementLakh)} above`
        : `${formatLakh(slab.incrementLakh)} up to ${formatLakh(slab.upToLakh)}`,
    )
    .join(" · ");
}
