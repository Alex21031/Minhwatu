export type CardScore = 0 | 5 | 10 | 20;
export type CardId = string;

export interface CardRef {
  month: number;
  slot: number;
}

export interface DealerDraw {
  playerId: string;
  month: number;
  score: CardScore;
}

const MIN_MONTH = 1;
const MAX_MONTH = 12;
const MIN_SLOT = 1;
const MAX_SLOT = 4; //fdsafsda
export const MINHWATU_DECK_SIZE = MAX_MONTH * MAX_SLOT;

export function assertValidMonth(month: number): void {
  if (!Number.isInteger(month) || month < MIN_MONTH || month > MAX_MONTH) {
    throw new RangeError(`Card month must be between ${MIN_MONTH} and ${MAX_MONTH}. Received: ${month}`);
  }
}

export function assertValidSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < MIN_SLOT || slot > MAX_SLOT) {
    throw new RangeError(`Card slot must be between ${MIN_SLOT} and ${MAX_SLOT}. Received: ${slot}`);
  }
}

export function createCardId(card: CardRef): CardId {
  assertValidMonth(card.month);
  assertValidSlot(card.slot);
  return `${card.month.toString().padStart(2, "0")}_${card.slot}`;
}

export function parseCardId(cardId: CardId): CardRef {
  const match = /^(?<month>\d{2})_(?<slot>[1-4])$/.exec(cardId);

  if (!match?.groups) {
    throw new Error(`Invalid card id format: ${cardId}`);
  }

  const monthGroup = match.groups.month;
  const slotGroup = match.groups.slot;
  if (monthGroup === undefined || slotGroup === undefined) {
    throw new Error(`Card id is missing month or slot: ${cardId}`);
  }

  const month = Number.parseInt(monthGroup, 10);
  const slot = Number.parseInt(slotGroup, 10);
  assertValidMonth(month);
  assertValidSlot(slot);

  return { month, slot };
}

export function createDealerDraw(playerId: string, month: number, score: CardScore): DealerDraw {
  if (!playerId) {
    throw new Error("playerId is required.");
  }

  assertValidMonth(month);

  return { playerId, month, score };
}

export function createStandardDeck(): CardId[] {
  const deck: CardId[] = [];

  for (let month = MIN_MONTH; month <= MAX_MONTH; month += 1) {
    for (let slot = MIN_SLOT; slot <= MAX_SLOT; slot += 1) {
      deck.push(createCardId({ month, slot }));
    }
  }

  return deck;
}

export function cutDeck(deck: readonly CardId[], cutIndex: number): CardId[] {
  assertStandardDeck(deck);

  if (!Number.isInteger(cutIndex) || cutIndex < 0 || cutIndex >= deck.length) {
    throw new RangeError(`cutIndex must be between 0 and ${deck.length - 1}. Received: ${cutIndex}`);
  }

  return [...deck.slice(cutIndex), ...deck.slice(0, cutIndex)];
}

export function shuffleDeck(deck: readonly CardId[], random = Math.random): CardId[] {
  assertStandardDeck(deck);

  const shuffled = [...deck];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    const currentCard = shuffled[index];
    const targetCard = shuffled[target];

    if (currentCard === undefined || targetCard === undefined) {
      throw new Error("Shuffle index resolved to an invalid card position.");
    }

    shuffled[index] = targetCard;
    shuffled[target] = currentCard;
  }

  return shuffled;
}

export function assertStandardDeck(deck: readonly CardId[]): void {
  if (deck.length !== MINHWATU_DECK_SIZE) {
    throw new Error(`A Minhwatu deck must contain ${MINHWATU_DECK_SIZE} cards. Received: ${deck.length}`);
  }

  const uniqueCards = new Set(deck);
  if (uniqueCards.size !== deck.length) {
    throw new Error("Deck contains duplicate card ids.");
  }

  for (const cardId of deck) {
    parseCardId(cardId);
  }
}
