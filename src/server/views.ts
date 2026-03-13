import type { CardId } from "../domain/cards.js";
import type { InitialDealerRound } from "../domain/dealer.js";
import type { PlayState, TurnResult } from "../domain/play.js";
import type { RoomState } from "../domain/room.js";
import type {
  DealerSelectionState,
  GiveUpState,
  ReadyToPlayState,
  RoundSetupState
} from "../domain/round.js";

export type VisibleCard = CardId | "hidden";
export type ViewerMode = "player" | "spectator";

export interface PendingGiveUpDealView {
  cutIndex: number;
  dealOrder: string[];
  hands: Record<string, VisibleCard[]>;
  hiddenFloorCards: VisibleCard[];
  drawPileCards: VisibleCard[];
  initialFloorTripleMonths: number[];
}

export interface DealerSelectionStateView {
  phase: "selecting_initial_dealer";
  dealerDrawRounds: InitialDealerRound[];
}

export interface GiveUpStateView {
  phase: "waiting_for_giveups";
  dealerId: string;
  turnOrder: string[];
  decisionMakers: string[];
  mandatoryPlayerId: string;
  currentPlayerId: string;
  giveUpsNeeded: number;
  decisions: Record<string, "play" | "give_up" | "pending">;
  pendingDeal: PendingGiveUpDealView | null;
  viewerMode: ViewerMode;
}

export interface ReadyToPlayStateView {
  phase: "ready_to_play";
  dealerId: string;
  turnOrder: string[];
  activePlayerIds: string[];
  spectatorPlayerIds: string[];
  predealtHand: VisibleCard[] | null;
  viewerMode: ViewerMode;
}

export type RoundSetupStateView =
  | DealerSelectionStateView
  | GiveUpStateView
  | ReadyToPlayStateView;

interface PlayStateViewBase {
  dealerId: string;
  turnOrder: string[];
  activePlayerIds: string[];
  spectatorPlayerIds: string[];
  hands: Record<string, VisibleCard[]>;
  floorCards: CardId[];
  drawPileCards: VisibleCard[];
  capturedByPlayer: Record<string, CardId[]>;
  completedTurns: number;
  lastTurn: TurnResult | null;
  viewerMode: ViewerMode;
}

export interface AwaitingHandPlayStateView extends PlayStateViewBase {
  phase: "awaiting_hand_play";
  currentPlayerId: string;
  currentTurnIndex: number;
}

export interface AwaitingHandChoiceStateView extends PlayStateViewBase {
  phase: "awaiting_hand_choice";
  currentPlayerId: string;
  currentTurnIndex: number;
  pendingHandCard: VisibleCard;
  matchingFloorCards: CardId[];
}

export interface AwaitingDrawFlipStateView extends PlayStateViewBase {
  phase: "awaiting_draw_flip";
  currentPlayerId: string;
  currentTurnIndex: number;
}

export interface AwaitingDrawChoiceStateView extends PlayStateViewBase {
  phase: "awaiting_draw_choice";
  currentPlayerId: string;
  currentTurnIndex: number;
  revealedDrawCard: CardId;
  matchingFloorCards: CardId[];
}

export interface CompletedRoundStateView extends PlayStateViewBase {
  phase: "completed";
}

export type PlayStateView =
  | AwaitingHandPlayStateView
  | AwaitingHandChoiceStateView
  | AwaitingDrawFlipStateView
  | AwaitingDrawChoiceStateView
  | CompletedRoundStateView;

export function createRoundSetupStateView(
  setupState: RoundSetupState | null,
  viewerId: string,
  viewerModeOverride?: ViewerMode
): RoundSetupStateView | null {
  if (setupState === null) {
    return null;
  }

  if (setupState.phase === "selecting_initial_dealer") {
    return {
      phase: "selecting_initial_dealer",
      dealerDrawRounds: setupState.dealerDrawRounds
    };
  }

  if (setupState.phase === "waiting_for_giveups") {
    const viewerMode = viewerModeOverride ?? getGiveUpViewerMode(setupState, viewerId);

    return {
      phase: "waiting_for_giveups",
      dealerId: setupState.dealerId,
      turnOrder: setupState.turnOrder,
      decisionMakers: setupState.decisionMakers,
      mandatoryPlayerId: setupState.mandatoryPlayerId,
      currentPlayerId: setupState.currentPlayerId,
      giveUpsNeeded: setupState.giveUpsNeeded,
      decisions: setupState.decisions,
      pendingDeal:
        setupState.pendingDeal === null
          ? null
          : {
              cutIndex: setupState.pendingDeal.cutIndex,
              dealOrder: setupState.pendingDeal.dealOrder,
              hands: projectHands(setupState.pendingDeal.hands, viewerId, viewerMode === "spectator"),
              hiddenFloorCards: projectPrivatePile(
                setupState.pendingDeal.hiddenFloorCards,
                viewerMode === "spectator"
              ),
              drawPileCards: projectPrivatePile(
                setupState.pendingDeal.drawPile,
                viewerMode === "spectator"
              ),
              initialFloorTripleMonths:
                viewerMode === "spectator" ? setupState.pendingDeal.initialFloorTripleMonths : []
            },
      viewerMode
    };
  }

  const viewerMode = viewerModeOverride ?? getRoomViewerMode(setupState.room, viewerId);
  return {
    phase: "ready_to_play",
    dealerId: setupState.dealerId,
    turnOrder: setupState.turnOrder,
    activePlayerIds: setupState.activePlayerIds,
    spectatorPlayerIds: setupState.spectatorPlayerIds,
    predealtHand:
      setupState.predealtRound === null
        ? null
        : projectPrivateHand(
            setupState.predealtRound.hands[viewerId] ?? [],
            true
          ),
    viewerMode
  };
}

