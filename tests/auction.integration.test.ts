import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createFixtureDatabase, type FixtureDatabase } from "./helpers/fixture-db";

type Service = typeof import("../src/lib/auction/service");
type Snapshot = ReturnType<Service["getSessionSnapshot"]>;

let fixture: FixtureDatabase;
let svc: Service;

before(async () => {
  fixture = createFixtureDatabase();
  // The database module caches its connection, so the fixture path must be set first.
  svc = await import("../src/lib/auction/service");
});

after(async () => {
  const dbModule = await import("../src/db");
  dbModule.closeDb();
  fixture.close();
});

function setAllTeamsHuman(sessionId: string): void {
  fixture.db
    .prepare("UPDATE session_teams SET is_human = 1 WHERE session_id = ?")
    .run(sessionId);
}

function lotIdOf(snapshot: Snapshot): string {
  assert.ok(snapshot.currentLot, "expected a current lot");
  return snapshot.currentLot.id;
}

function forceLot(
  lotId: string,
  values: {
    status?: string;
    rtmStatus?: string | null;
    currentBidLakh?: number | null;
    revisedPriceLakh?: number | null;
    leaderTeamId?: string | null;
    quietTicks?: number;
    playerId?: string;
  },
): void {
  const assignments: string[] = [];
  const params: Array<string | number | null> = [];
  if (values.status !== undefined) {
    assignments.push("status = ?");
    params.push(values.status);
  }
  if (values.rtmStatus !== undefined) {
    assignments.push("rtm_status = ?");
    params.push(values.rtmStatus);
  }
  if (values.currentBidLakh !== undefined) {
    assignments.push("current_bid_lakh = ?");
    params.push(values.currentBidLakh);
  }
  if (values.revisedPriceLakh !== undefined) {
    assignments.push("revised_price_lakh = ?");
    params.push(values.revisedPriceLakh);
  }
  if (values.leaderTeamId !== undefined) {
    assignments.push("leader_team_id = ?");
    params.push(values.leaderTeamId);
  }
  if (values.quietTicks !== undefined) {
    assignments.push("quiet_ticks = ?");
    params.push(values.quietTicks);
  }
  if (values.playerId !== undefined) {
    assignments.push("player_id = ?");
    params.push(values.playerId);
  }
  assert.ok(assignments.length > 0, "forceLot needs at least one assignment");
  fixture.db.prepare(`UPDATE auction_lots SET ${assignments.join(", ")} WHERE id = ?`).run(...params, lotId);
}

function expectAuctionError(run: () => unknown, code: string): string {
  try {
    run();
  } catch (error) {
    const typed = error as { code?: string; message?: string; name?: string };
    assert.equal(typed.name, "AuctionError", `expected AuctionError, received ${String(error)}`);
    assert.equal(typed.code, code, typed.message);
    return typed.message ?? "";
  }
  assert.fail(`expected the action to fail with ${code}`);
}

function addSquadFillers(args: {
  sessionId: string;
  teamId: string;
  prefix: string;
  count: number;
  overseas?: boolean;
}): string[] {
  const at = new Date().toISOString();
  const insertPlayer = fixture.db.prepare(
    `INSERT INTO players (
       id, full_name, short_name, is_overseas, capped, role, role_source, data_status, created_at
     ) VALUES (?, ?, ?, ?, 1, 'batter', 'test-fixture', 'registry_only', ?)`,
  );
  const insertSquad = fixture.db.prepare(
    `INSERT INTO session_squads (
       session_id, team_id, player_id, price_lakh, price_verified, acquired_via, created_at
     ) VALUES (?, ?, ?, 30, 0, 'auction', ?)`,
  );
  const ids: string[] = [];
  for (let index = 0; index < args.count; index += 1) {
    const playerId = `${args.prefix}-${index}`;
    insertPlayer.run(
      playerId,
      `Filler ${args.prefix} ${index}`,
      `F ${index}`,
      args.overseas ? 1 : 0,
      at,
    );
    insertSquad.run(args.sessionId, args.teamId, playerId, at);
    ids.push(playerId);
  }
  return ids;
}

