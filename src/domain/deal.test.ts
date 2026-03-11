import test from "node:test";
import assert from "node:assert/strict";

import { createStandardDeck } from "./cards.js";
import { getDealOrder, prepareFinalFiveDeal } from "./deal.js";
import { createRoundSetup, recordDealerDrawRound } from "./round.js";
import { createRoom, joinRoom } from "./room.js";

function createFilledRoom(roomId: string, playerCount: number) {
  let room = createRoom(roomId);
  for (let index = 1; index <= playerCount; index += 1) {
    room = joinRoom(room, `p${index}`);
  }

  return room;
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
  const dealt = prepareFinalFiveDeal(ready, createStandardDeck());

  assert.deepEqual(dealt.dealOrder, ["p2", "p3", "p4", "p5", "p1"]);
  assert.deepEqual(dealt.hands.p2, ["01_1", "01_2", "01_3", "01_4"]);
  assert.deepEqual(dealt.hands.p1, ["05_1", "05_2", "05_3", "05_4"]);
  assert.deepEqual(dealt.floorCards, ["06_1", "06_2", "06_3", "06_4", "07_1", "07_2", "07_3", "07_4"]);
  assert.deepEqual(dealt.drawPile.slice(0, 4), ["08_1", "08_2", "08_3", "08_4"]);
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
  const dealt = prepareFinalFiveDeal(ready, createStandardDeck(), 4);

  assert.deepEqual(dealt.hands.p2, ["02_1", "02_2", "02_3", "02_4"]);
  assert.deepEqual(dealt.floorCards.slice(0, 4), ["07_1", "07_2", "07_3", "07_4"]);
  assert.equal(dealt.drawPile.at(-1), "01_4");
});
