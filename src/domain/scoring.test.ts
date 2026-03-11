import test from "node:test";
import assert from "node:assert/strict";

import { scoreRound, summarizeCapturedCards } from "./scoring.js";

test("summarizeCapturedCards returns category counts, base score, and yak months", () => {
  const summary = summarizeCapturedCards(["01_1", "02_1", "01_3", "04_2", "12_1", "12_2", "12_3", "12_4"]);

  assert.deepEqual(summary.counts, {
    gwang: 2,
    yeolkkeut: 1,
    tti: 1,
    pi: 4
  });
  assert.equal(summary.baseCardScore, 55);
  assert.deepEqual(summary.yakMonths, [12]);
});

test("scoreRound applies entry fee and stacked yak adjustments", () => {
  const result = scoreRound(
    {
      p1: ["01_1", "01_2", "01_3", "01_4", "02_1", "03_3"],
      p2: ["02_2", "02_3", "02_4", "08_1", "08_2"],
      p3: ["04_1"],
      p4: ["05_1"],
      p5: ["06_1"]
    },
    ["p1", "p2", "p3", "p4", "p5"]
  );

  assert.equal(result.status, "scored");
  const p1 = result.players.find((player) => player.playerId === "p1");
  const p2 = result.players.find((player) => player.playerId === "p2");
  const p3 = result.players.find((player) => player.playerId === "p3");

  assert.ok(p1);
  assert.ok(p2);
  assert.ok(p3);

  assert.deepEqual(p1.yakMonths, [1]);
  assert.equal(p1.finalScore, 390);
  assert.equal(p1.amountWon, 39000);

  assert.deepEqual(p2.yakMonths, []);
  assert.equal(p2.finalScore, -115);
  assert.equal(p2.amountWon, -11500);

  assert.equal(p3.finalScore, -140);
  assert.equal(p3.amountWon, -14000);
});

test("scoreRound resets the round when three or more players complete yak", () => {
  const result = scoreRound(
    {
      p1: ["01_1", "01_2", "01_3", "01_4"],
      p2: ["02_1", "02_2", "02_3", "02_4"],
      p3: ["03_1", "03_2", "03_3", "03_4"],
      p4: [],
      p5: []
    },
    ["p1", "p2", "p3", "p4", "p5"]
  );

  assert.equal(result.status, "reset");
  assert.deepEqual(result.yakOwnerIds, ["p1", "p2", "p3"]);
  assert.ok(result.players.every((player) => player.finalScore === 0));
});
