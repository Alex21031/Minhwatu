import test from "node:test";
import assert from "node:assert/strict";

import { type CardId } from "./cards.js";
import { CARD_META_BY_ID, getCardMeta } from "./card-meta.js";

test("card metadata covers all 48 cards with the expected category totals", () => {
  const entries = Object.values(CARD_META_BY_ID);
  assert.equal(entries.length, 48);

  const counts = entries.reduce(
    (totals, entry) => {
      totals[entry.category] += 1;
      return totals;
    },
    {
      gwang: 0,
      yeolkkeut: 0,
      tti: 0,
      pi: 0
    }
  );

  assert.deepEqual(counts, {
    gwang: 5,
    yeolkkeut: 10,
    tti: 10,
    pi: 23
  });
});

test("full-deck metadata matches the expected Minhwatu category layout month by month", () => {
  const expectedByMonth = {
    1: ["gwang", "pi", "tti", "pi"],
    2: ["yeolkkeut", "pi", "tti", "pi"],
    3: ["gwang", "pi", "tti", "pi"],
    4: ["yeolkkeut", "pi", "tti", "pi"],
    5: ["yeolkkeut", "pi", "tti", "pi"],
    6: ["yeolkkeut", "pi", "tti", "pi"],
    7: ["yeolkkeut", "pi", "tti", "pi"],
    8: ["gwang", "pi", "yeolkkeut", "pi"],
    9: ["yeolkkeut", "pi", "tti", "pi"],
    10: ["yeolkkeut", "pi", "tti", "pi"],
    11: ["gwang", "pi", "yeolkkeut", "pi"],
    12: ["gwang", "yeolkkeut", "tti", "pi"]
  } as const;

  for (const [month, expectedCategories] of Object.entries(expectedByMonth)) {
    const monthNumber = Number.parseInt(month, 10);
    const actualCategories = ([1, 2, 3, 4] as const).map((cardIndex) =>
      getCardMeta(`${monthNumber.toString().padStart(2, "0")}_${cardIndex}` as CardId).category
    );
    assert.deepEqual(actualCategories, expectedCategories);
  }
});

test("full-deck metadata matches the user-provided direct point table month by month", () => {
  const expectedPointsByMonth = {
    1: [20, 0, 5, 0],
    2: [10, 0, 5, 0],
    3: [20, 0, 5, 0],
    4: [10, 0, 5, 0],
    5: [10, 0, 5, 0],
    6: [10, 0, 5, 0],
    7: [10, 0, 5, 0],
    8: [20, 0, 10, 0],
    9: [10, 0, 5, 0],
    10: [10, 0, 5, 0],
    11: [20, 0, 10, 0],
    12: [20, 10, 5, 0]
  } as const;

  for (const [month, expectedPoints] of Object.entries(expectedPointsByMonth)) {
    const monthNumber = Number.parseInt(month, 10);
    const actualPoints = ([1, 2, 3, 4] as const).map((cardIndex) =>
      getCardMeta(`${monthNumber.toString().padStart(2, "0")}_${cardIndex}` as CardId).pointValue
    );
    assert.deepEqual(actualPoints, expectedPoints);
  }
});