test("human bids enforce increments and settle into a single atomic sale", () => {
  const created = svc.createSession({ modeId: "replay-2026", userTeamId: "team-a" });
  const sessionId = created.session.id;
  setAllTeamsHuman(sessionId);

  assert.equal(created.currentLot?.status, "live");
  assert.equal(created.currentLot?.player.id, "p1");
  assert.equal(created.currentLot?.basePriceLakh, 200);
  assert.equal(created.userTeam?.purseLakh, 12_500);
  assert.equal(created.session.totalLots, 4);
  const lotId = lotIdOf(created);

  expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "bid", amountLakh: 200.5 }),
    "INVALID_AMOUNT",
  );
  expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "bid", amountLakh: 210 }),
    "INVALID_INCREMENT",
  );

  let snapshot = svc.actOnSession(sessionId, { type: "bid", amountLakh: 200 });
  assert.equal(snapshot.currentLot?.leaderTeamId, "team-a");
  assert.equal(snapshot.currentLot?.leaderTeamName, "Test Team A");
  assert.equal(snapshot.currentLot?.currentBidLakh, 200);
  assert.equal(snapshot.currentLot?.nextBidLakh, 220);
  assert.equal(snapshot.userTeam?.purseLakh, 12_500);
  assert.equal(snapshot.userTeam?.spentLakh, 0);
  assert.equal(snapshot.userSquad.length, 0);

  expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "bid", amountLakh: 220 }),
    "ALREADY_LEADING",
  );

  snapshot = svc.actOnSession(sessionId, { type: "tick" });
  assert.equal(snapshot.lastEvent?.type, "going_once");
  assert.equal(snapshot.currentLot?.status, "live");
  snapshot = svc.actOnSession(sessionId, { type: "tick" });
  assert.equal(snapshot.lastEvent?.type, "going_twice");
  snapshot = svc.actOnSession(sessionId, { type: "tick" });

  assert.equal(snapshot.currentLot?.status, "sold");
  assert.equal(snapshot.currentLot?.finalPriceLakh, 200);
  assert.equal(snapshot.currentLot?.winningTeamId, "team-a");
  assert.equal(snapshot.currentLot?.soldVia, "open");
  assert.equal(snapshot.session.completedLots, 1);
  assert.equal(snapshot.userTeam?.purseLakh, 12_300);
  assert.equal(snapshot.userTeam?.spentLakh, 200);
  assert.equal(snapshot.userSquad.length, 1);
  assert.equal(snapshot.userSquad[0].playerId, "p1");
  assert.equal(snapshot.userSquad[0].priceLakh, 200);
  assert.equal(snapshot.userSquad[0].acquiredVia, "auction");

  const transaction = fixture.db
    .prepare(
      "SELECT type, amount_lakh AS amountLakh FROM auction_transactions WHERE session_id = ? AND lot_id = ?",
    )
    .get(sessionId, lotId) as { type: string; amountLakh: number };
  assert.deepEqual(transaction, { type: "auction-sale", amountLakh: 200 });

  expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "bid", amountLakh: 220 }),
    "LOT_NOT_LIVE",
  );

  snapshot = svc.actOnSession(sessionId, { type: "tick" });
  assert.equal(snapshot.currentLot?.status, "live");
  assert.equal(snapshot.currentLot?.lotNumber, 2);
  assert.equal(snapshot.currentLot?.player.id, "p3");
  assert.equal(snapshot.session.completedLots, 1);
  assert.equal(snapshot.session.status, "active");
});

