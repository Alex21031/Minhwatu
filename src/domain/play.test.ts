import test from "node:test";
import assert from "node:assert/strict";

import { createPlayState, playTurn } from "./play.js";
import { type DealtRoundState } from "./deal.js";

function createDealtState(overrides: Partial<DealtRoundState> = {}): DealtRoundState {
  return {
    phase: "dealt",
    room: {
      roomId: "room",
      players: []
    },
    dealerId: "p1",
    turnOrder: ["p1", "p2", "p3", "p4", "p5"],
    activePlayerIds: ["p1", "p2", "p3", "p4", "p5"],
    spectatorPlayerIds: [],
    cutIndex: 0,
    dealOrder: ["p2", "p3", "p4", "p5", "p1"],
    hands: {
      p1: ["01_1"],
      p2: ["02_1"],
      p3: ["03_1"],
      p4: ["04_1"],
      p5: ["05_1"]
    },
    floorCards: ["01_2", "07_1"],
    drawPile: ["07_2", "08_1"],
    ...overrides
  };
}

test("playTurn captures a matching floor card from hand and draw steps", () => {
  const state = createPlayState(createDealtState());
  const next = playTurn(state, "01_1");

  assert.equal(next.phase, "playing");
  assert.deepEqual(next.capturedByPlayer.p1, ["01_1", "01_2", "07_2", "07_1"]);
  assert.deepEqual(next.floorCards, []);
  assert.deepEqual(next.hands.p1, []);
  assert.equal(next.currentPlayerId, "p2");
});

test("playTurn leaves cards on the floor when there is no month match", () => {
  const state = createPlayState(
    createDealtState({
      hands: {
        p1: ["09_1"],
        p2: ["02_1"],
        p3: ["03_1"],
        p4: ["04_1"],
        p5: ["05_1"]
      },
      floorCards: ["01_2"],
      drawPile: ["07_2", "08_1"]
    })
  );

  const next = playTurn(state, "09_1");

  assert.equal(next.phase, "playing");
  assert.deepEqual(next.capturedByPlayer.p1, []);
  assert.deepEqual(next.floorCards, ["01_2", "09_1", "07_2"]);
  assert.equal(next.currentPlayerId, "p2");
});

test("playTurn completes the round when all hands and the draw pile are exhausted", () => {
  const state = createPlayState(
    createDealtState({
      hands: {
        p1: ["01_1"],
        p2: [],
        p3: [],
        p4: [],
        p5: []
      },
      floorCards: ["01_2"],
      drawPile: ["07_2"]
    })
  );

  const next = playTurn(state, "01_1");

  assert.equal(next.phase, "completed");
  assert.deepEqual(next.capturedByPlayer.p1, ["01_1", "01_2"]);
  assert.deepEqual(next.floorCards, ["07_2"]);
});
