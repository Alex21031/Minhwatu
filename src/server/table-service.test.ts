import test from "node:test";
import assert from "node:assert/strict";

import { createDealerDraw } from "../domain/cards.js";
import type { InitialDealerRound } from "../domain/dealer.js";
import type { PlayState } from "../domain/play.js";
import { MultiplayerTableService } from "./table-service.js";

function createDeterministicDealerRoundFactory(rounds: InitialDealerRound[]) {
  let index = 0;

  return () => {
    const round = rounds[index];
    index += 1;

    if (round === undefined) {
      throw new Error("No more deterministic dealer rounds are available.");
    }

    return round;
  };
}

function createFivePlayerService(): MultiplayerTableService {
  const service = new MultiplayerTableService(
    undefined,
    createDeterministicDealerRoundFactory([
      {
        draws: [
          createDealerDraw("p1", 1, 20),
          createDealerDraw("p2", 2, 0),
          createDealerDraw("p3", 3, 0),
          createDealerDraw("p4", 4, 0),
          createDealerDraw("p5", 5, 0)
        ]
      }
    ])
  );

  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);
  service.setPlayerReady("p5", true);
  service.startRoundSetup("p1");
  service.autoResolveDealer("p1");

  return service;
}

function assertPlayState(snapshot: { playState: PlayState | null }): PlayState {
  const playState = snapshot.playState;
  if (playState === null) {
    throw new Error("Expected a synchronized play state.");
  }
  return playState;
}

function playCurrentTurn(service: MultiplayerTableService, playState: PlayState): PlayState {
  if (playState.phase !== "awaiting_hand_play" && playState.phase !== "awaiting_hand_choice") {
    throw new Error(`Expected a hand-step phase, received ${playState.phase}.`);
  }

  const hand = playState.hands[playState.currentPlayerId];
  const selectedCard = hand?.[0];
  if (selectedCard === undefined) {
    throw new Error(`Current player ${playState.currentPlayerId} has no hand card to play.`);
  }

  const afterSelect = assertPlayState(service.selectHandCard(playState.currentPlayerId, selectedCard));
  assert.equal(afterSelect.phase, "awaiting_hand_choice");

  const afterHandResolve = assertPlayState(
    service.resolveHandChoice(
      playState.currentPlayerId,
      afterSelect.matchingFloorCards[0] ?? null
    )
  );
  assert.equal(afterHandResolve.phase, "awaiting_draw_flip");

  const afterDrawFlip = assertPlayState(service.flipDrawCard(playState.currentPlayerId));
  assert.equal(afterDrawFlip.phase, "awaiting_draw_choice");

  return assertPlayState(
    service.resolveDrawChoice(
      playState.currentPlayerId,
      afterDrawFlip.matchingFloorCards[0] ?? null
    )
  );
}

test("startRoundSetup creates a synchronized dealer-selection state for the player's room", () => {
  const service = new MultiplayerTableService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);
  service.setPlayerReady("p5", true);

  const snapshot = service.startRoundSetup("p1");

  assert.equal(snapshot.setupState?.phase, "selecting_initial_dealer");
  assert.equal(snapshot.room.roomId, "alpha");
  assert.equal(snapshot.actionLog[0], "Round setup started with 5 entrants.");
});

test("autoResolveDealer moves a 6-player room into the synchronized give-up phase with dealt hands", () => {
  const service = new MultiplayerTableService(
    undefined,
    createDeterministicDealerRoundFactory([
      {
        draws: [
          createDealerDraw("p1", 1, 20),
          createDealerDraw("p2", 2, 0),
          createDealerDraw("p3", 3, 0),
          createDealerDraw("p4", 4, 0),
          createDealerDraw("p5", 5, 0),
          createDealerDraw("p6", 6, 0)
        ]
      }
    ])
  );

  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.joinExistingRoom("p6", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);
  service.setPlayerReady("p5", true);
  service.setPlayerReady("p6", true);
  service.startRoundSetup("p1");

  const snapshot = service.autoResolveDealer("p1");

  assert.equal(snapshot.setupState?.phase, "waiting_for_giveups");
  assert.equal(snapshot.setupState?.dealerId, "p1");
  assert.notEqual(snapshot.setupState?.pendingDeal, null);
});