export function createPlayStateView(
  playState: PlayState | null,
  viewerId: string,
  viewerModeOverride?: ViewerMode
): PlayStateView | null {
  if (playState === null) {
    return null;
  }

  const viewerMode = viewerModeOverride ?? getRoomViewerMode(playState.room, viewerId);
  const canSeeAllCards = viewerMode === "spectator";
  const base: PlayStateViewBase = {
    dealerId: playState.dealerId,
    turnOrder: playState.turnOrder,
    activePlayerIds: playState.activePlayerIds,
    spectatorPlayerIds: playState.spectatorPlayerIds,
    hands: projectHands(playState.hands, viewerId, canSeeAllCards),
    floorCards: playState.floorCards,
    drawPileCards: projectPrivatePile(playState.drawPile, canSeeAllCards),
    capturedByPlayer: playState.capturedByPlayer,
    completedTurns: playState.completedTurns,
    lastTurn: playState.lastTurn,
    viewerMode
  };

  switch (playState.phase) {
    case "awaiting_hand_play":
      return {
        ...base,
        phase: "awaiting_hand_play",
        currentPlayerId: playState.currentPlayerId,
        currentTurnIndex: playState.currentTurnIndex
      };
    case "awaiting_hand_choice":
      return {
        ...base,
        phase: "awaiting_hand_choice",
        currentPlayerId: playState.currentPlayerId,
        currentTurnIndex: playState.currentTurnIndex,
        pendingHandCard: canSeeAllCards || viewerId === playState.currentPlayerId ? playState.pendingHandCard : "hidden",
        matchingFloorCards:
          canSeeAllCards || viewerId === playState.currentPlayerId ? playState.matchingFloorCards : []
      };
    case "awaiting_draw_flip":
      return {
        ...base,
        phase: "awaiting_draw_flip",
        currentPlayerId: playState.currentPlayerId,
        currentTurnIndex: playState.currentTurnIndex
      };
    case "awaiting_draw_choice":
      return {
        ...base,
        phase: "awaiting_draw_choice",
        currentPlayerId: playState.currentPlayerId,
        currentTurnIndex: playState.currentTurnIndex,
        revealedDrawCard: playState.revealedDrawCard,
        matchingFloorCards: playState.matchingFloorCards
      };
    case "completed":
      return {
        ...base,
        phase: "completed"
      };
    default:
      return assertNever(playState);
  }
}

function projectHands(
  hands: Record<string, CardId[]>,
  viewerId: string,
  canSeeAllCards: boolean
): Record<string, VisibleCard[]> {
  return Object.fromEntries(
    Object.entries(hands).map(([playerId, cards]) => [
      playerId,
      canSeeAllCards || playerId === viewerId ? [...cards] : cards.map(() => "hidden" as const)
    ])
  );
}

function projectPrivateHand(cards: readonly CardId[], canSeeCards: boolean): VisibleCard[] {
  return canSeeCards ? [...cards] : cards.map(() => "hidden" as const);
}

function projectPrivatePile(cards: readonly CardId[], canSeeCards: boolean): VisibleCard[] {
  return canSeeCards ? [...cards] : cards.map(() => "hidden" as const);
}

function getRoomViewerMode(room: RoomState, viewerId: string): ViewerMode {
  const player = room.players.find((candidate) => candidate.playerId === viewerId);
  return player?.role === "spectating" ? "spectator" : "player";
}

function getGiveUpViewerMode(state: GiveUpState, viewerId: string): ViewerMode {
  if (state.decisions[viewerId] === "give_up") {
    return "spectator";
  }

  return getRoomViewerMode(state.room, viewerId);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled snapshot view branch: ${JSON.stringify(value)}`);
}
