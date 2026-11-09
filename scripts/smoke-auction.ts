import { getDb } from "../src/db";
import { actOnSession, createSession } from "../src/lib/auction/service";
import type { AuctionSnapshot } from "../src/lib/auction/types";

function autoBid(snapshot: AuctionSnapshot): AuctionSnapshot | null {
  const lot = snapshot.currentLot;
  if (!lot || lot.status !== "live" || lot.userBidBlockedReason !== null || lot.nextBidLakh === null) {
    return null;
  }
  const squadSize = snapshot.userSquad.length;
  const ovr = lot.player.rating?.ovr ?? 0;
  if (squadSize < 18 || ovr >= 72) {
    return actOnSession(snapshot.session.id, { type: "bid", amountLakh: lot.nextBidLakh });
  }
  return null;
}

function runMode(modeId: string, teamId: string, maxTicks: number, autoRtm: boolean): void {
  const db = getDb();
  let snapshot = createSession({ modeId, userTeamId: teamId });
  console.log(`\n=== ${modeId} / ${teamId} ===`);
  console.log(
    `session ${snapshot.session.id} · lots ${snapshot.session.totalLots} · asOf ${snapshot.session.config.asOfSeason} · opening purse ${snapshot.userTeam?.purseLakh}`,
  );
  console.log(
    `retained ${snapshot.userSquad.filter((player) => player.retained).length} · squad ${snapshot.userSquad.length} · pool upcoming ${snapshot.upcomingLots.length}`,
  );

  let ticks = 0;
  let bids = 0;
  let rtmActions = 0;
  for (; ticks < maxTicks && !snapshot.finished; ticks += 1) {
    const afterBid = autoBid(snapshot);
    if (afterBid) {
      snapshot = afterBid;
      bids += 1;
      if (snapshot.finished) break;
    }
    const lot = snapshot.currentLot;
    if (autoRtm && lot && lot.status === "rtm") {
      const actions = lot.rtmActions;
      if (actions.canMatch) {
        snapshot = actOnSession(snapshot.session.id, { type: "rtm_match" });
        rtmActions += 1;
        continue;
      }
      if (actions.canDeclineMatch) {
        snapshot = actOnSession(snapshot.session.id, { type: "rtm_decline_match" });
        rtmActions += 1;
        continue;
      }
      if (actions.canInvoke) {
        snapshot = actOnSession(snapshot.session.id, { type: "rtm_invoke" });
        rtmActions += 1;
        continue;
      }
      if (actions.canRaise && actions.minRaiseLakh !== null) {
        snapshot = actOnSession(snapshot.session.id, {
          type: "rtm_raise",
          amountLakh: actions.minRaiseLakh,
        });
        rtmActions += 1;
        continue;
      }
      if (actions.canHold) {
        snapshot = actOnSession(snapshot.session.id, { type: "rtm_hold" });
        rtmActions += 1;
        continue;
      }
    }
    snapshot = actOnSession(snapshot.session.id, { type: "tick" });
  }

  const sessionId = snapshot.session.id;
  const sold = db
    .prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(final_price_lakh), 0) AS total FROM auction_lots WHERE session_id = ? AND status = 'sold'",
    )
    .get(sessionId) as { count: number; total: number };
  const unsold = db
    .prepare("SELECT COUNT(*) AS count FROM auction_lots WHERE session_id = ? AND status = 'unsold'")
    .get(sessionId) as { count: number };
  const rtmMatched = db
    .prepare("SELECT COUNT(*) AS count FROM auction_lots WHERE session_id = ? AND sold_via = 'rtm-match'")
    .get(sessionId) as { count: number };
  const teams = db
    .prepare(
      `SELECT st.team_id, st.purse_lakh, st.spent_lakh, st.opening_purse_lakh,
              (SELECT COUNT(*) FROM session_squads sq WHERE sq.session_id = st.session_id AND sq.team_id = st.team_id) AS squad,
              (SELECT COUNT(*) FROM session_squads sq JOIN players p ON p.id = sq.player_id
               WHERE sq.session_id = st.session_id AND sq.team_id = st.team_id AND p.is_overseas = 1) AS overseas
       FROM session_teams st WHERE st.session_id = ? ORDER BY st.team_id`,
    )
    .all(sessionId) as Array<{
      team_id: string;
      purse_lakh: number;
      spent_lakh: number;
      opening_purse_lakh: number;
      squad: number;
      overseas: number;
    }>;
  const badTeams = teams.filter(
    (team) =>
      team.purse_lakh < 0 ||
      team.squad > 25 ||
      team.overseas > 8 ||
      team.opening_purse_lakh - team.spent_lakh !== team.purse_lakh,
  );
  const transactionTotal = db
    .prepare(
      "SELECT COALESCE(SUM(amount_lakh), 0) AS total FROM auction_transactions WHERE session_id = ? AND type IN ('auction-sale','rtm-match')",
    )
    .get(sessionId) as { total: number };
  console.log(
    `finished=${snapshot.finished} ticks=${ticks} userBids=${bids} rtmActions=${rtmActions} status=${snapshot.session.status}`,
  );
  console.log(
    `lots completed=${snapshot.session.completedLots}/${snapshot.session.totalLots} sold=${sold.count} (${sold.total} lakh) unsold=${unsold.count} rtmMatched=${rtmMatched.count}`,
  );
  console.log(
    `user squad=${snapshot.userSquad.length} purse=${snapshot.userTeam?.purseLakh} spent=${snapshot.userTeam?.spentLakh} retained=${snapshot.userTeam?.preExistingValueLakh}`,
  );
  console.log(
    `sale transactions=${transactionTotal.total} · team checks=${badTeams.length === 0 ? "OK" : JSON.stringify(badTeams)}`,
  );
  console.log(
    `events=${(db.prepare("SELECT COUNT(*) AS c FROM auction_events WHERE session_id = ?").get(sessionId) as { c: number }).c} bids=${(db.prepare("SELECT COUNT(*) AS c FROM auction_bids WHERE session_id = ?").get(sessionId) as { c: number }).c}`,
  );
  if (!snapshot.finished) {
    console.log("NOT FINISHED · current lot:", snapshot.currentLot?.lotNumber, snapshot.currentLot?.status);
  }
  db.prepare("DELETE FROM auction_sessions WHERE id = ?").run(sessionId);
}

runMode("mini-2026", "chennai-super-kings", 6000, false);
runMode("rtm-2025-practice", "rajasthan-royals", 20000, true);