test("declareGiveUp advances the synchronized room setup for the current chooser", () => {
  const service = new MultiplayerTableService(
    undefined,
    createDeterministicDealerRoundFactory([
      {
        draws: [
          createDealerDraw("p1", 1, 20),
          createDealerDraw("p2", 2, 0),
          createDealerDraw("p3", 3, 0),
          createDealerDraw("p4", 4, 0),
          createDealerDraw("p5", 5, 0),
          createDealerDraw("p6", 6, 0)
        ]
      }
    ])
  );

  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.joinExistingRoom("p6", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);
  service.setPlayerReady("p5", true);
  service.setPlayerReady("p6", true);
  service.startRoundSetup("p1");
  service.autoResolveDealer("p1");

  const snapshot = service.declareGiveUp("p1", false);

  assert.equal(snapshot.setupState?.phase, "waiting_for_giveups");
  assert.equal(snapshot.setupState?.currentPlayerId, "p2");
  assert.equal(snapshot.setupState?.decisions.p1, "play");
});

test("startRoundSetup requires the host and all seated players to be ready", () => {
  const service = new MultiplayerTableService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);

  assert.throws(() => service.startRoundSetup("p1"), /Every seated player must be ready/);

  service.setPlayerReady("p5", true);

  assert.throws(() => service.startRoundSetup("p2"), /Only the host can start/);
});

test("setPlayerReady updates the synchronized room snapshot", () => {
  const service = new MultiplayerTableService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");

  const snapshot = service.setPlayerReady("p2", true);

  assert.equal(snapshot.room.players.find((player) => player.playerId === "p2")?.isReady, true);
  assert.equal(snapshot.actionLog[0], "p2 marked ready.");
});

test("setPlayerDisplayName updates the synchronized room snapshot", () => {
  const service = new MultiplayerTableService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");

  const snapshot = service.setPlayerDisplayName("p2", "Alex");

  assert.equal(snapshot.room.players.find((player) => player.playerId === "p2")?.displayName, "Alex");
  assert.equal(snapshot.actionLog[0], "p2 updated their display name to Alex.");
});

test("transferHost updates the synchronized room snapshot", () => {
  const service = new MultiplayerTableService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");

  const snapshot = service.transferHost("p1", "p2");

  assert.equal(snapshot.room.hostPlayerId, "p2");
  assert.equal(snapshot.actionLog[0], "p1 transferred host rights to p2.");
});

test("kickPlayer removes the target player and resets synchronized progress back to idle roles", () => {
  const service = new MultiplayerTableService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.joinExistingRoom("p6", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);
  service.setPlayerReady("p5", true);
  service.setPlayerReady("p6", true);
  service.startRoundSetup("p1");
  const giveUpSnapshot = service.autoResolveDealer("p1");
  if (giveUpSnapshot.setupState?.phase !== "waiting_for_giveups") {
    throw new Error("Expected the synchronized give-up phase.");
  }

  const chooserId = giveUpSnapshot.setupState.currentPlayerId;

  service.declareGiveUp(chooserId, true);

  const kickedPlayerId = chooserId === "p6" ? "p5" : "p6";

  const snapshot = service.kickPlayer("p1", kickedPlayerId);

  assert.equal(snapshot.room.players.some((player) => player.playerId === kickedPlayerId), false);
  assert.equal(snapshot.setupState, null);
  assert.equal(snapshot.playState, null);
  assert.equal(snapshot.actionLog[0], `p1 kicked ${kickedPlayerId} from room alpha.`);
  assert.equal(snapshot.actionLog[1], "Room roster changed. Setup and play progress were reset.");
  assert.ok(snapshot.room.players.every((player) => player.role === "waiting"));
  assert.equal(snapshot.room.players.find((player) => player.playerId === chooserId)?.role, "waiting");
});

test("joinExistingRoom is blocked while synchronized setup is active", () => {
  const service = new MultiplayerTableService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);
  service.setPlayerReady("p5", true);
  service.startRoundSetup("p1");

  assert.throws(
    () => service.joinExistingRoom("p6", "alpha"),
    /Room is in progress\. New players can join only after the current round returns to idle\./
  );
});

test("createRoom is blocked while the current room is in an active synchronized round", () => {
  const service = new MultiplayerTableService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);
  service.setPlayerReady("p5", true);
  service.startRoundSetup("p1");

  assert.throws(
    () => service.createRoom("p1", "beta"),
    /Cannot leave or switch rooms while a synchronized round is active\./
  );
});

test("joinExistingRoom is blocked while synchronized play is active", () => {
  const service = createFivePlayerService();
  service.dealCards("p1");

  assert.throws(
    () => service.joinExistingRoom("p6", "alpha"),
    /Room is in progress\. New players can join only after the current round returns to idle\./
  );
});

test("joinExistingRoom is blocked when the player tries to switch away from an active synchronized room", () => {
  const service = createFivePlayerService();
  service.createRoom("p6", "beta");
  service.dealCards("p1");

  assert.throws(
    () => service.joinExistingRoom("p1", "beta"),
    /Cannot leave or switch rooms while a synchronized round is active\./
  );
});

