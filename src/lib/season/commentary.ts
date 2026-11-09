import { hashInt } from "./random";

export type CommentaryInput = {
  seed: number;
  key: string;
  overLabel: string;
  batter: string;
  bowler: string;
  fielder: string | null;
  runs: number;
  extraType: "wide" | "nb" | null;
  wicketType: string | null;
  freeHit: boolean;
  milestone: string | null;
  equation: string | null;
};

const DOTS = [
  "Good length outside off, defended into the covers.",
  "Beaten! Lovely shape away from the bat.",
  "Tucked off the pads, but straight to short leg.",
  "Slower ball, mistimed back down the pitch.",
  "Wide yorker, dug out at the last moment.",
  "Swing and a miss — the crowd holds its breath.",
  "Pushed towards point, no run on offer.",
  "A sharp bouncer, ducked underneath.",
  "Spinning away, the batter plays inside the line.",
  "Full and straight, jammed back to the bowler.",
];

const SINGLES = [
  "Worked into the leg side for one.",
  "Pushed into the covers, easy single.",
  "Drop and run — they scamper through for one.",
  "Tucked behind square for a single.",
  "Driven to long-off, one run.",
  "Inside edge, dribbles away for one.",
  "Guided down to third, one more.",
  "Nudged into the gap at midwicket for a single.",
];

const TWOS = [
  "Placed into the gap at deep midwicket, they come back for two.",
  "Driven wide of long-on, two runs.",
  "Sharp running between the wickets, two more.",
  "Swept fine, the fielder cuts it off — two.",
  "Whipped through midwicket, good running for two.",
];

const THREES = [
  "Smashed into the deep, the fielder chases — three runs!",
  "Beautifully timed through the gap, three.",
  "A misfield in the deep lets them take three.",
  "Into the gap at deep cover, three hard-run runs.",
];

const FOURS = [
  "FOUR! Cracked through the covers — pure timing.",
  "FOUR! Short and wide, put away with disdain.",
  "FOUR! Flicked off the pads, fine leg can only watch.",
  "FOUR! Inside edge, past the keeper, races to the fence.",
  "FOUR! Slog-swept into the gap at deep midwicket.",
  "FOUR! Chipped over extra cover, exquisite touch.",
  "FOUR! Muscled down the ground, no chance for long-on.",
  "FOUR! Cut late and hard, backward point is beaten.",
  "FOUR! Whipped through the leg side, the gap is enormous.",
];

const SIXES = [
  "SIX! Launched over long-on — that is enormous!",
  "SIX! Picked up off the hip and deposited over deep square leg.",
  "SIX! Down on one knee and slog-swept into the stands.",
  "SIX! Straight, flat, and gone over the bowler's head.",
  "SIX! The crowd rises — pulled over deep midwicket.",
  "SIX! Audacious. Scooped over fine leg for half a dozen.",
  "SIX! The sound off the bat was different. Miles over cow corner.",
  "SIX! Clears the front leg and launches it into the night sky.",
];

const WIDE_LINES = [
  "Wide down the leg side. One extra.",
  "Wide outside off — the umpire stretches his arms.",
  "Sprayed down leg, that will be a wide.",
  "Too far outside off, another wide.",
];

const NO_BALL_LINES = [
  "No ball! Overstepped — free hit coming up.",
  "No ball, the front foot has gone too far. Free hit next.",
  "Over the line — no ball called, and a free hit follows.",
];

function pick(seed: number, key: string, label: string, lines: string[]): string {
  return lines[hashInt(lines.length, seed, key, label)];
}

function wicketLines(wicketType: string, batter: string, bowler: string, fielder: string | null): string[] {
  switch (wicketType) {
    case "caught":
      return [
        `OUT! Caught at deep midwicket by ${fielder}. ${batter} has to go.`,
        `OUT! Skied, and ${fielder} settles under it at long-on.`,
        `OUT! A brilliant diving catch by ${fielder}! ${batter} cannot believe it.`,
        `OUT! Picked out ${fielder} in the deep. Simple catch, big wicket.`,
      ];
    case "caught and bowled":
      return [
        `OUT! Caught and bowled! ${bowler} dives forward to take it.`,
        `OUT! Leading edge, and ${bowler} snaffles the return catch.`,
      ];
    case "bowled":
      return [
        `OUT! Bowled him! ${bowler} knocks over ${batter} — the stumps are shattered.`,
        `OUT! Through the gate! ${batter} is bowled.`,
        `OUT! A searing yorker, ${batter} is cleaned up.`,
      ];
    case "lbw":
      return [
        `OUT! Plumb in front — ${batter} is trapped lbw by ${bowler}.`,
        `OUT! Big appeal, and the finger goes up. LBW.`,
        `OUT! Skidded on, struck on the pad. That looked adjacent.`,
      ];
    case "run out":
      return [
        `OUT! Run out! ${fielder} nails the throw and ${batter} is short of the crease.`,
        `OUT! Direct hit! ${batter} is run out by ${fielder}.`,
        `OUT! Terrible mix-up, and ${fielder} makes them pay.`,
      ];
    case "stumped":
      return [
        `OUT! Stumped! Sharp work behind the stumps, ${batter} is miles out.`,
        `OUT! Dragged out of the crease, and the keeper does the rest.`,
        `OUT! Quick hands, stumps broken. ${batter} has to walk.`,
      ];
    default:
      return [`OUT! ${batter} is dismissed.`];
  }
}

export function buildDeliveryCommentary(input: CommentaryInput): string {
  const { seed, key, overLabel, batter, bowler, fielder, runs, extraType, wicketType, freeHit, milestone, equation } =
    input;
  const prefix = `${overLabel} — `;
  let body: string;

  if (extraType === "wide") {
    body = pick(seed, key, "wide", WIDE_LINES);
    if (freeHit) body = `${body} Free hit survives.`;
  } else if (extraType === "nb") {
    body = pick(seed, key, "noball", NO_BALL_LINES);
  } else if (wicketType) {
    body = pick(seed, key, `wicket-${wicketType}`, wicketLines(wicketType, batter, bowler, fielder));
  } else if (runs >= 6) {
    body = pick(seed, key, "six", SIXES);
  } else if (runs === 4) {
    body = pick(seed, key, "four", FOURS);
  } else if (runs === 3) {
    body = pick(seed, key, "three", THREES);
  } else if (runs === 2) {
    body = pick(seed, key, "two", TWOS);
  } else if (runs === 1) {
    body = pick(seed, key, "single", SINGLES);
  } else {
    body = pick(seed, key, "dot", DOTS);
  }

  if (freeHit && !extraType) body = `Free hit — ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
  const extras = [milestone, equation].filter((part): part is string => Boolean(part));
  const suffix = extras.length > 0 ? ` ${extras.join(" ")}` : "";
  return `${prefix}${bowler} to ${batter}, ${body}${suffix}`;
}

export function commentaryOverLabel(legalBalls: number, ballInOver: number): string {
  return `${Math.floor(legalBalls / 6)}.${ballInOver}`;
}
