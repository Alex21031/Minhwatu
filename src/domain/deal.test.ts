import test from "node:test";
import assert from "node:assert/strict";

import { createStandardDeck, type CardId } from "./cards.js";
import {
  DealResetRequiredError,
  getDealOrder,
  prepareFinalFiveDeal,
  prepareFinalFiveDealWithRedeal,
  prepareGiveUpDeal
} from "./deal.js";
import { createRoundSetup, recordDealerDrawRound } from "./round.js";
import { createRoom, joinRoom } from "./room.js";

function createFilledRoom(roomId: string, playerCount: number) {
  let room = createRoom(roomId);
  for (let index = 1; index <= playerCount; index += 1) {
    room = joinRoom(room, `p${index}`);
  }

  return room;
}

function buildDeckWithPrefix(prefix: readonly CardId[]): CardId[] {
  const excluded = new Set(prefix);
  const suffix = createStandardDeck().filter((cardId) => !excluded.has(cardId));
  return [...prefix, ...suffix];
}

function createValidDealDeck(): CardId[] {
  return buildDeckWithPrefix([
    "01_1", "02_1", "03_1", "04_1",
    "05_1", "06_1", "07_1", "08_1",
    "09_1", "10_1", "11_1", "12_1",
    "01_2", "02_2", "03_2", "04_2",
    "05_2", "06_2", "07_2", "08_2",
    "09_2", "10_2", "11_2", "12_2",
    "01_3", "02_3", "03_3", "04_3"
  ]);
}

function createFloorResetDeck(): CardId[] {
  return buildDeckWithPrefix([
    "01_1", "02_1", "03_1", "04_1",
    "05_1", "06_1", "07_1", "08_1",
    "09_1", "10_1", "12_1", "01_2",
    "02_2", "03_2", "04_2", "05_2",
    "06_2", "07_2", "08_2", "09_2",
    "11_1", "11_2", "11_3", "11_4",
    "10_2", "12_2", "01_3", "02_3"
  ]);
}

function createInitialFloorTripleDeck(): CardId[] {
  return buildDeckWithPrefix([
    "01_1", "02_1", "03_1", "04_1",
    "05_1", "06_1", "07_1", "08_1",
    "09_1", "10_1", "11_1", "12_1",
    "01_2", "02_2", "04_2", "05_2",
    "06_2", "07_2", "08_2", "09_2",
    "03_2", "03_3", "03_4", "10_2",
    "11_2", "12_2", "01_3", "02_3"
  ]);
}

test("getDealOrder starts with the player to the dealer's right and ends with the dealer", () => {
  assert.deepEqual(getDealOrder(["p1", "p2", "p3", "p4", "p5"]), ["p2", "p3", "p4", "p5", "p1"]);
});

test("prepareFinalFiveDeal deals 4 cards to each player, 8 to the floor, and 20 to the draw pile", () => {
  const room = createFilledRoom("deal-room", 5);
  const setup = createRoundSetup(room);
  const ready = recordDealerDrawRound(setup, {
    draws: [
      { playerId: "p1", month: 1, score: 0 },
      { playerId: "p2", month: 2, score: 0 },
      { playerId: "p3", month: 3, score: 0 },
      { playerId: "p4", month: 4, score: 0 },
      { playerId: "p5", month: 5, score: 0 }
    ]
  });

  assert.equal(ready.phase, "ready_to_play");
  const dealt = prepareFinalFiveDeal(ready, createValidDealDeck());

  assert.deepEqual(dealt.dealOrder, ["p2", "p3", "p4", "p5", "p1"]);
  assert.deepEqual(dealt.hands.p2, ["01_1", "02_1", "03_1", "04_1"]);
  assert.deepEqual(dealt.hands.p1, ["05_2", "06_2", "07_2", "08_2"]);
  assert.deepEqual(dealt.floorCards, ["09_2", "10_2", "11_2", "12_2", "01_3", "02_3", "03_3", "04_3"]);
  assert.deepEqual(dealt.drawPile.slice(0, 4), ["01_4", "02_4", "03_4", "04_4"]);
  assert.equal(dealt.drawPile.length, 20);
});

test("prepareFinalFiveDeal respects the cut index before dealing", () => {
  const room = createFilledRoom("deal-room-cut", 5);
  const setup = createRoundSetup(room);
  const ready = recordDealerDrawRound(setup, {
    draws: [
      { playerId: "p1", month: 1, score: 0 },
      { playerId: "p2", month: 2, score: 0 },
      { playerId: "p3", month: 3, score: 0 },
      { playerId: "p4", month: 4, score: 0 },
      { playerId: "p5", month: 5, score: 0 }
    ]
  });

  assert.equal(ready.phase, "ready_to_play");
  const dealt = prepareFinalFiveDeal(ready, createValidDealDeck(), 4);

  assert.deepEqual(dealt.hands.p2, ["05_1", "06_1", "07_1", "08_1"]);
  assert.deepEqual(dealt.floorCards.slice(0, 4), ["01_3", "02_3", "03_3", "04_3"]);
  assert.equal(dealt.drawPile.at(-1), "04_1");
});

