export type CardScore = 0 | 5 | 10 | 20;

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
const MAX_SLOT = 4;

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

export function createCardId(card: CardRef): string {
  assertValidMonth(card.month);
  assertValidSlot(card.slot);
  return `${card.month.toString().padStart(2, "0")}_${card.slot}`;
}

export function parseCardId(cardId: string): CardRef {
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
