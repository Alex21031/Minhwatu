import test from "node:test";
import assert from "node:assert/strict";

import { createDealerDraw } from "./cards.js";
import {
  attachPendingGiveUpDeal,
  type DealerSelectionState,
  type GiveUpState,
  type RoundSetupState,
  createNextRoundSetup,
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

function withPendingDeal(state: GiveUpState): GiveUpState {
  return attachPendingGiveUpDeal(state, {
    cutIndex: 0,
    dealOrder: state.turnOrder.slice(1).concat(state.turnOrder[0] ?? ""),
    hands: Object.fromEntries(state.turnOrder.map((playerId, index) => [playerId, [`0${(index % 9) + 1}_1`, `0${(index % 9) + 1}_2`, `0${(index % 9) + 1}_3`, `0${(index % 9) + 1}_4`]])),
    hiddenFloorCards: ["10_1", "10_2", "10_3", "10_4", "11_1", "11_2", "11_3", "11_4"],
    drawPile: ["12_1", "12_2", "12_3", "12_4"],
    initialFloorTripleMonths: []
  });
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
  assert.equal(nextState.pendingDeal, null);
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

  const afterFirstGiveUp = declareGiveUp(withPendingDeal(selectionState), "p1", true);
  const pendingState = assertGiveUpState(afterFirstGiveUp);
  const ready = declareGiveUp(pendingState, "p2", true);

  assert.equal(ready.phase, "ready_to_play");
  assert.deepEqual(ready.activePlayerIds, ["p3", "p4", "p5", "p6", "p7"]);
  assert.deepEqual(ready.spectatorPlayerIds, ["p1", "p2"]);
  assert.deepEqual(
    ready.room.players.filter((player) => player.role === "spectating").map((player) => player.playerId),
    ["p1", "p2"]
  );
  assert.deepEqual(
    ready.predealtRound?.drawPile,
    ["12_1", "12_2", "01_1", "01_2", "01_3", "01_4", "02_1", "02_2", "02_3", "02_4", "12_3", "12_4"]
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

  const primed = withPendingDeal(selectionState);
  const afterP1 = assertGiveUpState(declareGiveUp(primed, "p1", false));
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

  const primed = withPendingDeal(selectionState);
  const afterP1 = assertGiveUpState(declareGiveUp(primed, "p1", false));
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

test("next-round setup restores spectators and starts directly from the provided dealer", () => {
  const room = createFilledRoom("room-next-round", 6);
  const initialSetup = createRoundSetup(room);
  const selectionState = assertGiveUpState(resolveDealerSelection(initialSetup, {
    draws: [
      createDealerDraw("p1", 1, 0),
      createDealerDraw("p2", 2, 0),
      createDealerDraw("p3", 3, 0),
      createDealerDraw("p4", 4, 0),
      createDealerDraw("p5", 5, 0),
      createDealerDraw("p6", 6, 0)
    ]
  }));
  const primed = withPendingDeal(selectionState);
  const afterP1 = assertGiveUpState(declareGiveUp(primed, "p1", false));
  const afterP2 = assertGiveUpState(declareGiveUp(afterP1, "p2", false));
  const afterP3 = assertGiveUpState(declareGiveUp(afterP2, "p3", false));
  const afterP4 = assertGiveUpState(declareGiveUp(afterP3, "p4", false));
  const ready = declareGiveUp(afterP4, "p5", true);

  assert.equal(ready.phase, "ready_to_play");
  const nextRound = createNextRoundSetup(ready.room, "p3");

  assert.equal(nextRound.phase, "waiting_for_giveups");
  assert.equal(nextRound.dealerId, "p3");
  assert.deepEqual(nextRound.turnOrder, ["p3", "p4", "p5", "p6", "p1", "p2"]);
  assert.ok(nextRound.room.players.every((player) => player.role === "waiting"));
  assert.equal(nextRound.pendingDeal, null);
});

test("give-up decisions are blocked until hands are dealt", () => {
  const room = createFilledRoom("room-needs-deal", 6);
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

  assert.throws(() => declareGiveUp(selectionState, "p1", false), /dealt hands first/);
});
