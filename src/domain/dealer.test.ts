import test from "node:test";
import assert from "node:assert/strict";

import { createDealerDraw } from "./cards.js";
import { determineInitialDealer, determineNextDealer } from "./dealer.js";

test("determineInitialDealer selects the lowest month", () => {
  const result = determineInitialDealer([
    {
      draws: [
        createDealerDraw("a", 4, 0),
        createDealerDraw("b", 2, 0),
        createDealerDraw("c", 7, 20)
      ]
    }
  ]);

  assert.equal(result.dealerId, "b");
  assert.equal(result.roundsPlayed, 1);
});

test("determineInitialDealer breaks a same-month tie with the higher score", () => {
  const result = determineInitialDealer([
    {
      draws: [
        createDealerDraw("a", 1, 5),
        createDealerDraw("b", 1, 20),
        createDealerDraw("c", 6, 10)
      ]
    }
  ]);

  assert.equal(result.dealerId, "b");
  assert.deepEqual(result.winningDraw, createDealerDraw("b", 1, 20));
});

test("determineInitialDealer redraws only tied players when both month and score tie", () => {
  const result = determineInitialDealer([
    {
      draws: [
        createDealerDraw("a", 1, 20),
        createDealerDraw("b", 1, 20),
        createDealerDraw("c", 4, 0)
      ]
    },
    {
      draws: [
        createDealerDraw("a", 3, 5),
        createDealerDraw("b", 2, 10)
      ]
    }
  ]);

  assert.equal(result.dealerId, "b");
  assert.equal(result.roundsPlayed, 2);
});

test("determineNextDealer prefers the higher score and breaks ties by earlier order", () => {
  const winner = determineNextDealer([
    { playerId: "a", finalScore: 50, orderIndex: 2 },
    { playerId: "b", finalScore: 50, orderIndex: 1 },
    { playerId: "c", finalScore: 10, orderIndex: 0 }
  ]);

  assert.equal(winner.playerId, "b");
});
