import type { SnapshotLot } from "./types";

export type AuctionCallTone = "open" | "bid" | "once" | "twice" | "sold" | "unsold" | "rtm";

export type AuctionCall = {
  id: string;
  text: string;
  tone: AuctionCallTone;
};

const ROLE_LABELS: Record<string, string> = {
  batter: "batter",
  bowler: "bowler",
  "all-rounder": "all rounder",
  allRounder: "all rounder",
  wicketkeeper: "wicketkeeper",
};

/** Prices as an auctioneer would say them, without currency symbols or decimals. */
export function spokenPrice(lakh: number | null | undefined): string {
  if (lakh === null || lakh === undefined || !Number.isFinite(lakh)) return "an undisclosed price";
  const rounded = Math.round(lakh);
  if (rounded < 100) return `${rounded} lakh`;
  const crore = Math.floor(rounded / 100);
  const remainder = rounded % 100;
  return remainder === 0 ? `${crore} crore` : `${crore} crore ${remainder} lakh`;
}

function playerPitch(lot: SnapshotLot): string {
  const player = lot.player;
  const role = ROLE_LABELS[player.role] ?? "player";
  const age = player.age;
  const bits = [role];
  if (age !== null) bits.push(`${age} years old`);
  if (player.isOverseas) bits.push("overseas");
  return bits.join(", ");
}

/** Colour lines rotate deterministically so repeated bids do not read identically. */
const BID_LINES = [
  (price: string, leader: string) => `${price} to ${leader}. The room is alive.`,
  (price: string, leader: string) => `${price} with ${leader}. Do I hear more?`,
  (price: string, leader: string) => `${price} from ${leader}. The paddle is up.`,
  (price: string, leader: string) => `${price} to ${leader}. The bidding keeps climbing.`,
  (price: string, leader: string) => `${price} on the table for ${leader}. Any advance?`,
];

export function buildAuctionCall(lot: SnapshotLot | null, finished: boolean): AuctionCall | null {
  if (!lot || finished) return null;

  const player = lot.player.name;
  const price = spokenPrice(lot.finalPriceLakh ?? lot.revisedPriceLakh ?? lot.currentBidLakh);
  const leader = lot.leaderTeamName;
  const id = [
    lot.id,
    lot.status,
    lot.going,
    lot.currentBidLakh ?? "-",
    lot.revisedPriceLakh ?? "-",
    lot.finalPriceLakh ?? "-",
    lot.winningTeamId ?? "-",
    lot.rtmStatus ?? "-",
  ].join(":");

  if (lot.status === "sold") {
    const winner = lot.winningTeamName ?? "the winning franchise";
    if (lot.soldVia === "rtm-match") {
      return {
        id,
        text: `Sold to ${winner} after Right to Match, for ${price}. The original franchise kept their man.`,
        tone: "sold",
      };
    }
    return {
      id,
      text: `Sold! ${player} to ${winner} for ${price}.`,
      tone: "sold",
    };
  }

  if (lot.status === "unsold") {
    return {
      id,
      text: `Unsold. ${player} returns to the pool at a base price of ${spokenPrice(lot.basePriceLakh)}.`,
      tone: "unsold",
    };
  }

  if (lot.status === "rtm") {
    const original = lot.originalTeamName ?? "The original franchise";
    return {
      id,
      text: `Right to Match! ${
        leader ? `${leader} lead at ${price}.` : `The leading bid is ${price}.`
      } ${original} can take the player back if they match — the room holds its breath.`,
      tone: "rtm",
    };
  }

  if (lot.status !== "live") return null;

  if (lot.currentBidLakh === null) {
    return {
      id,
      text: `Lot ${lot.lotNumber}. ${player}, ${playerPitch(lot)}. Base price ${spokenPrice(
        lot.basePriceLakh,
      )}. The bidding is open.`,
      tone: "open",
    };
  }

  if (lot.going >= 2) {
    return {
      id,
      text: `Going twice at ${price}${leader ? ` to ${leader}` : ""}. One final call before the hammer.`,
      tone: "twice",
    };
  }

  if (lot.going === 1) {
    return {
      id,
      text: `Going once at ${price}${leader ? ` to ${leader}` : ""}. Any advance on the price?`,
      tone: "once",
    };
  }

  const bidCount = lot.bids.length;
  let text: string;
  if (bidCount >= 6) {
    text = `${price} with ${leader}. Bid number ${bidCount}. This one is turning into a proper battle.`;
  } else if (bidCount <= 1 && leader) {
    text = `${price} opens from ${leader}. The room is watching.`;
  } else {
    const line = BID_LINES[Math.abs(lot.currentBidLakh + bidCount) % BID_LINES.length];
    text = line(price, leader ?? "the leading franchise");
  }
  return { id, text, tone: "bid" };
}
