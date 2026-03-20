import test from "node:test";
import assert from "node:assert/strict";

import {
  applyExclusiveYakSelection,
  CALCULATOR_YAK_PRESETS,
  calculateRoundSettlement,
  createHistoryEntry,
  summarizeHistory
} from "./calculator-logic.js";

test("calculator presets mirror the main project's yak definitions", () => {
  assert.deepEqual(CALCULATOR_YAK_PRESETS, [
    { month: 2, label: "2월 매조", bonus: 480, penalty: 120 },
    { month: 1, label: "1월 송학", bonus: 400, penalty: 100 },
    { month: 3, label: "3월 벚꽃", bonus: 320, penalty: 80 },
    { month: 8, label: "8월 공산", bonus: 240, penalty: 60 },
    { month: 11, label: "11월 오동", bonus: 160, penalty: 40 },
    { month: 12, label: "12월 비", bonus: 80, penalty: 20 }
  ]);
});

test("calculateRoundSettlement uses the main project's entry fee and yak stacking rules", () => {
  const result = calculateRoundSettlement({
    baseCardScore: 70,
    myYakMonths: [1, 12],
    opponentYakMonths: [2],
    moneyPerFivePoints: 500
  });

  assert.equal(result.baseCardScore, 70);
  assert.equal(result.entryFee, -50);
  assert.equal(result.myYakTotal, 480);
  assert.equal(result.opponentYakPenaltyTotal, 120);
  assert.equal(result.finalScore, 380);
  assert.equal(result.amountWon, 38000);
});

test("calculateRoundSettlement supports the calculator's lower payout option", () => {
  const result = calculateRoundSettlement({
    baseCardScore: 70,
    myYakMonths: [1],
    opponentYakMonths: [12],
    moneyPerFivePoints: 100
  });

  assert.equal(result.finalScore, 400);
  assert.equal(result.moneyPerFivePoints, 100);
  assert.equal(result.amountWon, 8000);
});

test("applyExclusiveYakSelection clears the same Yak from the opposite side", () => {
  const mineSelections = CALCULATOR_YAK_PRESETS.map((preset) => ({
      month: preset.month,
      checked: preset.month === 1
    })),
    opponentSelections = CALCULATOR_YAK_PRESETS.map((preset) => ({
      month: preset.month,
      checked: preset.month === 2
    })),
    checkedByMe = applyExclusiveYakSelection(
      mineSelections,
      opponentSelections,
      "mine",
      2,
      true
    ),
    checkedByOpponent = applyExclusiveYakSelection(
      checkedByMe.mineSelections,
      checkedByMe.opponentSelections,
      "opponent",
      1,
      true
    );

  assert.equal(
    checkedByMe.mineSelections.find((selection) => selection.month === 2)?.checked,
    true
  );
  assert.equal(
    checkedByMe.opponentSelections.find((selection) => selection.month === 2)?.checked,
    false
  );
  assert.equal(
    checkedByOpponent.opponentSelections.find((selection) => selection.month === 1)?.checked,
    true
  );
  assert.equal(
    checkedByOpponent.mineSelections.find((selection) => selection.month === 1)?.checked,
    false
  );
});

test("summarizeHistory accumulates round totals", () => {
  const first = createHistoryEntry(
      calculateRoundSettlement({
        baseCardScore: 20,
        myYakMonths: [12],
        opponentYakMonths: [],
        moneyPerFivePoints: 500
      }),
      1,
      "2026-03-20T00:00:00.000Z",
      "round-1"
    ),
    second = createHistoryEntry(
      calculateRoundSettlement({
        baseCardScore: 30,
        myYakMonths: [],
        opponentYakMonths: [11],
        moneyPerFivePoints: 500
      }),
      2,
      "2026-03-20T01:00:00.000Z",
      "round-2"
    ),
    summary = summarizeHistory([first, second]);

  assert.equal(summary.roundCount, 2);
  assert.equal(summary.totalScore, -10);
  assert.equal(summary.totalAmountWon, -1000);
});
