import {
  createNextRoundSetup,
  createPlayState,
  declareGiveUp,
  determineNextDealer,
  flipDrawCard,
  prepareFinalFiveDealWithRedeal,
  prepareGiveUpDealWithRedeal,
  resolveDrawChoice,
  resolveHandChoice,
  scoreRound,
  selectHandCard,
  shuffleDeck,
  createStandardDeck
} from "../index.js";
import type { AppState } from "./app-state.js";

interface CreateLocalRoundActionsArgs {
  getState: () => AppState;
  setState: (nextState: AppState) => void;
  render: () => void;
}

export function createLocalRoundActions(args: CreateLocalRoundActionsArgs) {
  function resolveGiveUp(giveUp: boolean): void {
    const currentState = args.getState();
    if (currentState.setupState.phase !== "waiting_for_giveups" || currentState.setupState.pendingDeal === null) {
      return;
    }

    const currentPlayerId = currentState.setupState.currentPlayerId;
    const nextState = declareGiveUp(currentState.setupState, currentPlayerId, giveUp);
    const verb = giveUp ? "gave up and moved to spectator mode" : "stayed in the round";

    args.setState({
      ...currentState,
      room: nextState.room,
      setupState: nextState,
      dealtState: null,
      playState: null,
      log: [`${currentPlayerId} ${verb}.`, ...currentState.log].slice(0, 10)
    });
    args.render();
  }

  function dealCards(): void {
    const currentState = args.getState();
    if (currentState.setupState.phase !== "ready_to_play") {
      return;
    }

    const usedPredealtRound = currentState.setupState.predealtRound !== null;
    const dealtState = prepareFinalFiveDealWithRedeal(
      currentState.setupState,
      () => shuffleDeck(createStandardDeck()),
      currentState.cutIndex
    );
    const playState = createPlayState(dealtState);
    const redealText =
      dealtState.redealCount > 0 ? ` Redealt ${dealtState.redealCount} extra time(s) due to 4-card month resets.` : "";

    args.setState({
      ...currentState,
      dealtState,
      playState,
      log: [
        usedPredealtRound
          ? `Hidden floor revealed. ${playState.currentPlayerId} opens the round with the locked final five.`
          : `Final five dealt with cut index ${currentState.cutIndex}.${redealText} ${playState.currentPlayerId} opens the round.`,
        ...currentState.log
      ].slice(0, 10)
    });
    args.render();
  }

  function resolveSelectedHandCard(cardId: string): void {
    const currentState = args.getState();
    if (
      currentState.playState === null ||
      (currentState.playState.phase !== "awaiting_hand_play" && currentState.playState.phase !== "awaiting_hand_choice")
    ) {
      return;
    }

    const currentPlayerId = currentState.playState.currentPlayerId;
    const nextPlayState = selectHandCard(currentState.playState, cardId);

    args.setState({
      ...currentState,
      playState: nextPlayState,
      log: [`${currentPlayerId} selected ${cardId} for the hand step.`, ...currentState.log].slice(0, 10)
    });
    args.render();
  }

  function resolveDiscardChoice(): void {
    const currentState = args.getState();
    if (currentState.playState === null) {
      return;
    }

    if (currentState.playState.phase === "awaiting_hand_choice") {
      if (currentState.playState.matchingFloorCards.length > 0) {
        return;
      }

      const currentPlayerId = currentState.playState.currentPlayerId;
      const pendingHandCard = currentState.playState.pendingHandCard;
      const nextPlayState = resolveHandChoice(currentState.playState, null);

      args.setState({
        ...currentState,
        playState: nextPlayState,
        log: [`${currentPlayerId} discarded ${pendingHandCard} to the floor.`, ...currentState.log].slice(0, 10)
      });
      args.render();
      return;
    }

    if (currentState.playState.phase === "awaiting_draw_choice") {
      if (currentState.playState.matchingFloorCards.length > 0) {
        return;
      }

      const currentPlayerId = currentState.playState.currentPlayerId;
      const revealedDrawCard = currentState.playState.revealedDrawCard;
      const nextPlayState = resolveDrawChoice(currentState.playState, null);
      const summary =
        nextPlayState.phase === "completed"
          ? `${currentPlayerId} discarded ${revealedDrawCard} and finished the round.`
          : `${currentPlayerId} discarded ${revealedDrawCard}. Turn passes to ${nextPlayState.currentPlayerId}.`;

      args.setState({
        ...currentState,
        playState: nextPlayState,
        log: [summary, ...currentState.log].slice(0, 10)
      });
      args.render();
    }
  }

  function resolveDrawFlip(): void {
    const currentState = args.getState();
    if (currentState.playState === null || currentState.playState.phase !== "awaiting_draw_flip") {
      return;
    }

    const currentPlayerId = currentState.playState.currentPlayerId;
    const nextPlayState = flipDrawCard(currentState.playState);

    args.setState({
      ...currentState,
      playState: nextPlayState,
      log: [`${currentPlayerId} revealed ${nextPlayState.revealedDrawCard}.`, ...currentState.log].slice(0, 10)
    });
    args.render();
  }

  function prepareNextRound(): void {
    const currentState = args.getState();
    if (currentState.playState === null || currentState.playState.phase !== "completed") {
      return;
    }

    const scoring = scoreRound(currentState.playState.capturedByPlayer, currentState.playState.activePlayerIds);
    const nextDealerId =
      scoring.status === "scored"
        ? determineNextDealer(
            scoring.players.map((player) => ({
              playerId: player.playerId,
              finalScore: player.finalScore,
              orderIndex: currentState.playState!.activePlayerIds.indexOf(player.playerId)
            }))
          ).playerId
        : currentState.playState.dealerId;
    const nextSetupState = createNextRoundSetup(currentState.playState.room, nextDealerId);
    const preparedNextSetupState =
      nextSetupState.phase === "waiting_for_giveups"
        ? prepareGiveUpDealWithRedeal(
            nextSetupState,
            () => shuffleDeck(createStandardDeck()),
            currentState.cutIndex
          )
        : nextSetupState;
    const resetText =
      scoring.status === "reset"
        ? ` Round reset kept dealer ${nextDealerId} for the next local round.`
        : "";

    args.setState({
      ...currentState,
      room: preparedNextSetupState.room,
      setupState: preparedNextSetupState,
      dealtState: null,
      playState: null,
      log: [`Prepared next round with dealer ${nextDealerId}.${resetText}`, ...currentState.log].slice(0, 10)
    });
    args.render();
  }

  function resolveFloorChoice(
    floorCardId: string,
    isInitialFloorTripleCapture: (playState: AppState["playState"] extends infer _ ? never : never, cardId: string) => boolean
  ): void;
  function resolveFloorChoice(
    floorCardId: string,
    isInitialFloorTripleCapture: (playState: AppState["playState"], cardId: string) => boolean
  ): void {
    const currentState = args.getState();
    if (currentState.playState === null) {
      return;
    }

    if (currentState.playState.phase === "awaiting_hand_choice") {
      const currentPlayerId = currentState.playState.currentPlayerId;
      const pendingHandCard = currentState.playState.pendingHandCard;
      const isInitialTriple = isInitialFloorTripleCapture(currentState.playState, pendingHandCard);
      const nextPlayState = resolveHandChoice(currentState.playState, floorCardId);

      args.setState({
        ...currentState,
        playState: nextPlayState,
        log: [
          isInitialTriple
            ? `${currentPlayerId} used ${pendingHandCard} to sweep the starting floor triple ${floorCardId}.`
            : `${currentPlayerId} captured ${pendingHandCard} with ${floorCardId}.`,
          ...currentState.log
        ].slice(0, 10)
      });
      args.render();
      return;
    }

    if (currentState.playState.phase === "awaiting_draw_choice") {
      const currentPlayerId = currentState.playState.currentPlayerId;
      const revealedDrawCard = currentState.playState.revealedDrawCard;
      const isInitialTriple = isInitialFloorTripleCapture(currentState.playState, revealedDrawCard);
      const nextPlayState = resolveDrawChoice(currentState.playState, floorCardId);
      const summary =
        nextPlayState.phase === "completed"
          ? isInitialTriple
            ? `${currentPlayerId} used ${revealedDrawCard} to sweep the starting floor triple ${floorCardId} and finished the round.`
            : `${currentPlayerId} captured ${revealedDrawCard} with ${floorCardId} and finished the round.`
          : isInitialTriple
            ? `${currentPlayerId} used ${revealedDrawCard} to sweep the starting floor triple ${floorCardId}. Turn passes to ${nextPlayState.currentPlayerId}.`
            : `${currentPlayerId} captured ${revealedDrawCard} with ${floorCardId}. Turn passes to ${nextPlayState.currentPlayerId}.`;

      args.setState({
        ...currentState,
        playState: nextPlayState,
        log: [summary, ...currentState.log].slice(0, 10)
      });
      args.render();
    }
  }

  return {
    resolveGiveUp,
    dealCards,
    resolveSelectedHandCard,
    resolveDiscardChoice,
    resolveDrawFlip,
    prepareNextRound,
    resolveFloorChoice
  };
}
