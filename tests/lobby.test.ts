import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createFixtureDatabase, TEAM_IDS, type FixtureDatabase } from "./helpers/fixture-db";

type Service = typeof import("../src/lib/auction/service");
type LobbyApi = typeof import("../src/lib/auction/lobby");

let fixture: FixtureDatabase;
let svc: Service;
let lobbyApi: LobbyApi;

before(async () => {
  fixture = createFixtureDatabase();
  svc = await import("../src/lib/auction/service");
  lobbyApi = await import("../src/lib/auction/lobby");
});

after(async () => {
  const dbModule = await import("../src/db");
  dbModule.closeDb();
  fixture.close();
});

function expectAuctionError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    const typed = error as { code?: string; message?: string; name?: string };
    assert.equal(typed.name, "AuctionError", `expected AuctionError, received ${String(error)}`);
    assert.equal(typed.code, code, typed.message);
    return;
  }
  assert.fail(`expected the action to fail with ${code}`);
}

function humanTeams(sessionId: string): string[] {
  return (
    fixture.db
      .prepare("SELECT team_id AS teamId FROM session_teams WHERE session_id = ? AND is_human = 1 ORDER BY team_id")
      .all(sessionId) as Array<{ teamId: string }>
  ).map((row) => row.teamId);
}

test("a lobby starts in the waiting room with ten seats and one human host", () => {
  const created = svc.createLobby({
    modeId: "replay-2026",
    userTeamId: "team-a",
    name: "Friday war room",
    displayName: "Host",
  });
  const { sessionId, joinCode, participantId, token } = created.lobby;
  const snapshot = created.snapshot;

  assert.equal(joinCode.length, 6);
  assert.ok(participantId);
  assert.ok(token.length > 8);
  assert.equal(snapshot.session.status, "lobby");
  assert.equal(snapshot.session.name, "Friday war room");
  assert.equal(snapshot.currentLot, null);
  assert.equal(snapshot.lobby?.status, "lobby");
  assert.equal(snapshot.lobby?.humanCount, 1);
  assert.equal(snapshot.lobby?.aiCount, 9);
  assert.equal(snapshot.lobby?.viewer.canAct, true);
  assert.equal(snapshot.lobby?.viewer.isHost, true);
  assert.equal(snapshot.lobby?.viewer.teamId, "team-a");
  assert.equal(snapshot.lobby?.seats.length, 10);
  assert.equal(snapshot.lobby?.seats[0].teamId, "team-a");
  assert.equal(snapshot.lobby?.seats[0].isViewer, true);
  assert.equal(snapshot.lobby?.seats.filter((seat) => seat.isAi).length, 9);

  const preview = lobbyApi.previewLobby(joinCode.toLowerCase());
  assert.equal(preview.sessionId, sessionId);
  assert.equal(preview.joinable, true);
  assert.equal(preview.humanCount, 1);
  assert.equal(preview.seats.length, 10);

  const summary = svc.getSessionSummary(sessionId);
  assert.equal(summary.isMultiplayer, true);
  assert.equal(summary.joinCode, joinCode);
  assert.equal(summary.participantCount, 1);
  assert.equal(summary.status, "lobby");
});

test("friends claim unique seats and the rest stay available for AI", () => {
  const created = svc.createLobby({
    modeId: "replay-2026",
    userTeamId: "team-a",
    displayName: "Host",
  });
  const sessionId = created.lobby.sessionId;
  const code = created.lobby.joinCode;

  const friend = lobbyApi.joinLobby({ code, teamId: "team-b", displayName: "Auction Shark" });
  assert.equal(friend.sessionId, sessionId);
  assert.equal(friend.teamId, "team-b");
  assert.equal(friend.isHost, false);

  expectAuctionError(
    () => lobbyApi.joinLobby({ code, teamId: "team-b", displayName: "Imposter" }),
    "SEAT_TAKEN",
  );

  const friendView = lobbyApi.getLobbySnapshot(sessionId, friend.token);
  assert.equal(friendView.lobby?.humanCount, 2);
  assert.equal(friendView.lobby?.aiCount, 8);
  assert.equal(friendView.lobby?.viewer.isHost, false);
  assert.equal(friendView.userTeam?.id, "team-b");
  assert.equal(friendView.userTeam?.managerName, "Auction Shark");
  assert.equal(friendView.userTeam?.isViewer, true);
  const seat = friendView.lobby?.seats.find((entry) => entry.teamId === "team-b");
  assert.equal(seat?.displayName, "Auction Shark");
  assert.equal(seat?.isViewer, true);
  assert.equal(seat?.isAi, false);

  const spectatorView = lobbyApi.getLobbySnapshot(sessionId, null);
  assert.equal(spectatorView.lobby?.viewer.canAct, false);
  assert.equal(spectatorView.userTeam, null);

  expectAuctionError(() => lobbyApi.joinLobby({ code: "ZZZZZZ", teamId: "team-c", displayName: "X" }), "ROOM_NOT_FOUND");
  expectAuctionError(() => lobbyApi.joinLobby({ code: "abc", teamId: "team-c", displayName: "X" }), "INVALID_CODE");
  expectAuctionError(
    () => lobbyApi.joinLobby({ code, teamId: "missing-team", displayName: "X" }),
    "TEAM_NOT_FOUND",
  );
});

