import test from "node:test";
import assert from "node:assert/strict";

import { createPlayState, flipDrawCard, playTurn, resolveDrawChoice, resolveHandChoice, selectHandCard } from "./play.js";
import { type DealtRoundState } from "./deal.js";

function createDealtState(overrides: Partial<DealtRoundState> = {}): DealtRoundState {
  return {
    phase: "dealt",
    room: {
      roomId: "room",
      hostPlayerId: "p1",
      players: []
    },
    dealerId: "p1",
    turnOrder: ["p1", "p2", "p3", "p4", "p5"],
    activePlayerIds: ["p1", "p2", "p3", "p4", "p5"],
    spectatorPlayerIds: [],
    predealtRound: null,
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
    initialFloorTripleMonths: [],
    drawPile: ["07_2", "08_1"],
    ...overrides
  };
}

test("playTurn captures a matching floor card from hand and draw steps", () => {
  const state = createPlayState(createDealtState());
  const next = playTurn(state, "01_1");

  assert.equal(next.phase, "awaiting_hand_play");
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

  assert.equal(next.phase, "awaiting_hand_play");
  assert.deepEqual(next.capturedByPlayer.p1, []);
  assert.deepEqual(next.floorCards, ["01_2", "09_1", "07_2"]);
  assert.equal(next.currentPlayerId, "p2");
});

test("the player cannot discard a hand card when a matching floor card exists", () => {
  const state = createPlayState(
    createDealtState({
      hands: {
        p1: ["01_1"],
        p2: ["02_1"],
        p3: ["03_1"],
        p4: ["04_1"],
        p5: ["05_1"]
      },
      floorCards: ["01_2", "01_3", "07_1"],
      drawPile: ["08_1", "09_1"]
    })
  );

  const choiceState = selectHandCard(state, "01_1");
  assert.equal(choiceState.phase, "awaiting_hand_choice");
  assert.deepEqual(choiceState.matchingFloorCards, ["01_2", "01_3"]);

  assert.throws(() => resolveHandChoice(choiceState, null), /must capture a matching floor card/);
});

test("the player can change the selected hand card before confirming the hand step", () => {
  const state = createPlayState(
    createDealtState({
      hands: {
        p1: ["01_1", "09_1"],
        p2: ["02_1"],
        p3: ["03_1"],
        p4: ["04_1"],
        p5: ["05_1"]
      },
      floorCards: ["01_2", "07_1"],
      drawPile: ["08_1", "09_2"]
    })
  );

  const firstChoice = selectHandCard(state, "01_1");
  const changedChoice = selectHandCard(firstChoice, "09_1");

  assert.equal(changedChoice.phase, "awaiting_hand_choice");
  assert.equal(changedChoice.pendingHandCard, "09_1");
  assert.deepEqual(changedChoice.matchingFloorCards, []);
});

test("the player can choose which floor card to capture after flipping the draw card", () => {
  const state = createPlayState(
    createDealtState({
      hands: {
        p1: ["09_1"],
        p2: ["02_1"],
        p3: ["03_1"],
        p4: ["04_1"],
        p5: ["05_1"]
      },
      floorCards: ["07_1", "07_3", "11_1"],
      drawPile: ["07_2", "08_1"]
    })
  );

  const handChoiceState = selectHandCard(state, "09_1");
  const afterHand = resolveHandChoice(handChoiceState, null);
  const drawChoiceState = flipDrawCard(afterHand);

  assert.equal(drawChoiceState.phase, "awaiting_draw_choice");
  assert.equal(drawChoiceState.revealedDrawCard, "07_2");
  assert.deepEqual(drawChoiceState.matchingFloorCards, ["07_1", "07_3"]);

  const next = resolveDrawChoice(drawChoiceState, "07_3");

  assert.equal(next.phase, "awaiting_hand_play");
  assert.deepEqual(next.capturedByPlayer.p1, ["07_2", "07_3"]);
  assert.deepEqual(next.floorCards, ["07_1", "11_1", "09_1"]);
  assert.equal(next.currentPlayerId, "p2");
});

test("the player cannot discard a revealed draw card when a matching floor card exists", () => {
  const state = createPlayState(
    createDealtState({
      hands: {
        p1: ["09_1"],
        p2: ["02_1"],
        p3: ["03_1"],
        p4: ["04_1"],
        p5: ["05_1"]
      },
      floorCards: ["07_1", "07_3", "11_1"],
      drawPile: ["07_2", "08_1"]
    })
  );

  const handChoiceState = selectHandCard(state, "09_1");
  const afterHand = resolveHandChoice(handChoiceState, null);
  const drawChoiceState = flipDrawCard(afterHand);

  assert.throws(() => resolveDrawChoice(drawChoiceState, null), /must capture a matching floor card/);
});

test("the fourth hand card captures all three cards from an initial floor triple", () => {
  const state = createPlayState(
    createDealtState({
      hands: {
        p1: ["04_4"],
        p2: ["02_1"],
        p3: ["03_1"],
        p4: ["04_1"],
        p5: ["05_1"]
      },
      floorCards: ["04_1", "04_2", "04_3", "11_1"],
      initialFloorTripleMonths: [4],
      drawPile: ["08_1", "09_1"]
    })
  );

  const choiceState = selectHandCard(state, "04_4");
  const next = resolveHandChoice(choiceState, "04_2");

  assert.equal(next.phase, "awaiting_draw_flip");
  assert.deepEqual(next.capturedByPlayer.p1, ["04_4", "04_1", "04_2", "04_3"]);
  assert.deepEqual(next.floorCards, ["11_1"]);
});

test("the fourth drawn card captures all three cards from an initial floor triple", () => {
  const state = createPlayState(
    createDealtState({
      hands: {
        p1: ["09_1"],
        p2: ["02_1"],
        p3: ["03_1"],
        p4: ["04_1"],
        p5: ["05_1"]
      },
      floorCards: ["06_1", "06_2", "06_3", "11_1"],
      initialFloorTripleMonths: [6],
      drawPile: ["06_4", "08_1"]
    })
  );

  const handChoiceState = selectHandCard(state, "09_1");
  const afterHand = resolveHandChoice(handChoiceState, null);
  const drawChoiceState = flipDrawCard(afterHand);
  const next = resolveDrawChoice(drawChoiceState, "06_1");

  assert.equal(next.phase, "awaiting_hand_play");
  assert.deepEqual(next.capturedByPlayer.p1, ["06_4", "06_1", "06_2", "06_3"]);
  assert.deepEqual(next.floorCards, ["11_1", "09_1"]);
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
