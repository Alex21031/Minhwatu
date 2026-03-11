import test from "node:test";
import assert from "node:assert/strict";

import { createDealerDraw } from "./cards.js";
import {
  type DealerSelectionState,
  type GiveUpState,
  type RoundSetupState,
  createRoundSetup,
  declareGiveUp,
  recordDealerDrawRound
} from "./round.js";
import { createRoom, joinRoom, restoreSpectatorsForNextRound } from "./room.js";

function createFilledRoom(roomId: string, playerCount: number) {
  let room = createRoom(roomId);
  for (let index = 1; index <= playerCount; index += 1) {
    room = joinRoom(room, `p${index}`);
  }

  return room;
}

function assertGiveUpState(state: RoundSetupState): GiveUpState {
  assert.equal(state.phase, "waiting_for_giveups");
  return state;
}

function resolveDealerSelection(state: DealerSelectionState, draws: Parameters<typeof recordDealerDrawRound>[1]) {
  return recordDealerDrawRound(state, draws);
}

test("round setup with five players becomes ready-to-play after the dealer is resolved", () => {
  const room = createFilledRoom("room-5", 5);
  const state = createRoundSetup(room);
  const nextState = recordDealerDrawRound(state, {
    draws: [
      createDealerDraw("p1", 3, 0),
      createDealerDraw("p2", 2, 0),
      createDealerDraw("p3", 5, 0),
      createDealerDraw("p4", 6, 0),
      createDealerDraw("p5", 7, 0)
    ]
  });

  assert.equal(nextState.phase, "ready_to_play");
  assert.equal(nextState.dealerId, "p2");
  assert.deepEqual(nextState.activePlayerIds, ["p2", "p3", "p4", "p5", "p1"]);
  assert.deepEqual(nextState.spectatorPlayerIds, []);
});

test("round setup with seven players enters give-up phase in dealer-based turn order", () => {
  const room = createFilledRoom("room-7", 7);
  const state = createRoundSetup(room);
  const nextState = assertGiveUpState(resolveDealerSelection(state, {
    draws: [
      createDealerDraw("p1", 4, 0),
      createDealerDraw("p2", 3, 0),
      createDealerDraw("p3", 1, 20),
      createDealerDraw("p4", 5, 0),
      createDealerDraw("p5", 6, 0),
      createDealerDraw("p6", 7, 0),
      createDealerDraw("p7", 8, 0)
    ]
  }));

  assert.equal(nextState.dealerId, "p3");
  assert.deepEqual(nextState.turnOrder, ["p3", "p4", "p5", "p6", "p7", "p1", "p2"]);
  assert.deepEqual(nextState.decisionMakers, ["p3", "p4", "p5", "p6", "p7", "p1"]);
  assert.equal(nextState.mandatoryPlayerId, "p2");
  assert.equal(nextState.currentPlayerId, "p3");
});

test("give-up phase finalizes once enough players have given up", () => {
  const room = createFilledRoom("room-7b", 7);
  const state = createRoundSetup(room);
  const selectionState = assertGiveUpState(resolveDealerSelection(state, {
    draws: [
      createDealerDraw("p1", 1, 0),
      createDealerDraw("p2", 2, 0),
      createDealerDraw("p3", 3, 0),
      createDealerDraw("p4", 4, 0),
      createDealerDraw("p5", 5, 0),
      createDealerDraw("p6", 6, 0),
      createDealerDraw("p7", 7, 0)
    ]
  }));

  const afterFirstGiveUp = declareGiveUp(selectionState, "p1", true);
  const pendingState = assertGiveUpState(afterFirstGiveUp);
  const ready = declareGiveUp(pendingState, "p2", true);

  assert.equal(ready.phase, "ready_to_play");
  assert.deepEqual(ready.activePlayerIds, ["p3", "p4", "p5", "p6", "p7"]);
  assert.deepEqual(ready.spectatorPlayerIds, ["p1", "p2"]);
  assert.deepEqual(
    ready.room.players.filter((player) => player.role === "spectating").map((player) => player.playerId),
    ["p1", "p2"]
  );
});

test("the last optional chooser is forced to give up when needed to lock five players", () => {
  const room = createFilledRoom("room-6", 6);
  const state = createRoundSetup(room);
  const selectionState = assertGiveUpState(resolveDealerSelection(state, {
    draws: [
      createDealerDraw("p1", 1, 0),
      createDealerDraw("p2", 2, 0),
      createDealerDraw("p3", 3, 0),
      createDealerDraw("p4", 4, 0),
      createDealerDraw("p5", 5, 0),
      createDealerDraw("p6", 6, 0)
    ]
  }));

  const afterP1 = assertGiveUpState(declareGiveUp(selectionState, "p1", false));
  const afterP2 = assertGiveUpState(declareGiveUp(afterP1, "p2", false));
  const afterP3 = assertGiveUpState(declareGiveUp(afterP2, "p3", false));
  const afterP4 = assertGiveUpState(declareGiveUp(afterP3, "p4", false));

  assert.throws(() => declareGiveUp(afterP4, "p5", false), /must give up/);

  const ready = declareGiveUp(afterP4, "p5", true);
  assert.equal(ready.phase, "ready_to_play");
  assert.deepEqual(ready.spectatorPlayerIds, ["p5"]);
  assert.deepEqual(ready.activePlayerIds, ["p1", "p2", "p3", "p4", "p6"]);
});

test("players return to waiting state after spectators are restored for the next round", () => {
  const room = createFilledRoom("room-reset", 6);
  const state = createRoundSetup(room);
  const selectionState = assertGiveUpState(resolveDealerSelection(state, {
    draws: [
      createDealerDraw("p1", 1, 0),
      createDealerDraw("p2", 2, 0),
      createDealerDraw("p3", 3, 0),
      createDealerDraw("p4", 4, 0),
      createDealerDraw("p5", 5, 0),
      createDealerDraw("p6", 6, 0)
    ]
  }));

  const afterP1 = assertGiveUpState(declareGiveUp(selectionState, "p1", false));
  const afterP2 = assertGiveUpState(declareGiveUp(afterP1, "p2", false));
  const afterP3 = assertGiveUpState(declareGiveUp(afterP2, "p3", false));
  const afterP4 = assertGiveUpState(declareGiveUp(afterP3, "p4", false));
  const ready = declareGiveUp(afterP4, "p5", true);

  assert.equal(ready.phase, "ready_to_play");
  const restored = restoreSpectatorsForNextRound(ready.room);
  assert.ok(restored.players.every((player) => player.role === "waiting"));
  assert.deepEqual(
    restored.players.map((player) => player.seatIndex),
    [0, 1, 2, 3, 4, 5]
  );
});
