import test from "node:test";
import assert from "node:assert/strict";

import { MINHWATU_DECK_SIZE, createStandardDeck, cutDeck, parseCardId, shuffleDeck } from "./cards.js";

test("createStandardDeck returns 48 unique valid cards", () => {
  const deck = createStandardDeck();

  assert.equal(deck.length, MINHWATU_DECK_SIZE);
  assert.equal(new Set(deck).size, MINHWATU_DECK_SIZE);
  assert.deepEqual(parseCardId(deck[0] ?? ""), { month: 1, slot: 1 });
  assert.deepEqual(parseCardId(deck.at(-1) ?? ""), { month: 12, slot: 4 });
});

test("cutDeck rotates the deck from the chosen cut index", () => {
  const deck = createStandardDeck();
  const cut = cutDeck(deck, 4);

  assert.equal(cut[0], "02_1");
  assert.equal(cut.at(-1), "01_4");
});

test("shuffleDeck preserves deck size and uniqueness", () => {
  const deck = createStandardDeck();
  const shuffled = shuffleDeck(deck, () => 0.5);

  assert.equal(shuffled.length, MINHWATU_DECK_SIZE);
  assert.equal(new Set(shuffled).size, MINHWATU_DECK_SIZE);
});