test("prepareFinalFiveDeal records months that start as a floor triple", () => {
  const room = createFilledRoom("deal-room-floor-triple", 5);
  const setup = createRoundSetup(room);
  const ready = recordDealerDrawRound(setup, {
    draws: [
      { playerId: "p1", month: 1, score: 0 },
      { playerId: "p2", month: 2, score: 0 },
      { playerId: "p3", month: 3, score: 0 },
      { playerId: "p4", month: 4, score: 0 },
      { playerId: "p5", month: 5, score: 0 }
    ]
  });

  assert.equal(ready.phase, "ready_to_play");
  const dealt = prepareFinalFiveDeal(ready, createInitialFloorTripleDeck());

  assert.deepEqual(dealt.floorCards, ["03_2", "03_3", "03_4", "10_2", "11_2", "12_2", "01_3", "02_3"]);
  assert.deepEqual(dealt.initialFloorTripleMonths, [3]);
});

test("prepareGiveUpDeal deals hands to all entrants and keeps the floor hidden for 6-player and 7-player rooms", () => {
  const room = createFilledRoom("deal-room-giveup", 6);
  const setup = createRoundSetup(room);
  const selectionState = recordDealerDrawRound(setup, {
    draws: [
      { playerId: "p1", month: 1, score: 0 },
      { playerId: "p2", month: 2, score: 0 },
      { playerId: "p3", month: 3, score: 0 },
      { playerId: "p4", month: 4, score: 0 },
      { playerId: "p5", month: 5, score: 0 },
      { playerId: "p6", month: 6, score: 0 }
    ]
  });

  assert.equal(selectionState.phase, "waiting_for_giveups");
  const pendingDeal = prepareGiveUpDeal(selectionState, buildDeckWithPrefix([
    "01_1", "02_1", "03_1", "04_1",
    "05_1", "06_1", "07_1", "08_1",
    "09_1", "10_1", "11_1", "12_1",
    "01_2", "02_2", "03_2", "04_2",
    "05_2", "06_2", "07_2", "08_2",
    "09_2", "10_2", "11_2", "12_2",
    "01_3", "02_3", "03_3", "04_3",
    "05_3", "06_3", "07_3", "08_3"
  ]));

  assert.equal(Object.keys(pendingDeal.hands).length, 6);
  assert.equal(pendingDeal.hiddenFloorCards.length, 8);
  assert.equal(pendingDeal.drawPile.length, 16);
});

test("prepareFinalFiveDeal resets when a player's hand has all four cards of one month", () => {
  const room = createFilledRoom("deal-room-reset-hand", 5);
  const setup = createRoundSetup(room);
  const ready = recordDealerDrawRound(setup, {
    draws: [
      { playerId: "p1", month: 1, score: 0 },
      { playerId: "p2", month: 2, score: 0 },
      { playerId: "p3", month: 3, score: 0 },
      { playerId: "p4", month: 4, score: 0 },
      { playerId: "p5", month: 5, score: 0 }
    ]
  });

  assert.equal(ready.phase, "ready_to_play");
  assert.throws(
    () => prepareFinalFiveDeal(ready, createStandardDeck()),
    (error: unknown) =>
      error instanceof DealResetRequiredError &&
      error.reason.location === "hand" &&
      error.reason.playerId === "p2" &&
      error.reason.month === 1
  );
});

test("prepareFinalFiveDeal resets when the floor has all four cards of one month", () => {
  const room = createFilledRoom("deal-room-reset-floor", 5);
  const setup = createRoundSetup(room);
  const ready = recordDealerDrawRound(setup, {
    draws: [
      { playerId: "p1", month: 1, score: 0 },
      { playerId: "p2", month: 2, score: 0 },
      { playerId: "p3", month: 3, score: 0 },
      { playerId: "p4", month: 4, score: 0 },
      { playerId: "p5", month: 5, score: 0 }
    ]
  });

  assert.equal(ready.phase, "ready_to_play");
  assert.throws(
    () => prepareFinalFiveDeal(ready, createFloorResetDeck()),
    (error: unknown) =>
      error instanceof DealResetRequiredError &&
      error.reason.location === "floor" &&
      error.reason.month === 11
  );
});

test("prepareFinalFiveDealWithRedeal retries until the deal no longer contains a four-of-a-kind month", () => {
  const room = createFilledRoom("deal-room-reroll", 5);
  const setup = createRoundSetup(room);
  const ready = recordDealerDrawRound(setup, {
    draws: [
      { playerId: "p1", month: 1, score: 0 },
      { playerId: "p2", month: 2, score: 0 },
      { playerId: "p3", month: 3, score: 0 },
      { playerId: "p4", month: 4, score: 0 },
      { playerId: "p5", month: 5, score: 0 }
    ]
  });

  assert.equal(ready.phase, "ready_to_play");

  let attempt = 0;
  const dealt = prepareFinalFiveDealWithRedeal(ready, () => {
    attempt += 1;
    return attempt === 1 ? createStandardDeck() : createValidDealDeck();
  });

  assert.equal(dealt.redealCount, 1);
  assert.equal(dealt.hands.p2?.length, 4);
  assert.equal(dealt.floorCards.length, 8);
});
