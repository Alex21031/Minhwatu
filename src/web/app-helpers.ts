import { evaluateInitialDealerRounds, sortPlayersBySeat, type PlayState, type RoundSetupState } from "../index.js";
import type { PlayStateView, RoomView, RoundSetupStateView } from "../server/protocol.js";

export function getConnectedOnlineRoomPlayer(room: RoomView | null): RoomView["players"][number] | null {
  if (room === null) {
    return null;
  }

  return room.players.find((player) => player.isSelf) ?? null;
}

export function getOnlinePlayer(room: RoomView | null, playerId: string | null): RoomView["players"][number] | null {
  if (room === null || playerId === null) {
    return null;
  }

  return room.players.find((player) => player.playerId === playerId) ?? null;
}

export function sortOnlineRoomPlayersBySeat(players: RoomView["players"]): RoomView["players"] {
  return [...players].sort((left, right) => left.seatIndex - right.seatIndex);
}

export function getOrderedOnlinePlayerIds(
  playerIds: string[],
  getSeatIndex: (playerId: string) => number
): string[] {
  return [...playerIds].sort((left, right) => getSeatIndex(left) - getSeatIndex(right));
}

export function getDealerCandidates(setupState: RoundSetupState): string[] {
  return getCandidatesFromState(setupState);
}

export function getCandidatesFromState(setupState: RoundSetupState): string[] {
  if (setupState.phase !== "selecting_initial_dealer") {
    return [];
  }

  if (setupState.dealerDrawRounds.length === 0) {
    return sortPlayersBySeat(setupState.room.players).map((player) => player.playerId);
  }

  const progress = evaluateInitialDealerRounds(setupState.dealerDrawRounds);
  if (progress.status === "tied") {
    return progress.contenders.map((contender) => contender.playerId);
  }

  return [];
}

export function getPhaseLabel(playState: PlayState | null, dealtState: { activePlayerIds: string[] } | null, setupState: RoundSetupState): string {
  if (playState !== null) {
    return getPlayPhaseLabel(playState);
  }

  if (dealtState !== null) {
    return "cards dealt";
  }

  return setupState.phase.replaceAll("_", " ");
}

export function getPlayPhaseLabel(playState: PlayState): string {
  switch (playState.phase) {
    case "awaiting_hand_play":
      return "awaiting hand play";
    case "awaiting_hand_choice":
      return "awaiting hand choice";
    case "awaiting_draw_flip":
      return "awaiting draw flip";
    case "awaiting_draw_choice":
      return "awaiting draw choice";
    case "completed":
      return "round complete";
  }
}

export function getDealerLabel(
  playState: PlayState | null,
  dealtState: { dealerId: string } | null,
  setupState: RoundSetupState
): string {
  if (playState !== null) {
    return playState.dealerId;
  }

  if (dealtState !== null) {
    return dealtState.dealerId;
  }

  if (setupState.phase === "selecting_initial_dealer") {
    return "pending";
  }

  return setupState.dealerId;
}

export function getOnlineDealerLabel(
  syncedPlayState: PlayStateView | null,
  syncedSetupState: RoundSetupStateView | null
): string {
  if (syncedPlayState !== null) {
    return syncedPlayState.dealerId;
  }

  if (syncedSetupState === null || syncedSetupState.phase === "selecting_initial_dealer") {
    return "pending";
  }

  return syncedSetupState.dealerId;
}

export function getActiveCount(
  playState: PlayState | null,
  dealtState: { activePlayerIds: string[] } | null,
  setupState: RoundSetupState,
  roomPlayerCount: number
): number {
  if (playState !== null) {
    return playState.activePlayerIds.length;
  }

  if (dealtState !== null) {
    return dealtState.activePlayerIds.length;
  }

  if (setupState.phase === "selecting_initial_dealer") {
    return roomPlayerCount;
  }

  if (setupState.phase === "waiting_for_giveups") {
    return setupState.turnOrder.filter((playerId) => setupState.decisions[playerId] !== "give_up").length;
  }

  return setupState.activePlayerIds.length;
}

export function getOnlineActiveCount(
  syncedRoom: RoomView | null,
  syncedSetupState: RoundSetupStateView | null,
  syncedPlayState: PlayStateView | null
): number {
  if (syncedPlayState !== null) {
    return syncedPlayState.activePlayerIds.length;
  }

  if (syncedSetupState === null) {
    return 0;
  }

  if (syncedSetupState.phase === "selecting_initial_dealer") {
    return syncedRoom?.players.length ?? 0;
  }

  if (syncedSetupState.phase === "waiting_for_giveups") {
    return syncedSetupState.turnOrder.filter((playerId) => syncedSetupState.decisions[playerId] !== "give_up").length;
  }

  return syncedSetupState.activePlayerIds.length;
}

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getFloorAction(playState: PlayState): "discard-to-floor" | "" {
  if (playState.phase === "awaiting_hand_choice" || playState.phase === "awaiting_draw_choice") {
    return playState.matchingFloorCards.length === 0 ? "discard-to-floor" : "";
  }

  return "";
}

export function getOnlineFloorAction(
  playState: PlayStateView,
  isCurrentOnlinePlayer: boolean
): "discard-to-floor" | "" {
  if (!isCurrentOnlinePlayer) {
    return "";
  }

  if (playState.phase === "awaiting_hand_choice" || playState.phase === "awaiting_draw_choice") {
    return playState.matchingFloorCards.length === 0 ? "discard-to-floor" : "";
  }

  return "";
}

export function isInitialFloorTripleCapture(
  playState: Extract<PlayState, { phase: "awaiting_hand_choice" | "awaiting_draw_choice" }>,
  cardId: string
): boolean {
  return (
    playState.matchingFloorCards.length === 3 &&
    playState.initialFloorTripleMonths.includes(Number.parseInt(cardId.slice(0, 2), 10))
  );
}