test("chat is stored per room and empty messages are rejected", () => {
  const created = svc.createLobby({ modeId: "replay-2026", userTeamId: "team-a", displayName: "Host" });
  const sessionId = created.lobby.sessionId;
  const friend = lobbyApi.joinLobby({
    code: created.lobby.joinCode,
    teamId: "team-b",
    displayName: "Friend",
  });

  lobbyApi.postChat(sessionId, friend.token, "  Ready to overspend  ", "chat");
  lobbyApi.postChat(sessionId, created.lobby.token, "🔥", "emote");
  expectAuctionError(() => lobbyApi.postChat(sessionId, friend.token, "   "), "EMPTY_MESSAGE");

  const snapshot = lobbyApi.getLobbySnapshot(sessionId, friend.token);
  const chats = snapshot.lobby?.chat.filter((message) => message.kind !== "system") ?? [];
  assert.equal(chats.length, 2);
  assert.equal(chats[0].body, "Ready to overspend");
  assert.equal(chats[0].displayName, "Friend");
  assert.equal(chats[0].teamId, "team-b");
  assert.equal(chats[1].kind, "emote");
  assert.equal(chats[1].body, "🔥");
});

test("starting the room locks seats, opens lot one and marks unclaimed teams as AI", () => {
  const created = svc.createLobby({ modeId: "replay-2026", userTeamId: "team-a", displayName: "Host" });
  const sessionId = created.lobby.sessionId;
  const friend = lobbyApi.joinLobby({
    code: created.lobby.joinCode,
    teamId: "team-b",
    displayName: "Friend",
  });

  expectAuctionError(() => lobbyApi.startLobby(sessionId, friend.token), "HOST_ONLY");

  const started = lobbyApi.startLobby(sessionId, created.lobby.token);
  assert.equal(started.session.status, "active");
  assert.equal(started.lobby?.status, "live");
  assert.equal(started.currentLot?.lotNumber, 1);
  assert.equal(started.currentLot?.status, "live");
  assert.equal(started.session.completedLots, 0);
  assert.deepEqual(humanTeams(sessionId), ["team-a", "team-b"]);
  assert.equal(
    (fixture.db
      .prepare("SELECT COUNT(*) AS count FROM session_teams WHERE session_id = ? AND is_human = 0")
      .get(sessionId) as { count: number }).count,
    8,
  );

  expectAuctionError(
    () => lobbyApi.joinLobby({ code: created.lobby.joinCode, teamId: "team-c", displayName: "Late" }),
    "ROOM_STARTED",
  );
  expectAuctionError(() => lobbyApi.setReady(sessionId, friend.token, true), "ROOM_STARTED");
  expectAuctionError(() => lobbyApi.leaveLobby(sessionId, friend.token), "ROOM_STARTED");
});

