import { type CardId, parseCardId } from "./cards.js";
import { type DealtRoundState } from "./deal.js";

export interface TurnCapture {
  source: "hand" | "draw";
  playedCard: CardId;
  matchedFloorCard: CardId | null;
  capturedCards: CardId[];
}

export interface TurnResult {
  playerId: string;
  handStep: TurnCapture;
  drawStep: TurnCapture;
}

interface PlayStateBase extends Omit<DealtRoundState, "phase"> {
  capturedByPlayer: Record<string, CardId[]>;
  completedTurns: number;
  lastTurn: TurnResult | null;
}

export interface PlayingRoundState extends PlayStateBase {
  phase: "playing";
  currentPlayerId: string;
  currentTurnIndex: number;
}

export interface CompletedRoundState extends PlayStateBase {
  phase: "completed";
}

export type PlayState = PlayingRoundState | CompletedRoundState;

export function createPlayState(dealt: DealtRoundState): PlayingRoundState {
  const currentPlayerId = dealt.turnOrder[0];
  if (currentPlayerId === undefined) {
    throw new Error("A dealt round must include at least one active player.");
  }

  return {
    ...dealt,
    phase: "playing",
    currentPlayerId,
    currentTurnIndex: 0,
    capturedByPlayer: Object.fromEntries(dealt.activePlayerIds.map((playerId) => [playerId, []])),
    completedTurns: 0,
    lastTurn: null
  };
}

export function playTurn(state: PlayingRoundState, cardId: CardId): PlayState {
  const playerId = state.currentPlayerId;
  const playerHand = state.hands[playerId];

  if (playerHand === undefined) {
    throw new Error(`Current player ${playerId} does not have a hand.`);
  }

  if (!playerHand.includes(cardId)) {
    throw new Error(`Card ${cardId} is not in ${playerId}'s hand.`);
  }

  const handsAfterPlay = {
    ...state.hands,
    [playerId]: playerHand.filter((candidate) => candidate !== cardId)
  };

  const handResolution = resolveCardAgainstFloor(state.floorCards, cardId, "hand");
  const drawCard = state.drawPile[0];
  if (drawCard === undefined) {
    throw new Error("Draw pile is empty before the turn draw step.");
  }

  const drawResolution = resolveCardAgainstFloor(handResolution.nextFloorCards, drawCard, "draw");
  const drawPile = state.drawPile.slice(1);
  const capturedByPlayer = {
    ...state.capturedByPlayer,
    [playerId]: [
      ...(state.capturedByPlayer[playerId] ?? []),
      ...handResolution.capturedCards,
      ...drawResolution.capturedCards
    ]
  };

  const turnResult: TurnResult = {
    playerId,
    handStep: handResolution.turnCapture,
    drawStep: drawResolution.turnCapture
  };

  const completedTurns = state.completedTurns + 1;
  const roundBase = {
    ...state,
    hands: handsAfterPlay,
    floorCards: drawResolution.nextFloorCards,
    drawPile,
    capturedByPlayer,
    completedTurns,
    lastTurn: turnResult
  };

  if (isRoundComplete(handsAfterPlay, drawPile)) {
    return {
      ...roundBase,
      phase: "completed"
    };
  }

  const nextTurnIndex = (state.currentTurnIndex + 1) % state.activePlayerIds.length;
  const nextPlayerId = state.activePlayerIds[nextTurnIndex];
  if (nextPlayerId === undefined) {
    throw new Error(`Next player at turn index ${nextTurnIndex} does not exist.`);
  }

  return {
    ...roundBase,
    phase: "playing",
    currentTurnIndex: nextTurnIndex,
    currentPlayerId: nextPlayerId
  };
}

function resolveCardAgainstFloor(
  floorCards: readonly CardId[],
  cardId: CardId,
  source: TurnCapture["source"]
): {
  nextFloorCards: CardId[];
  capturedCards: CardId[];
  turnCapture: TurnCapture;
} {
  const playedMonth = parseCardId(cardId).month;
  const matchIndex = floorCards.findIndex((floorCard) => parseCardId(floorCard).month === playedMonth);

  if (matchIndex === -1) {
    return {
      nextFloorCards: [...floorCards, cardId],
      capturedCards: [],
      turnCapture: {
        source,
        playedCard: cardId,
        matchedFloorCard: null,
        capturedCards: []
      }
    };
  }

  const matchedFloorCard = floorCards[matchIndex];
  if (matchedFloorCard === undefined) {
    throw new Error(`Matched floor card at index ${matchIndex} does not exist.`);
  }

  return {
    nextFloorCards: floorCards.filter((_, index) => index !== matchIndex),
    capturedCards: [cardId, matchedFloorCard],
    turnCapture: {
      source,
      playedCard: cardId,
      matchedFloorCard,
      capturedCards: [cardId, matchedFloorCard]
    }
  };
}

function isRoundComplete(hands: Record<string, CardId[]>, drawPile: readonly CardId[]): boolean {
  return Object.values(hands).every((hand) => hand.length === 0) && drawPile.length === 0;
}