test("purse, squad-size and overseas limits all block human bids", () => {
  const created = svc.createSession({ modeId: "mega-2026", userTeamId: "team-a" });
  const sessionId = created.session.id;
  setAllTeamsHuman(sessionId);
  const lotId = lotIdOf(created);

  fixture.db
    .prepare("UPDATE session_teams SET purse_lakh = 1000 WHERE session_id = ? AND team_id = 'team-a'")
    .run(sessionId);
  forceLot(lotId, { currentBidLakh: 980, leaderTeamId: "team-b", quietTicks: 0 });

  const purseMessage = expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "bid", amountLakh: 1_000 }),
    "PURSE_LIMIT",
  );
  assert.match(purseMessage, /maximum bid is ₹2\.50 Cr/);

  addSquadFillers({ sessionId, teamId: "team-a", prefix: `${sessionId}-full`, count: 25 });
  forceLot(lotId, { currentBidLakh: null, leaderTeamId: null });

  const squadMessage = expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "bid", amountLakh: 200 }),
    "BID_BLOCKED",
  );
  assert.match(squadMessage, /Squad is full/);

  const overseasIds = addSquadFillers({
    sessionId,
    teamId: "team-a",
    prefix: `${sessionId}-overseas`,
    count: 8,
    overseas: true,
  });
  const fullSquad = fixture.db
    .prepare("SELECT player_id AS playerId FROM session_squads WHERE session_id = ? AND team_id = 'team-a'")
    .all(sessionId) as Array<{ playerId: string }>;
  const overseasSet = new Set(overseasIds);
  const removable = fullSquad.filter((row) => !overseasSet.has(row.playerId)).slice(0, 15);
  const removeSquad = fixture.db.prepare(
    "DELETE FROM session_squads WHERE session_id = ? AND player_id = ?",
  );
  for (const row of removable) removeSquad.run(sessionId, row.playerId);
  assert.equal(
    (fixture.db
      .prepare("SELECT COUNT(*) AS count FROM session_squads WHERE session_id = ? AND team_id = 'team-a'")
      .get(sessionId) as { count: number }).count,
    18,
  );

  forceLot(lotId, { playerId: "p3", currentBidLakh: null, leaderTeamId: null });
  const overseasMessage = expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "bid", amountLakh: 200 }),
    "BID_BLOCKED",
  );
  assert.match(overseasMessage, /Overseas limit \(8\) reached/);

  fixture.db
    .prepare("DELETE FROM session_squads WHERE session_id = ? AND player_id = ?")
    .run(sessionId, overseasIds[0]);
  const accepted = svc.actOnSession(sessionId, { type: "bid", amountLakh: 200 });
  assert.equal(accepted.currentLot?.leaderTeamId, "team-a");
  assert.equal(accepted.userTeam?.overseasCount, 7);
  assert.equal(accepted.userTeam?.squadSize, 17);
  assert.equal(accepted.userTeam?.maxBidLakh, 1_000);
});

test("RTM entry pauses ordinary bidding and a matched RTM consumes a card", () => {
  const created = svc.createSession({ modeId: "rtm-2025-practice", userTeamId: "team-a" });
  const sessionId = created.session.id;
  setAllTeamsHuman(sessionId);
  const lotId = lotIdOf(created);

  assert.equal(created.session.rulebook.rtmCards, 6);
  assert.equal(created.userTeam?.rtmRemaining, 6);
  assert.equal(created.currentLot?.player.id, "p1");

  forceLot(lotId, { currentBidLakh: 800, leaderTeamId: "team-b", quietTicks: 2 });
  let snapshot = svc.actOnSession(sessionId, { type: "tick" });

  assert.equal(snapshot.currentLot?.status, "rtm");
  assert.equal(snapshot.currentLot?.rtmStatus, "awaiting_original");
  assert.equal(snapshot.currentLot?.rtmActions.canInvoke, true);
  assert.equal(snapshot.currentLot?.rtmActions.canDeclineOriginal, true);
  assert.match(snapshot.currentLot?.rtmActions.prompt ?? "", /invoke Right to Match at ₹8 Cr/);

  expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "rtm_raise", amountLakh: 825 }),
    "RTM_NOT_YOUR_DECISION",
  );

  snapshot = svc.actOnSession(sessionId, { type: "rtm_invoke" });
  assert.equal(snapshot.currentLot?.rtmStatus, "awaiting_raise");
  assert.equal(snapshot.currentLot?.rtmActions.canRaise, false);
  assert.equal(snapshot.userTeam?.rtmRemaining, 6);
  assert.equal(snapshot.userTeam?.purseLakh, 12_000);
  assert.equal(snapshot.lastEvent?.type, "rtm_invoked");

  forceLot(lotId, { rtmStatus: "awaiting_match", revisedPriceLakh: 1_000 });
  snapshot = svc.getSessionSnapshot(sessionId);
  assert.equal(snapshot.currentLot?.rtmActions.canMatch, true);
  assert.equal(snapshot.currentLot?.rtmActions.canDeclineMatch, true);
  assert.match(snapshot.currentLot?.rtmActions.prompt ?? "", /Match ₹10 Cr/);

  snapshot = svc.actOnSession(sessionId, { type: "rtm_match" });
  assert.equal(snapshot.currentLot?.status, "sold");
  assert.equal(snapshot.currentLot?.winningTeamId, "team-a");
  assert.equal(snapshot.currentLot?.finalPriceLakh, 1_000);
  assert.equal(snapshot.currentLot?.soldVia, "rtm-match");
  assert.equal(snapshot.currentLot?.rtmStatus, "matched");
  assert.equal(snapshot.userTeam?.purseLakh, 11_000);
  assert.equal(snapshot.userTeam?.spentLakh, 1_000);
  assert.equal(snapshot.userTeam?.rtmRemaining, 5);
  assert.equal(snapshot.userSquad[0].acquiredVia, "rtm");

  const transaction = fixture.db
    .prepare("SELECT type, amount_lakh AS amountLakh FROM auction_transactions WHERE session_id = ? AND lot_id = ?")
    .get(sessionId, lotId) as { type: string; amountLakh: number };
  assert.deepEqual(transaction, { type: "rtm-match", amountLakh: 1_000 });
  const soldEvent = fixture.db
    .prepare("SELECT message FROM auction_events WHERE session_id = ? AND type = 'sold'")
    .get(sessionId) as { message: string };
  assert.match(soldEvent.message, /SOLD via RTM/);
});