test("a joiner bids from their own franchise, not the host seat", () => {
  const created = svc.createLobby({ modeId: "replay-2026", userTeamId: "team-a", displayName: "Host" });
  const sessionId = created.lobby.sessionId;
  const friend = lobbyApi.joinLobby({
    code: created.lobby.joinCode,
    teamId: "team-b",
    displayName: "Friend",
  });
  lobbyApi.startLobby(sessionId, created.lobby.token);

  const actingTeam = lobbyApi.resolveParticipantTeam(sessionId, friend.token);
  assert.equal(actingTeam, "team-b");
  assert.equal(lobbyApi.resolveParticipantTeam(sessionId, "not-a-real-token"), null);

  const afterBid = svc.actOnSession(
    sessionId,
    { type: "bid", amountLakh: 200 },
    actingTeam,
    actingTeam,
  );
  assert.equal(afterBid.currentLot?.leaderTeamId, "team-b");
  assert.equal(afterBid.currentLot?.leaderTeamName, "Test Team B");
  assert.equal(afterBid.userTeam?.id, "team-b");
  assert.equal(afterBid.teams.find((team) => team.id === "team-a")?.isHuman, true);

  const hostView = lobbyApi.getLobbySnapshot(sessionId, created.lobby.token);
  assert.equal(hostView.userTeam?.id, "team-a");
  assert.equal(hostView.currentLot?.leaderTeamId, "team-b");
  assert.equal(hostView.teams.find((team) => team.id === "team-b")?.managerName, "Friend");
});

test("the room heartbeat advances one tick window and respects pause", () => {
  const created = svc.createLobby({ modeId: "replay-2026", userTeamId: "team-a", displayName: "Host" });
  const sessionId = created.lobby.sessionId;
  const token = created.lobby.token;
  lobbyApi.startLobby(sessionId, token);

  const seq = () =>
    (fixture.db
      .prepare("SELECT tick_seq AS seq FROM auction_lobbies WHERE session_id = ?")
      .get(sessionId) as { seq: number }).seq;

  const before = seq();
  lobbyApi.lobbyHeartbeat(sessionId, token, { advance: true });
  const afterFirst = seq();
  assert.equal(afterFirst, before + 1);

  lobbyApi.lobbyHeartbeat(sessionId, token, { advance: true });
  assert.equal(seq(), afterFirst, "a second immediate poll must not double-advance");

  lobbyApi.updateLobbySettings(sessionId, token, { paused: true });
  fixture.db
    .prepare("UPDATE auction_lobbies SET last_tick_at = NULL WHERE session_id = ?")
    .run(sessionId);
  lobbyApi.lobbyHeartbeat(sessionId, token, { advance: true });
  assert.equal(seq(), afterFirst, "paused rooms ignore the heartbeat clock");

  const pausedView = lobbyApi.getLobbySnapshot(sessionId, token);
  assert.equal(pausedView.lobby?.paused, true);

  lobbyApi.updateLobbySettings(sessionId, token, { paused: false, tickMs: 5_000 });
  const resumeView = lobbyApi.getLobbySnapshot(sessionId, token);
  assert.equal(resumeView.lobby?.paused, false);
  assert.equal(resumeView.lobby?.tickMs, 5_000);

  expectAuctionError(
    () => lobbyApi.updateLobbySettings(sessionId, "unknown-token-value", { paused: true }),
    "SEAT_REQUIRED",
  );
});

test("leaving hands host controls to the longest-seated manager and empties seats for AI", () => {
  const created = svc.createLobby({ modeId: "replay-2026", userTeamId: "team-a", displayName: "Host" });
  const sessionId = created.lobby.sessionId;
  const friend = lobbyApi.joinLobby({
    code: created.lobby.joinCode,
    teamId: "team-b",
    displayName: "Friend",
  });
  const third = lobbyApi.joinLobby({
    code: created.lobby.joinCode,
    teamId: "team-c",
    displayName: "Third",
  });

  const result = lobbyApi.leaveLobby(sessionId, created.lobby.token);
  assert.equal(result.closed, false);

  const friendView = lobbyApi.getLobbySnapshot(sessionId, friend.token);
  assert.equal(friendView.lobby?.viewer.isHost, true);
  assert.equal(friendView.lobby?.humanCount, 2);
  assert.equal(friendView.lobby?.aiCount, 8);
  assert.equal(friendView.userTeam?.id, "team-b");
  const vacated = friendView.lobby?.seats.find((seat) => seat.teamId === "team-a");
  assert.equal(vacated?.isAi, true);

  assert.equal(lobbyApi.leaveLobby(sessionId, third.token).closed, false);
  const last = lobbyApi.leaveLobby(sessionId, friend.token);
  assert.equal(last.closed, true);
  assert.equal(svc.getSessionSnapshot(sessionId).session.status, "abandoned");
  assert.equal(svc.listSessionSummaries(100).some((row) => row.id === sessionId), false);
});