test("leaveCurrentRoom is blocked while synchronized setup is active", () => {
  const service = new MultiplayerTableService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);
  service.setPlayerReady("p5", true);
  service.startRoundSetup("p1");

  assert.throws(
    () => service.leaveCurrentRoom("p3"),
    /Cannot leave or switch rooms while a synchronized round is active\./
  );
});

test("leaveCurrentRoom is blocked while synchronized play is active", () => {
  const service = createFivePlayerService();
  service.dealCards("p1");

  assert.throws(
    () => service.leaveCurrentRoom("p3"),
    /Cannot leave or switch rooms while a synchronized round is active\./
  );
});

test("startRoundSetup is blocked while a seated player is disconnected", () => {
  const service = new MultiplayerTableService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);
  service.setPlayerReady("p5", true);
  service.setPlayerConnected("p5", false);

  assert.throws(() => service.startRoundSetup("p1"), /must be connected before the host can start/);
});

test("setPlayerConnected updates the synchronized room snapshot", () => {
  const service = new MultiplayerTableService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");

  const snapshot = service.setPlayerConnected("p2", false);

  assert.notEqual(snapshot, null);
  assert.equal(snapshot?.room.players.find((player) => player.playerId === "p2")?.isConnected, false);
  assert.equal(snapshot?.actionLog[0], "p2 is now disconnected.");
});

test("dealCards promotes a ready room into a synchronized play state", () => {
  const service = createFivePlayerService();

  const snapshot = service.dealCards("p1");

  assert.equal(snapshot.setupState, null);
  assert.equal(snapshot.playState?.phase, "awaiting_hand_play");
  assert.equal(snapshot.playState?.activePlayerIds.length, 5);
  assert.equal(snapshot.playState?.floorCards.length, 8);
});

test("synchronized play actions progress a full turn on the server-authoritative table", () => {
  const service = createFivePlayerService();
  const dealtSnapshot = service.dealCards("p1");
  const playState = assertPlayState(dealtSnapshot);
  assert.equal(playState.phase, "awaiting_hand_play");
  const currentPlayerId = playState.currentPlayerId;

  const afterTurn = playCurrentTurn(service, playState);

  assert.notEqual(afterTurn.phase, "awaiting_draw_flip");
  assert.notEqual(afterTurn.phase, "awaiting_draw_choice");
  if (afterTurn.phase === "completed") {
    assert.ok(afterTurn.completedTurns >= 1);
  } else {
    assert.equal(afterTurn.phase, "awaiting_hand_play");
    assert.notEqual(afterTurn.currentPlayerId, currentPlayerId);
    assert.equal(afterTurn.completedTurns, 1);
  }

  const updatedSnapshot = service.getSnapshotForPlayer(currentPlayerId);
  if (updatedSnapshot === null) {
    throw new Error("Expected an updated synchronized snapshot.");
  }

  assert.ok(
    updatedSnapshot.actionLog.some(
      (entry) => entry.includes("selected") || entry.includes("captured") || entry.includes("discarded")
    )
  );
  assert.ok(updatedSnapshot.actionLog.some((entry) => entry.includes("flipped")));
});

test("prepareNextRound hands a completed synchronized round back to setup flow", () => {
  const service = createFivePlayerService();
  let playState = assertPlayState(service.dealCards("p1"));

  while (playState.phase !== "completed") {
    playState = playCurrentTurn(service, playState);
  }

  const nextSnapshot = service.prepareNextRound("p1");

  assert.equal(nextSnapshot.playState, null);
  assert.notEqual(nextSnapshot.setupState, null);
  assert.equal(nextSnapshot.room.roomId, "alpha");
  assert.ok(
    nextSnapshot.setupState?.phase === "ready_to_play" ||
      nextSnapshot.setupState?.phase === "waiting_for_giveups"
  );
  assert.equal(nextSnapshot.actionLog[0], `Next round prepared. Dealer: ${nextSnapshot.setupState?.dealerId}.`);
});

test("forced active-room leave resets remaining players back to idle roles", () => {
  const service = createFivePlayerService();
  service.dealCards("p1");

  const result = service.leaveCurrentRoom("p5", {
    allowActiveRoundReset: true
  });

  assert.equal(result.roomId, "alpha");
  assert.notEqual(result.snapshot, null);
  assert.equal(result.snapshot?.playState, null);
  assert.equal(result.snapshot?.setupState, null);
  assert.equal(result.snapshot?.room.players.some((player) => player.playerId === "p5"), false);
  assert.ok(result.snapshot?.room.players.every((player) => player.role === "waiting"));
  assert.equal(result.snapshot?.actionLog[0], "p5 left room alpha.");
  assert.equal(result.snapshot?.actionLog[1], "Room roster changed. Setup and play progress were reset.");
});
