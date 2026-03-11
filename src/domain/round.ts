import { type InitialDealerRound, evaluateInitialDealerRounds } from "./dealer.js";
import {
  MIN_ACTIVE_PLAYERS,
  MAX_ROOM_PLAYERS,
  type RoomState,
  getTurnOrderFromDealer,
  setRoundParticipantRoles
} from "./room.js";

export type RoundSetupPhase = "selecting_initial_dealer" | "waiting_for_giveups" | "ready_to_play";

interface RoundSetupBase {
  room: RoomState;
}

export interface DealerSelectionState extends RoundSetupBase {
  phase: "selecting_initial_dealer";
  dealerDrawRounds: InitialDealerRound[];
}

export interface GiveUpState extends RoundSetupBase {
  phase: "waiting_for_giveups";
  dealerId: string;
  turnOrder: string[];
  decisionMakers: string[];
  mandatoryPlayerId: string;
  currentPlayerId: string;
  giveUpsNeeded: number;
  decisions: Record<string, "play" | "give_up" | "pending">;
}

export interface ReadyToPlayState extends RoundSetupBase {
  phase: "ready_to_play";
  dealerId: string;
  turnOrder: string[];
  activePlayerIds: string[];
  spectatorPlayerIds: string[];
}

export type RoundSetupState = DealerSelectionState | GiveUpState | ReadyToPlayState;

export function createRoundSetup(room: RoomState): DealerSelectionState {
  if (room.players.length < MIN_ACTIVE_PLAYERS || room.players.length > MAX_ROOM_PLAYERS) {
    throw new Error(`Round setup requires between ${MIN_ACTIVE_PLAYERS} and ${MAX_ROOM_PLAYERS} players.`);
  }

  return {
    phase: "selecting_initial_dealer",
    room,
    dealerDrawRounds: []
  };
}

export function recordDealerDrawRound(
  state: DealerSelectionState,
  round: InitialDealerRound
): DealerSelectionState | GiveUpState | ReadyToPlayState {
  const dealerDrawRounds = [...state.dealerDrawRounds, round];
  const progress = evaluateInitialDealerRounds(dealerDrawRounds);

  if (progress.status === "tied") {
    return {
      ...state,
      dealerDrawRounds
    };
  }

  return createPostDealerState(state.room, progress.result.dealerId);
}

export function declareGiveUp(
  state: GiveUpState,
  playerId: string,
  giveUp: boolean
): GiveUpState | ReadyToPlayState {
  if (state.currentPlayerId !== playerId) {
    throw new Error(`It is not ${playerId}'s turn to decide give-up.`);
  }

  const currentIndex = state.decisionMakers.indexOf(playerId);
  if (currentIndex === -1) {
    throw new Error(`Player ${playerId} is not allowed to make a give-up decision.`);
  }

  const currentDecision = state.decisions[playerId];
  if (currentDecision !== "pending") {
    throw new Error(`Player ${playerId} already made a give-up decision.`);
  }

  const decidedGiveUps = countDecisions(state.decisions, "give_up");
  const remainingGiveUps = state.giveUpsNeeded - decidedGiveUps;
  const remainingDecisionMakers = state.decisionMakers.length - currentIndex;
  const forcedGiveUp = remainingDecisionMakers === remainingGiveUps;

  if (forcedGiveUp && !giveUp) {
    throw new Error(`Player ${playerId} must give up to leave exactly ${MIN_ACTIVE_PLAYERS} active players.`);
  }

  if (!forcedGiveUp && giveUp && remainingGiveUps <= 0) {
    throw new Error("No additional give-up slots remain.");
  }

  const decisions: GiveUpState["decisions"] = {
    ...state.decisions,
    [playerId]: giveUp ? "give_up" : "play"
  };

  const updatedGiveUps = countDecisions(decisions, "give_up");
  const giveUpsRemainingAfterDecision = state.giveUpsNeeded - updatedGiveUps;
  const nextIndex = currentIndex + 1;

  if (giveUpsRemainingAfterDecision === 0 || nextIndex >= state.decisionMakers.length) {
    return finalizeGiveUpState(state, decisions);
  }

  return {
    ...state,
    decisions,
    currentPlayerId: getDecisionMakerAt(state.decisionMakers, nextIndex)
  };
}

function createPostDealerState(room: RoomState, dealerId: string): GiveUpState | ReadyToPlayState {
  const turnOrder = getTurnOrderFromDealer(room, dealerId).map((player) => player.playerId);

  if (room.players.length === MIN_ACTIVE_PLAYERS) {
    const preparedRoom = setRoundParticipantRoles(room, turnOrder);
    return {
      phase: "ready_to_play",
      room: preparedRoom,
      dealerId,
      turnOrder,
      activePlayerIds: turnOrder,
      spectatorPlayerIds: []
    };
  }

  const mandatoryPlayerId = turnOrder.at(-1);
  if (mandatoryPlayerId === undefined) {
    throw new Error("Mandatory player could not be determined for give-up flow.");
  }

  const decisionMakers = turnOrder.slice(0, -1);
  const decisions = Object.fromEntries(turnOrder.map((playerId) => [playerId, "pending"])) as GiveUpState["decisions"];

  return {
    phase: "waiting_for_giveups",
    room,
    dealerId,
    turnOrder,
    decisionMakers,
    mandatoryPlayerId,
    currentPlayerId: getDecisionMakerAt(decisionMakers, 0),
    giveUpsNeeded: room.players.length - MIN_ACTIVE_PLAYERS,
    decisions
  };
}

function finalizeGiveUpState(
  state: GiveUpState,
  decisions: GiveUpState["decisions"]
): ReadyToPlayState {
  const finalizedDecisions: GiveUpState["decisions"] = { ...decisions };

  for (const playerId of state.decisionMakers) {
    if (finalizedDecisions[playerId] === "pending") {
      finalizedDecisions[playerId] = "play";
    }
  }

  finalizedDecisions[state.mandatoryPlayerId] = "play";

  const activePlayerIds = state.turnOrder.filter((playerId) => finalizedDecisions[playerId] !== "give_up");
  if (activePlayerIds.length !== MIN_ACTIVE_PLAYERS) {
    throw new Error(`Round setup must finalize exactly ${MIN_ACTIVE_PLAYERS} active players.`);
  }

  const spectatorPlayerIds = state.turnOrder.filter((playerId) => finalizedDecisions[playerId] === "give_up");
  const preparedRoom = setRoundParticipantRoles(state.room, activePlayerIds);

  return {
    phase: "ready_to_play",
    room: preparedRoom,
    dealerId: state.dealerId,
    turnOrder: activePlayerIds,
    activePlayerIds,
    spectatorPlayerIds
  };
}

function countDecisions(
  decisions: GiveUpState["decisions"],
  target: "give_up" | "play"
): number {
  return Object.values(decisions).filter((decision) => decision === target).length;
}

function getDecisionMakerAt(decisionMakers: readonly string[], index: number): string {
  const playerId = decisionMakers[index];
  if (playerId === undefined) {
    throw new Error(`Give-up decision maker at index ${index} does not exist.`);
  }

  return playerId;
}
