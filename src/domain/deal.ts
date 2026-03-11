import {
  MINHWATU_DECK_SIZE,
  type CardId,
  assertStandardDeck,
  cutDeck,
  parseCardId
} from "./cards.js";
import { MIN_ACTIVE_PLAYERS } from "./room.js";
import { type ReadyToPlayState } from "./round.js";

export interface DealtRoundState extends Omit<ReadyToPlayState, "phase"> {
  phase: "dealt";
  cutIndex: number;
  dealOrder: string[];
  hands: Record<string, CardId[]>;
  floorCards: CardId[];
  drawPile: CardId[];
}

export interface DealResetReason {
  location: "hand" | "floor";
  month: number;
  playerId?: string;
}

export interface AutoRedealtRoundState extends DealtRoundState {
  redealCount: number;
}

export class DealResetRequiredError extends Error {
  readonly reason: DealResetReason;

  constructor(reason: DealResetReason) {
    const detail =
      reason.location === "hand"
        ? `player ${reason.playerId} has all four cards of month ${reason.month}`
        : `floor has all four cards of month ${reason.month}`;
    super(`Initial deal must be reset because ${detail}.`);
    this.name = "DealResetRequiredError";
    this.reason = reason;
  }
}

const CARDS_PER_PLAYER = 4;
const FLOOR_CARD_COUNT = 8;

export function getDealOrder(turnOrder: readonly string[]): string[] {
  const dealerId = turnOrder[0];
  if (dealerId === undefined) {
    throw new Error("Turn order must include the dealer.");
  }

  return [...turnOrder.slice(1), dealerId];
}

export function prepareFinalFiveDeal(
  state: ReadyToPlayState,
  deck: readonly CardId[],
  cutIndex = 0
): DealtRoundState {
  if (state.activePlayerIds.length !== MIN_ACTIVE_PLAYERS) {
    throw new Error(`Final-five dealing requires exactly ${MIN_ACTIVE_PLAYERS} active players.`);
  }

  assertStandardDeck(deck);

  const orderedDeck = cutDeck(deck, cutIndex);
  const dealOrder = getDealOrder(state.turnOrder);
  const hands: Record<string, CardId[]> = {};
  let cursor = 0;

  for (const playerId of dealOrder) {
    hands[playerId] = orderedDeck.slice(cursor, cursor + CARDS_PER_PLAYER);
    cursor += CARDS_PER_PLAYER;
  }

  const floorCards = orderedDeck.slice(cursor, cursor + FLOOR_CARD_COUNT);
  cursor += FLOOR_CARD_COUNT;
  const drawPile = orderedDeck.slice(cursor);

  if (Object.values(hands).some((hand) => hand.length !== CARDS_PER_PLAYER)) {
    throw new Error("Each active player must receive exactly 4 cards.");
  }

  if (floorCards.length !== FLOOR_CARD_COUNT) {
    throw new Error(`Floor must contain exactly ${FLOOR_CARD_COUNT} cards.`);
  }

  const expectedDrawPile = MINHWATU_DECK_SIZE - MIN_ACTIVE_PLAYERS * CARDS_PER_PLAYER - FLOOR_CARD_COUNT;
  if (drawPile.length !== expectedDrawPile) {
    throw new Error(`Draw pile must contain exactly ${expectedDrawPile} cards.`);
  }

  const resetReason = findDealResetReason(hands, floorCards);
  if (resetReason !== null) {
    throw new DealResetRequiredError(resetReason);
  }

  return {
    ...state,
    phase: "dealt",
    cutIndex,
    dealOrder,
    hands,
    floorCards,
    drawPile
  };
}

export function prepareFinalFiveDealWithRedeal(
  state: ReadyToPlayState,
  deckFactory: () => readonly CardId[],
  cutIndex = 0,
  maxAttempts = 100
): AutoRedealtRoundState {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const dealt = prepareFinalFiveDeal(state, deckFactory(), cutIndex);
      return {
        ...dealt,
        redealCount: attempt
      };
    } catch (error) {
      if (!(error instanceof DealResetRequiredError)) {
        throw error;
      }
    }
  }

  throw new Error(`Unable to produce a valid deal after ${maxAttempts} attempts.`);
}

export function findDealResetReason(
  hands: Record<string, CardId[]>,
  floorCards: readonly CardId[]
): DealResetReason | null {
  for (const [playerId, hand] of Object.entries(hands)) {
    const handMonth = findFourOfMonth(hand);
    if (handMonth !== null) {
      return {
        location: "hand",
        month: handMonth,
        playerId
      };
    }
  }

  const floorMonth = findFourOfMonth(floorCards);
  if (floorMonth !== null) {
    return {
      location: "floor",
      month: floorMonth
    };
  }

  return null;
}

function findFourOfMonth(cards: readonly CardId[]): number | null {
  const monthCounts = new Map<number, number>();

  for (const cardId of cards) {
    const month = parseCardId(cardId).month;
    const nextCount = (monthCounts.get(month) ?? 0) + 1;
    monthCounts.set(month, nextCount);

    if (nextCount === 4) {
      return month;
    }
  }

  return null;
}