test("the final bidder raise validates amounts and pays the revised price when the original club declines", () => {
  const created = svc.createSession({ modeId: "rtm-2025-practice", userTeamId: "team-b" });
  const sessionId = created.session.id;
  setAllTeamsHuman(sessionId);
  const lotId = lotIdOf(created);

  forceLot(lotId, {
    status: "rtm",
    rtmStatus: "awaiting_raise",
    currentBidLakh: 800,
    revisedPriceLakh: 800,
    leaderTeamId: "team-b",
  });

  let snapshot = svc.getSessionSnapshot(sessionId);
  assert.equal(snapshot.currentLot?.originalTeamId, "team-a");
  assert.equal(snapshot.currentLot?.rtmActions.canRaise, true);
  assert.equal(snapshot.currentLot?.rtmActions.minRaiseLakh, 825);
  // 17 squad slots still to fill, priced from the cheapest pending base prices,
  // leaves 12,000 − 750 = 11,250 as the largest legal final offer.
  assert.equal(snapshot.currentLot?.rtmActions.maxRaiseLakh, 11_250);

  expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "rtm_raise", amountLakh: 801 }),
    "INVALID_AMOUNT",
  );
  expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "rtm_raise", amountLakh: 820 }),
    "INVALID_RAISE",
  );
  expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "rtm_raise", amountLakh: 12_000 }),
    "PURSE_LIMIT",
  );

  fixture.db
    .prepare("UPDATE session_teams SET purse_lakh = 100 WHERE session_id = ? AND team_id = 'team-a'")
    .run(sessionId);

  snapshot = svc.actOnSession(sessionId, { type: "rtm_raise", amountLakh: 825 });
  assert.equal(snapshot.currentLot?.status, "sold");
  assert.equal(snapshot.currentLot?.winningTeamId, "team-b");
  assert.equal(snapshot.currentLot?.finalPriceLakh, 825);
  assert.equal(snapshot.currentLot?.soldVia, "rtm-declined");
  assert.equal(snapshot.currentLot?.rtmStatus, "declined_match");
  assert.equal(snapshot.userTeam?.purseLakh, 11_175);
  assert.equal(snapshot.userTeam?.spentLakh, 825);
  assert.equal(snapshot.userTeam?.rtmRemaining, 6);
  assert.equal(snapshot.userSquad[0].acquiredVia, "auction");

  const blocked = fixture.db
    .prepare("SELECT message FROM auction_events WHERE session_id = ? AND type = 'rtm_match_blocked'")
    .get(sessionId) as { message: string };
  assert.match(blocked.message, /cannot match ₹8\.25 Cr/);

  const originalCard = fixture.db
    .prepare("SELECT rtm_remaining AS rtmRemaining FROM session_teams WHERE session_id = ? AND team_id = 'team-a'")
    .get(sessionId) as { rtmRemaining: number };
  assert.equal(originalCard.rtmRemaining, 6);
});

test("declining RTM sells to the leading bidder and keeps the original card", () => {
  const created = svc.createSession({ modeId: "rtm-2025-practice", userTeamId: "team-a" });
  const sessionId = created.session.id;
  setAllTeamsHuman(sessionId);
  const lotId = lotIdOf(created);

  expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "rtm_decline" }),
    "RTM_NOT_OPEN",
  );

  forceLot(lotId, {
    status: "rtm",
    rtmStatus: "awaiting_original",
    currentBidLakh: 800,
    revisedPriceLakh: 800,
    leaderTeamId: "team-b",
  });

  const snapshot = svc.actOnSession(sessionId, { type: "rtm_decline" });
  assert.equal(snapshot.currentLot?.status, "sold");
  assert.equal(snapshot.currentLot?.winningTeamId, "team-b");
  assert.equal(snapshot.currentLot?.finalPriceLakh, 800);
  assert.equal(snapshot.currentLot?.soldVia, "rtm-declined");
  assert.equal(snapshot.currentLot?.rtmStatus, "declined_original");
  assert.equal(snapshot.userTeam?.purseLakh, 12_000);
  assert.equal(snapshot.userTeam?.rtmRemaining, 6);
  assert.equal(snapshot.userSquad.length, 0);
  assert.equal(snapshot.teams.find((team) => team.id === "team-b")?.purseLakh, 11_200);
  assert.equal(snapshot.lastEvent?.type, "sold");
  assert.match(snapshot.lastEvent?.message ?? "", /SOLD after RTM/);
});

