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

export interface AwaitingHandPlayState extends PlayStateBase {
  phase: "awaiting_hand_play";
  currentPlayerId: string;
  currentTurnIndex: number;
}

export interface AwaitingHandChoiceState extends PlayStateBase {
  phase: "awaiting_hand_choice";
  currentPlayerId: string;
  currentTurnIndex: number;
  pendingHandCard: CardId;
  matchingFloorCards: CardId[];
}

export interface AwaitingDrawFlipState extends PlayStateBase {
  phase: "awaiting_draw_flip";
  currentPlayerId: string;
  currentTurnIndex: number;
  handStep: TurnCapture;
}

export interface AwaitingDrawChoiceState extends PlayStateBase {
  phase: "awaiting_draw_choice";
  currentPlayerId: string;
  currentTurnIndex: number;
  handStep: TurnCapture;
  revealedDrawCard: CardId;
  matchingFloorCards: CardId[];
}

export interface CompletedRoundState extends PlayStateBase {
  phase: "completed";
}

export type PlayingRoundState =
  | AwaitingHandPlayState
  | AwaitingHandChoiceState
  | AwaitingDrawFlipState
  | AwaitingDrawChoiceState;

export type PlayState = PlayingRoundState | CompletedRoundState;

export function createPlayState(dealt: DealtRoundState): AwaitingHandPlayState {
  const currentPlayerId = dealt.turnOrder[0];
  if (currentPlayerId === undefined) {
    throw new Error("A dealt round must include at least one active player.");
  }

  return {
    ...dealt,
    phase: "awaiting_hand_play",
    currentPlayerId,
    currentTurnIndex: 0,
    capturedByPlayer: Object.fromEntries(dealt.activePlayerIds.map((playerId) => [playerId, []])),
    completedTurns: 0,
    lastTurn: null
  };
}

export function selectHandCard(
  state: AwaitingHandPlayState | AwaitingHandChoiceState,
  cardId: CardId
): AwaitingHandChoiceState {
  const playerId = state.currentPlayerId;
  const playerHand = state.hands[playerId];

  if (playerHand === undefined) {
    throw new Error(`Current player ${playerId} does not have a hand.`);
  }

  if (!playerHand.includes(cardId)) {
    throw new Error(`Card ${cardId} is not in ${playerId}'s hand.`);
  }

  return {
    ...state,
    phase: "awaiting_hand_choice",
    pendingHandCard: cardId,
    matchingFloorCards: getMatchingFloorCards(state.floorCards, cardId)
  };
}

export function resolveHandChoice(
  state: AwaitingHandChoiceState,
  matchedFloorCard: CardId | null
): AwaitingDrawFlipState {
  const playerId = state.currentPlayerId;
  const playerHand = state.hands[playerId];

  if (playerHand === undefined) {
    throw new Error(`Current player ${playerId} does not have a hand.`);
  }

  const handsAfterPlay = {
    ...state.hands,
    [playerId]: playerHand.filter((candidate) => candidate !== state.pendingHandCard)
  };
  const handResolution = resolveCardChoice(
    state.initialFloorTripleMonths,
    state.floorCards,
    state.pendingHandCard,
    matchedFloorCard,
    "hand"
  );

  return {
    ...state,
    phase: "awaiting_draw_flip",
    hands: handsAfterPlay,
    floorCards: handResolution.nextFloorCards,
    capturedByPlayer: {
      ...state.capturedByPlayer,
      [playerId]: [...(state.capturedByPlayer[playerId] ?? []), ...handResolution.capturedCards]
    },
    handStep: handResolution.turnCapture
  };
}

export function flipDrawCard(state: AwaitingDrawFlipState): AwaitingDrawChoiceState {
  const drawCard = state.drawPile[0];
  if (drawCard === undefined) {
    throw new Error("Draw pile is empty before the turn draw step.");
  }

  const drawPile = state.drawPile.slice(1);

  return {
    ...state,
    phase: "awaiting_draw_choice",
    drawPile,
    revealedDrawCard: drawCard,
    matchingFloorCards: getMatchingFloorCards(state.floorCards, drawCard)
  };
}

export function resolveDrawChoice(
  state: AwaitingDrawChoiceState,
  matchedFloorCard: CardId | null
): PlayState {
  const playerId = state.currentPlayerId;
  const drawResolution = resolveCardChoice(
    state.initialFloorTripleMonths,
    state.floorCards,
    state.revealedDrawCard,
    matchedFloorCard,
    "draw"
  );
  const capturedByPlayer = {
    ...state.capturedByPlayer,
    [playerId]: [
      ...(state.capturedByPlayer[playerId] ?? []),
      ...drawResolution.capturedCards
    ]
  };

  const turnResult: TurnResult = {
    playerId,
    handStep: state.handStep,
    drawStep: drawResolution.turnCapture
  };

  const completedTurns = state.completedTurns + 1;
  const roundBase = {
    ...state,
    hands: state.hands,
    floorCards: drawResolution.nextFloorCards,
    drawPile: state.drawPile,
    capturedByPlayer,
    completedTurns,
    lastTurn: turnResult
  };

  if (isRoundComplete(state.hands, state.drawPile)) {
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
    phase: "awaiting_hand_play",
    currentTurnIndex: nextTurnIndex,
    currentPlayerId: nextPlayerId
  };
}

export function playTurn(state: AwaitingHandPlayState, cardId: CardId): PlayState {
  const handChoiceState = selectHandCard(state, cardId);
  const handSelection = handChoiceState.matchingFloorCards[0] ?? null;
  const drawFlipState = resolveHandChoice(handChoiceState, handSelection);
  const drawChoiceState = flipDrawCard(drawFlipState);
  const drawSelection = drawChoiceState.matchingFloorCards[0] ?? null;

  return resolveDrawChoice(drawChoiceState, drawSelection);
}

function getMatchingFloorCards(floorCards: readonly CardId[], cardId: CardId): CardId[] {
  const playedMonth = parseCardId(cardId).month;
  return floorCards.filter((floorCard) => parseCardId(floorCard).month === playedMonth);
}

function resolveCardChoice(
  initialFloorTripleMonths: readonly number[],
  floorCards: readonly CardId[],
  cardId: CardId,
  matchedFloorCard: CardId | null,
  source: TurnCapture["source"]
): {
  nextFloorCards: CardId[];
  capturedCards: CardId[];
  turnCapture: TurnCapture;
} {
  const playedMonth = parseCardId(cardId).month;
  const matchingFloorCards = getMatchingFloorCards(floorCards, cardId);
  const shouldCaptureInitialTriple = initialFloorTripleMonths.includes(playedMonth) && matchingFloorCards.length === 3;

  if (matchedFloorCard === null) {
    if (matchingFloorCards.length > 0) {
      throw new Error(`Card ${cardId} must capture a matching floor card.`);
    }

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

  if (!floorCards.includes(matchedFloorCard)) {
    throw new Error(`Selected floor card ${matchedFloorCard} is not on the floor.`);
  }

  if (!matchingFloorCards.includes(matchedFloorCard)) {
    throw new Error(`Selected floor card ${matchedFloorCard} does not match ${cardId}.`);
  }

  if (shouldCaptureInitialTriple) {
    return {
      nextFloorCards: floorCards.filter((candidate) => parseCardId(candidate).month !== playedMonth),
      capturedCards: [cardId, ...matchingFloorCards],
      turnCapture: {
        source,
        playedCard: cardId,
        matchedFloorCard,
        capturedCards: [cardId, ...matchingFloorCards]
      }
    };
  }

  return {
    nextFloorCards: floorCards.filter((candidate) => candidate !== matchedFloorCard),
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
