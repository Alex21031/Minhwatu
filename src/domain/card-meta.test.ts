import test from "node:test";
import assert from "node:assert/strict";

import { CARD_META_BY_ID } from "./card-meta.js";

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