test("the host can remove a manager before the start but not after it", () => {
  const created = svc.createLobby({ modeId: "replay-2026", userTeamId: "team-a", displayName: "Host" });
  const sessionId = created.lobby.sessionId;
  const friend = lobbyApi.joinLobby({
    code: created.lobby.joinCode,
    teamId: "team-b",
    displayName: "Friend",
  });

  expectAuctionError(
    () => lobbyApi.kickParticipant(sessionId, friend.token, created.lobby.participantId),
    "HOST_ONLY",
  );
  expectAuctionError(
    () => lobbyApi.kickParticipant(sessionId, created.lobby.token, created.lobby.participantId),
    "CANNOT_KICK_HOST",
  );

  lobbyApi.kickParticipant(sessionId, created.lobby.token, friend.participantId);
  assert.equal(lobbyApi.getLobbySnapshot(sessionId, created.lobby.token).lobby?.humanCount, 1);
  assert.deepEqual(humanTeams(sessionId), ["team-a"]);
  assert.equal(lobbyApi.getLobbySnapshot(sessionId, friend.token).userTeam, null);
  assert.equal(lobbyApi.findParticipant(sessionId, friend.token), null);

  lobbyApi.joinLobby({ code: created.lobby.joinCode, teamId: "team-c", displayName: "Replacement" });
  lobbyApi.startLobby(sessionId, created.lobby.token);
  expectAuctionError(
    () => lobbyApi.kickParticipant(sessionId, created.lobby.token, "some-participant"),
    "ROOM_STARTED",
  );
});

test("every one of the ten franchises can be human with no AI seats left", () => {
  const created = svc.createLobby({ modeId: "replay-2026", userTeamId: "team-a", displayName: "Host" });
  const sessionId = created.lobby.sessionId;
  for (const teamId of TEAM_IDS.slice(1)) {
    lobbyApi.joinLobby({
      code: created.lobby.joinCode,
      teamId,
      displayName: `Manager ${teamId}`,
    });
  }
  const snapshot = lobbyApi.getLobbySnapshot(sessionId, created.lobby.token);
  assert.equal(snapshot.lobby?.humanCount, 10);
  assert.equal(snapshot.lobby?.aiCount, 0);
  assert.equal(snapshot.lobby?.seats.every((seat) => !seat.isAi), true);
});

test("a human seat goes to AI autopilot when the browser has been silent", async () => {
  const { isSeatAutopiloted, AUTOPILOT_AFTER_MS } = await import("../src/lib/auction/internal");
  const created = svc.createLobby({ modeId: "replay-2026", userTeamId: "team-a", displayName: "Host" });
  const sessionId = created.lobby.sessionId;
  const friend = lobbyApi.joinLobby({
    code: created.lobby.joinCode,
    teamId: "team-b",
    displayName: "Friend",
  });
  lobbyApi.startLobby(sessionId, created.lobby.token);

  assert.equal(isSeatAutopiloted(fixture.db, sessionId, "team-b"), false);
  const stale = new Date(Date.now() - AUTOPILOT_AFTER_MS - 5_000).toISOString();
  fixture.db
    .prepare("UPDATE auction_participants SET last_seen_at = ? WHERE session_id = ? AND team_id = ?")
    .run(stale, sessionId, friend.teamId);
  assert.equal(isSeatAutopiloted(fixture.db, sessionId, "team-b"), true);
  assert.equal(isSeatAutopiloted(fixture.db, sessionId, "team-a"), false, "a polling host is still live");
  assert.equal(
    isSeatAutopiloted(fixture.db, sessionId, "team-c"),
    true,
    "unclaimed teams are always AI",
  );
});

test("closing the lobby is host-only and ends the session", () => {
  const created = svc.createLobby({ modeId: "replay-2026", userTeamId: "team-a", displayName: "Host" });
  const sessionId = created.lobby.sessionId;
  const friend = lobbyApi.joinLobby({
    code: created.lobby.joinCode,
    teamId: "team-b",
    displayName: "Friend",
  });

  expectAuctionError(() => lobbyApi.closeLobby(sessionId, friend.token), "HOST_ONLY");
  lobbyApi.closeLobby(sessionId, created.lobby.token);
  assert.equal(svc.getSessionSnapshot(sessionId).session.status, "abandoned");
  assert.equal(lobbyApi.lobbyExists(sessionId), true);
  const closed = lobbyApi.getLobbySnapshot(sessionId, created.lobby.token);
  assert.equal(closed.lobby?.status, "closed");
  expectAuctionError(
    () => lobbyApi.startLobby(sessionId, created.lobby.token),
    "ROOM_STARTED",
  );
});