test("the final settled lot completes the session and locks further actions", () => {
  const created = svc.createSession({ modeId: "replay-2026", userTeamId: "team-j" });
  const sessionId = created.session.id;
  setAllTeamsHuman(sessionId);
  const lotId = lotIdOf(created);

  fixture.db.prepare("DELETE FROM auction_lots WHERE session_id = ? AND lot_number > 1").run(sessionId);
  fixture.db
    .prepare("UPDATE auction_sessions SET total_lots = 1 WHERE id = ?")
    .run(sessionId);
  forceLot(lotId, { currentBidLakh: 200, leaderTeamId: "team-j" });

  svc.actOnSession(sessionId, { type: "tick" });
  svc.actOnSession(sessionId, { type: "tick" });
  const snapshot = svc.actOnSession(sessionId, { type: "tick" });

  assert.equal(snapshot.finished, true);
  assert.equal(snapshot.session.status, "completed");
  assert.ok(snapshot.session.completedAt);
  assert.equal(snapshot.session.completedLots, 1);
  assert.equal(snapshot.userTeam?.purseLakh, 12_300);
  assert.equal(snapshot.lastEvent?.type, "auction_complete");

  const completePayload = fixture.db
    .prepare("SELECT payload_json AS payload FROM auction_events WHERE session_id = ? AND type = 'auction_complete'")
    .get(sessionId) as { payload: string };
  const payload = JSON.parse(completePayload.payload) as { squadShortfall: number };
  assert.equal(payload.squadShortfall, 17, "replay sprints report the shortfall honestly");

  const afterComplete = svc.actOnSession(sessionId, { type: "tick" });
  assert.equal(afterComplete.session.completedAt, snapshot.session.completedAt);
  expectAuctionError(
    () => svc.actOnSession(sessionId, { type: "bid", amountLakh: 200 }),
    "AUCTION_COMPLETE",
  );
  expectAuctionError(() => svc.abandonSession(sessionId), "AUCTION_NOT_ACTIVE");

  const summary = svc.getSessionSummary(sessionId);
  assert.equal(summary.status, "completed");
  assert.equal(summary.userTeamName, "Test Team J");
  assert.equal(summary.userSquadSize, 1);
});

test("saved sessions can be resumed and abandoned sessions leave the lobby", () => {
  expectAuctionError(
    () => svc.createSession({ modeId: "replay-2026", userTeamId: "missing-team" }),
    "TEAM_NOT_FOUND",
  );
  expectAuctionError(
    () => svc.createSession({ modeId: "not-a-mode", userTeamId: "team-a" }),
    "MODE_NOT_FOUND",
  );

  const created = svc.createSession({ modeId: "mini-2026", userTeamId: "team-d" });
  const sessionId = created.session.id;
  assert.ok(svc.sessionExists(sessionId));
  assert.equal(created.session.config.simulatedRetention, true);
  assert.ok(svc.getSessionSnapshot(sessionId).currentLot);

  const listed = svc.listSessionSummaries(100).find((row) => row.id === sessionId);
  assert.ok(listed, "new session should be listed in the lobby");
  assert.equal(listed.userTeamName, "Test Team D");
  assert.equal(listed.userPurseLakh, created.userTeam?.purseLakh);

  svc.abandonSession(sessionId);
  const abandoned = svc.getSessionSnapshot(sessionId);
  assert.equal(abandoned.session.status, "abandoned");
  assert.equal(abandoned.lastEvent?.type, "session_abandoned");
  assert.equal(
    svc.listSessionSummaries(100).some((row) => row.id === sessionId),
    false,
    "abandoned sessions must not appear in the lobby",
  );
  svc.abandonSession(sessionId);
  assert.equal(svc.getSessionSnapshot(sessionId).session.status, "abandoned");

  expectAuctionError(
    () => svc.getSessionSummary("missing-session"),
    "SESSION_NOT_FOUND",
  );
  assert.equal(svc.sessionExists("missing-session"), false);
});
