import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAuctionCall, spokenPrice } from "../src/lib/auction/calls";
import type { SnapshotLot } from "../src/lib/auction/types";

function makeLot(overrides: Partial<SnapshotLot> = {}): SnapshotLot {
  return {
    id: "lot-1",
    lotNumber: 7,
    status: "live",
    setName: "Marquee",
    basePriceLakh: 200,
    basePriceVerified: true,
    currentBidLakh: null,
    revisedPriceLakh: null,
    leaderTeamId: null,
    leaderTeamName: null,
    originalTeamId: null,
    originalTeamName: null,
    rtmAvailable: false,
    rtmStatus: null,
    finalPriceLakh: null,
    winningTeamId: null,
    winningTeamName: null,
    soldVia: null,
    nextBidLakh: 200,
    going: 0,
    player: { name: "Test Player", role: "batter" } as SnapshotLot["player"],
    actualAuction: null,
    userBidBlockedReason: null,
    bids: [],
    rtmActions: {
      canInvoke: false,
      canDeclineOriginal: false,
      canRaise: false,
      canHold: false,
      canMatch: false,
      canDeclineMatch: false,
      targetTeamId: null,
      minRaiseLakh: null,
      maxRaiseLakh: null,
      prompt: null,
    },
    ...overrides,
  };
}

test("spokenPrice uses lakh below one crore and splits crore plus lakh", () => {
  assert.equal(spokenPrice(45), "45 lakh");
  assert.equal(spokenPrice(99), "99 lakh");
  assert.equal(spokenPrice(100), "1 crore");
  assert.equal(spokenPrice(240), "2 crore 40 lakh");
  assert.equal(spokenPrice(205), "2 crore 5 lakh");
  assert.equal(spokenPrice(null), "an undisclosed price");
});

test("auctioneer opens a lot with number, role and base price", () => {
  const call = buildAuctionCall(makeLot(), false);
  assert.equal(call?.tone, "open");
  assert.match(call?.text ?? "", /Lot 7/);
  assert.match(call?.text ?? "", /Test Player, batter/);
  assert.match(call?.text ?? "", /Base price 2 crore/);
});

test("live bids escalate through going once and going twice", () => {
  const bid = buildAuctionCall(
    makeLot({ currentBidLakh: 240, leaderTeamName: "Mumbai Indians" }),
    false,
  );
  assert.equal(bid?.tone, "bid");
  assert.match(bid?.text ?? "", /2 crore 40 lakh/);
  assert.match(bid?.text ?? "", /Mumbai Indians/);

  const once = buildAuctionCall(
    makeLot({ currentBidLakh: 240, leaderTeamName: "Mumbai Indians", going: 1 }),
    false,
  );
  assert.equal(once?.tone, "once");
  assert.match(once?.text ?? "", /Going once at 2 crore 40 lakh to Mumbai Indians/);

  const twice = buildAuctionCall(
    makeLot({ currentBidLakh: 240, leaderTeamName: "Mumbai Indians", going: 2 }),
    false,
  );
  assert.equal(twice?.tone, "twice");
  assert.match(twice?.text ?? "", /Going twice/);
});

test("sold and unsold calls report the hammer and the pool return", () => {
  const sold = buildAuctionCall(
    makeLot({
      status: "sold",
      currentBidLakh: 500,
      finalPriceLakh: 500,
      winningTeamId: "chennai-super-kings",
      winningTeamName: "Chennai Super Kings",
    }),
    false,
  );
  assert.equal(sold?.tone, "sold");
  assert.match(sold?.text ?? "", /Sold! Test Player to Chennai Super Kings for 5 crore/);

  const matched = buildAuctionCall(
    makeLot({
      status: "sold",
      finalPriceLakh: 320,
      winningTeamName: "Rajasthan Royals",
      soldVia: "rtm-match",
    }),
    false,
  );
  assert.match(matched?.text ?? "", /after Right to Match/);

  const unsold = buildAuctionCall(
    makeLot({ status: "unsold", basePriceLakh: 75, currentBidLakh: null }),
    false,
  );
  assert.equal(unsold?.tone, "unsold");
  assert.match(unsold?.text ?? "", /returns to the pool at a base price of 75 lakh/);
});

test("RTM call names the leader and original franchise, and finished rooms stay silent", () => {
  const call = buildAuctionCall(
    makeLot({
      status: "rtm",
      currentBidLakh: 300,
      leaderTeamName: "Rajasthan Royals",
      originalTeamName: "Delhi Capitals",
      rtmStatus: "awaiting_original",
    }),
    false,
  );
  assert.equal(call?.tone, "rtm");
  assert.match(call?.text ?? "", /Rajasthan Royals lead at 3 crore/);
  assert.match(call?.text ?? "", /Delhi Capitals/);

  assert.equal(buildAuctionCall(makeLot(), true), null);
  assert.equal(buildAuctionCall(null, false), null);
});
