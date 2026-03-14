import crypto from "node:crypto";
import fs from "node:fs";

import {
  createDealerDraw,
  createStandardDeck,
  shuffleDeck,
  type CardScore
} from "../domain/cards.js";
import { type InitialDealerRound, evaluateInitialDealerRounds } from "../domain/dealer.js";
import { prepareFinalFiveDealWithRedeal, prepareGiveUpDealWithRedeal } from "../domain/deal.js";
import {
  createPlayState,
  flipDrawCard,
  resolveDrawChoice,
  resolveHandChoice,
  selectHandCard,
  type PlayState
} from "../domain/play.js";
import {
  areAllPlayersConnected,
  areAllPlayersReady,
  MAX_ROOM_PLAYERS,
  MIN_ACTIVE_PLAYERS,
  restoreSpectatorsForNextRound,
  sortPlayersBySeat,
  type RoomState
} from "../domain/room.js";
import { scoreRound } from "../domain/scoring.js";
import {
  createNextRoundSetup,
  createRoundSetup,
  declareGiveUp,
  recordDealerDrawRound,
  type DealerSelectionState,
  type RoundSetupState
} from "../domain/round.js";
import { determineNextDealer } from "../domain/dealer.js";
import { AccountService, type AuthenticatedUserView } from "./account-service.js";
import { MultiplayerRoomService } from "./room-service.js";
import type { AdminOverview, PublicRoomSummary, RoundHistoryEntry } from "./protocol.js";

export interface TableSnapshot {
  viewer: AuthenticatedUserView;
  room: RoomState;
  setupState: RoundSetupState | null;
  playState: PlayState | null;
  actionLog: string[];
  roundHistory: RoundHistoryEntry[];
}

type DealerRoundFactory = (playerIds: readonly string[]) => InitialDealerRound;

interface LeaveRoomOptions {
  allowActiveRoundReset?: boolean;
}

interface MultiplayerTableStoreSnapshot {
  rooms: RoomState[];
  setupStates: Array<[string, RoundSetupState]>;
  playStates: Array<[string, PlayState]>;
  actionLogs: Array<[string, string[]]>;
  roundHistory: Array<[string, RoundHistoryEntry[]]>;
}

interface MultiplayerTableServiceOptions {
  storagePath?: string;
}

const DEALER_DRAW_SCORES: CardScore[] = [0, 5, 10, 20];
const MAX_ACTION_LOG_ENTRIES = 20;

export class MultiplayerTableService {
  private readonly setupStates = new Map<string, RoundSetupState>();
  private readonly playStates = new Map<string, PlayState>();
  private readonly actionLogs = new Map<string, string[]>();
  private readonly roundHistory = new Map<string, RoundHistoryEntry[]>();
  private readonly storagePath: string | null;

  constructor(
    private readonly roomService = new MultiplayerRoomService(),
    private readonly createDealerRound: DealerRoundFactory = createRandomDealerRound,
    private readonly accountService = new AccountService(),
    options: MultiplayerTableServiceOptions = {}
  ) {
    this.storagePath = options.storagePath ?? null;
    this.loadStore();
  }

  createRoom(playerId: string, roomId: string): TableSnapshot {
    const previousRoomId = this.roomService.getRoomForPlayer(playerId)?.roomId ?? null;
    this.assertCanLeaveCurrentRoom(playerId);
    const room = this.roomService.createRoom(playerId, roomId, this.accountService.getUserView(playerId).name);
    this.handlePlayerDeparture(previousRoomId, playerId, room.roomId);
    this.clearRoomProgress(room.roomId);
    this.roundHistory.set(room.roomId, []);
    this.actionLogs.set(room.roomId, [`${playerId} created room ${room.roomId}.`]);
    this.persistStore();
    return this.createSnapshot(room, playerId);
  }

  joinExistingRoom(playerId: string, roomId: string): TableSnapshot {
    const currentRoomId = this.roomService.getRoomForPlayer(playerId)?.roomId ?? null;
    const targetRoom = this.roomService.getRoom(roomId);
    if (targetRoom !== null && currentRoomId === roomId) {
      return this.createSnapshot(targetRoom, playerId);
    }

    this.assertCanLeaveCurrentRoom(playerId);

    if (targetRoom !== null && currentRoomId !== roomId && this.roomHasActiveProgress(roomId)) {
      throw new Error("Room is in progress. New players can join only after the current round returns to idle.");
    }

    const previousRoomId = this.roomService.getRoomForPlayer(playerId)?.roomId ?? null;
    const room = this.roomService.joinExistingRoom(playerId, roomId, this.accountService.getUserView(playerId).name);
    this.handlePlayerDeparture(previousRoomId, playerId, room.roomId);
    const resetResult = this.clearRoomProgress(room.roomId);
    this.recordAction(room.roomId, `${playerId} joined room ${room.roomId}.`);
    if (resetResult.hadProgress) {
      this.recordAction(room.roomId, "Room roster changed. Setup and play progress were reset.");
    }
    this.persistStore();
    return this.createSnapshot(room, playerId);
  }

  leaveCurrentRoom(
    playerId: string,
    options: LeaveRoomOptions = {}
  ): { roomId: string | null; snapshot: TableSnapshot | null } {
    if (!options.allowActiveRoundReset) {
      this.assertCanLeaveCurrentRoom(playerId);
    }

    const result = this.roomService.leaveCurrentRoom(playerId);

    if (result.roomId === null) {
      return {
        roomId: null,
        snapshot: null
      };
    }

    const resetResult = this.clearRoomProgress(result.roomId);

    if (result.room === null) {
      this.actionLogs.delete(result.roomId);
      this.roundHistory.delete(result.roomId);
      this.persistStore();
      return {
        roomId: result.roomId,
        snapshot: null
      };
    }

    return {
      roomId: result.roomId,
      snapshot: this.createSnapshotWithAction(resetResult.room ?? result.room, {
        primary: `${playerId} left room ${result.roomId}.`,
        secondary: resetResult.hadProgress ? "Room roster changed. Setup and play progress were reset." : null
      })
    };
  }

  getSnapshotForPlayer(playerId: string): TableSnapshot | null {
    const room = this.roomService.getRoomForPlayer(playerId);
    if (room === null) {
      return null;
    }

    return this.getSnapshotForRoom(room.roomId, playerId);
  }

  getSnapshotForRoom(roomId: string, viewerId: string): TableSnapshot | null {
    const room = this.roomService.getRoom(roomId);
    if (room === null) {
      return null;
    }

    return {
      viewer: this.accountService.getUserView(viewerId),
      room,
      setupState: this.setupStates.get(roomId) ?? null,
      playState: this.playStates.get(roomId) ?? null,
      actionLog: [...(this.actionLogs.get(roomId) ?? [])],
      roundHistory: [...(this.roundHistory.get(roomId) ?? [])]
    };
  }

  setPlayerReady(playerId: string, isReady: boolean): TableSnapshot {
    const room = this.roomService.updateReadyState(playerId, isReady);
    return this.createSnapshotWithAction(room, {
      primary: `${playerId} marked ${isReady ? "ready" : "not ready"}.`
    });
  }

  setPlayerDisplayName(playerId: string, displayName: string): TableSnapshot {
    const user = this.accountService.updateName(playerId, displayName);
    const room = this.roomService.updateDisplayName(playerId, user.name);
    const updatedPlayer = room.players.find((player) => player.playerId === playerId);
    if (updatedPlayer === undefined) {
      throw new Error(`Player ${playerId} is not in room ${room.roomId}.`);
    }

    return this.createSnapshotWithAction(room, {
      primary: `${playerId} updated their display name to ${updatedPlayer.displayName}.`
    });
  }

  getViewerAccount(playerId: string): AuthenticatedUserView {
    return this.accountService.getUserView(playerId);
  }

  getAdminOverview(playerId: string): AdminOverview {
    const users = this.accountService.listUsers(playerId);
    const activeRooms = this.listPublicRooms();

    return {
      users,
      activeRooms,
      auditLog: this.accountService.getAuditLog(playerId)
    };
  }

  listPublicRooms(): PublicRoomSummary[] {
    return this.roomService.getRooms().map((room) => ({
      roomId: room.roomId,
      hostName:
        room.hostPlayerId === null
          ? null
          : room.players.find((player) => player.playerId === room.hostPlayerId)?.displayName ?? room.hostPlayerId,
      playerCount: room.players.length,
      readyCount: room.players.filter((player) => player.isReady).length,
      connectedCount: room.players.filter((player) => player.isConnected).length,
      inProgress: this.roomHasActiveProgress(room.roomId)
    }));
  }

  deleteRoom(playerId: string, roomId: string): { roomId: string; deletedPlayerIds: string[] } {
    this.accountService.listUsers(playerId);
    const room = this.roomService.getRoom(roomId);
    if (room === null) {
      throw new Error(`Room ${roomId} does not exist.`);
    }

    this.clearRoomProgress(roomId);
    this.roomService.deleteRoom(roomId);
    this.actionLogs.delete(roomId);
    this.roundHistory.delete(roomId);
    this.persistStore();

    return {
      roomId,
      deletedPlayerIds: room.players.map((player) => player.playerId)
    };
  }

  adminAdjustBalance(playerId: string, targetPlayerId: string, amount: number): AuthenticatedUserView {
    return this.accountService.adjustBalance(playerId, targetPlayerId, amount);
  }

  addTestBot(playerId: string): TableSnapshot {
    const room = this.getRequiredRoomForPlayer(playerId);
    if (room.hostPlayerId !== playerId) {
      throw new Error("Only the host can add test bots.");
    }

    if (this.roomHasActiveProgress(room.roomId)) {
      throw new Error("Test bots can only be added while the room is idle.");
    }

    if (room.players.length >= MAX_ROOM_PLAYERS) {
      throw new Error("Room is already full.");
    }

    const botIndex = this.getNextBotIndex(room);
    const botUserId = `bot-${room.roomId}-${botIndex}`;
    const botName = `BOT ${botIndex}`;
    this.accountService.ensureBotAccount(botUserId, botName);

    let nextRoom = this.roomService.joinExistingRoom(botUserId, room.roomId, botName);
    nextRoom = this.roomService.updateReadyState(botUserId, true);

    return this.createSnapshotWithAction(nextRoom, {
      primary: `${botUserId} joined room ${room.roomId} as a test bot.`,
      secondary: `${botUserId} marked ready automatically.`
    });
  }

  transferHost(playerId: string, targetPlayerId: string): TableSnapshot {
    const room = this.getRequiredRoomForPlayer(playerId);
    if (room.hostPlayerId !== playerId) {
      throw new Error("Only the current host can transfer room ownership.");
    }

    if (targetPlayerId === playerId) {
      throw new Error("The host already owns the room.");
    }

    const nextRoom = this.roomService.transferHost(playerId, targetPlayerId);
    return this.createSnapshotWithAction(nextRoom, {
      primary: `${playerId} transferred host rights to ${targetPlayerId}.`
    });
  }

  kickPlayer(playerId: string, targetPlayerId: string): TableSnapshot {
    const room = this.getRequiredRoomForPlayer(playerId);
    if (room.hostPlayerId !== playerId) {
      throw new Error("Only the current host can kick players.");
    }

    if (targetPlayerId === playerId) {
      throw new Error("The host cannot kick themselves.");
    }

    const result = this.roomService.kickPlayer(playerId, targetPlayerId);
    if (result.room === null) {
      throw new Error(`Room ${result.roomId} no longer exists.`);
    }

    const resetResult = this.clearRoomProgress(result.roomId);
    return this.createSnapshotWithAction(resetResult.room ?? result.room, {
      primary: `${playerId} kicked ${targetPlayerId} from room ${result.roomId}.`,
      secondary: resetResult.hadProgress ? "Room roster changed. Setup and play progress were reset." : null
    });
  }

  setPlayerConnected(playerId: string, isConnected: boolean): TableSnapshot | null {
    const room = this.roomService.updateConnectionState(playerId, isConnected);
    if (room === null) {
      return null;
    }

    return this.createSnapshotWithAction(room, {
      primary: `${playerId} is now ${isConnected ? "connected" : "disconnected"}.`
    });
  }

  startRoundSetup(playerId: string): TableSnapshot {
    const room = this.getRequiredRoomForPlayer(playerId);
    const viewer = this.accountService.getUserView(playerId);
    const isAdmin = viewer.role === "admin";
    if (!isAdmin && room.hostPlayerId !== playerId) {
      throw new Error("Only the host can start synchronized round setup.");
    }

    if (room.players.length < MIN_ACTIVE_PLAYERS || room.players.length > MAX_ROOM_PLAYERS) {
      throw new Error(`Round setup requires ${MIN_ACTIVE_PLAYERS} to ${MAX_ROOM_PLAYERS} seated players.`);
    }

    if (!isAdmin && !areAllPlayersReady(room)) {
      throw new Error("Every seated player must be ready before the host can start.");
    }

    if (!areAllPlayersConnected(room)) {
      throw new Error("Every seated player must be connected before the host can start.");
    }

    const setupState = createRoundSetup(room);
    this.setupStates.set(room.roomId, setupState);
    this.playStates.delete(room.roomId);
    return this.createSnapshotWithAction(room, {
      primary: isAdmin
        ? `Admin ${playerId} started round setup with ${room.players.length} entrants.`
        : `Round setup started with ${room.players.length} entrants.`
    });
  }

  adminStartRoom(playerId: string, roomId: string): TableSnapshot {
    this.accountService.listUsers(playerId);
    const room = this.roomService.getRoom(roomId);
    if (room === null) {
      throw new Error(`Room ${roomId} does not exist.`);
    }

    if (this.roomHasActiveProgress(roomId)) {
      throw new Error("Room is already in an active synchronized round.");
    }

    if (room.players.length < MIN_ACTIVE_PLAYERS || room.players.length > MAX_ROOM_PLAYERS) {
      throw new Error(`Round setup requires ${MIN_ACTIVE_PLAYERS} to ${MAX_ROOM_PLAYERS} seated players.`);
    }

    if (!areAllPlayersConnected(room)) {
      throw new Error("Every seated player must be connected before the admin can start.");
    }

    const setupState = createRoundSetup(room);
    this.setupStates.set(room.roomId, setupState);
    this.playStates.delete(room.roomId);
    return this.createSnapshotWithAction(room, {
      viewerId: playerId,
      primary: `Admin ${playerId} force-started round setup with ${room.players.length} entrants.`
    });
  }

  autoResolveDealer(playerId: string): TableSnapshot {
    const setupState = this.getRequiredSetupState(playerId);
    if (setupState.phase !== "selecting_initial_dealer") {
      throw new Error("Dealer can only be resolved during initial dealer selection.");
    }

    const nextState = recordDealerDrawRound(setupState, this.createDealerRound(getDealerCandidates(setupState)));
    const preparedState =
      nextState.phase === "waiting_for_giveups"
        ? prepareGiveUpDealWithRedeal(nextState, () => shuffleDeck(createStandardDeck()))
        : nextState;

    this.setupStates.set(preparedState.room.roomId, preparedState);
    this.playStates.delete(preparedState.room.roomId);
    return this.createSnapshotWithAction(preparedState.room, {
      primary:
        preparedState.phase === "selecting_initial_dealer"
          ? `Dealer draw tied. Redraw contenders: ${getDealerCandidates(preparedState).join(", ")}.`
          : `Dealer resolved: ${preparedState.dealerId}.`,
      secondary:
        preparedState.phase === "waiting_for_giveups"
          ? "Hands dealt for give-up decisions."
          : preparedState.phase === "ready_to_play"
            ? "Round is ready to play."
            : null
    });
  }

  declareGiveUp(playerId: string, giveUp: boolean): TableSnapshot {
    const setupState = this.getRequiredSetupState(playerId);
    if (setupState.phase !== "waiting_for_giveups") {
      throw new Error("Give-up decisions can only be made during the give-up phase.");
    }

    const nextState = declareGiveUp(setupState, playerId, giveUp);
    this.setupStates.set(nextState.room.roomId, nextState);
    return this.createSnapshotWithAction(nextState.room, {
      primary: `${playerId} chose ${giveUp ? "give up" : "play"}.`,
      secondary:
        nextState.phase === "ready_to_play"
          ? `Final five locked: ${nextState.activePlayerIds.join(", ")}.`
          : null
    });
  }

  dealCards(playerId: string): TableSnapshot {
    const setupState = this.getRequiredSetupState(playerId);
    if (setupState.phase !== "ready_to_play") {
      throw new Error("Cards can only be dealt after the round setup is ready to play.");
    }

    const dealtState = prepareFinalFiveDealWithRedeal(
      setupState,
      () => shuffleDeck(createStandardDeck())
    );
    const playState = createPlayState(dealtState);

    this.setupStates.delete(setupState.room.roomId);
    this.playStates.set(setupState.room.roomId, playState);

    return this.createSnapshotWithAction(playState.room, {
      primary: `Cards dealt. ${playState.currentPlayerId} opens the round.`,
      secondary:
        dealtState.redealCount > 0
          ? `Redealt ${dealtState.redealCount} extra time(s) due to invalid opening layouts.`
          : null
    });
  }

  selectHandCard(playerId: string, cardId: string): TableSnapshot {
    const playState = this.getRequiredPlayState(playerId);
    if (playState.phase !== "awaiting_hand_play" && playState.phase !== "awaiting_hand_choice") {
      throw new Error("A hand card can only be selected during the hand-step selection phase.");
    }

    this.assertCurrentPlayer(playState, playerId);
    const nextPlayState = selectHandCard(playState, cardId);
    this.playStates.set(playState.room.roomId, nextPlayState);

    return this.createSnapshotWithAction(nextPlayState.room, {
      primary: `${playerId} selected ${cardId} for the hand step.`
    });
  }

  resolveHandChoice(playerId: string, floorCardId: string | null): TableSnapshot {
    const playState = this.getRequiredPlayState(playerId);
    if (playState.phase !== "awaiting_hand_choice") {
      throw new Error("The hand step can only be resolved during the hand-choice phase.");
    }

    this.assertCurrentPlayer(playState, playerId);
    const pendingHandCard = playState.pendingHandCard;
    const nextPlayState = resolveHandChoice(playState, floorCardId);
    this.playStates.set(playState.room.roomId, nextPlayState);

    return this.createSnapshotWithAction(nextPlayState.room, {
      primary:
        floorCardId === null
          ? `${playerId} discarded ${pendingHandCard} to the floor.`
          : `${playerId} captured ${floorCardId} with ${pendingHandCard}.`
    });
  }

  flipDrawCard(playerId: string): TableSnapshot {
    const playState = this.getRequiredPlayState(playerId);
    if (playState.phase !== "awaiting_draw_flip") {
      throw new Error("The draw pile can only be flipped during the draw-flip phase.");
    }

    this.assertCurrentPlayer(playState, playerId);
    const nextPlayState = flipDrawCard(playState);
    this.playStates.set(playState.room.roomId, nextPlayState);

    return this.createSnapshotWithAction(nextPlayState.room, {
      primary: `${playerId} flipped ${nextPlayState.revealedDrawCard}.`
    });
  }

  resolveDrawChoice(playerId: string, floorCardId: string | null): TableSnapshot {
    const playState = this.getRequiredPlayState(playerId);
    if (playState.phase !== "awaiting_draw_choice") {
      throw new Error("The draw step can only be resolved during the draw-choice phase.");
    }

    this.assertCurrentPlayer(playState, playerId);
    const revealedDrawCard = playState.revealedDrawCard;
    const nextPlayState = resolveDrawChoice(playState, floorCardId);
    this.playStates.set(playState.room.roomId, nextPlayState);

    const settlementText =
      nextPlayState.phase === "completed"
        ? this.applyCompletedRoundSettlement(nextPlayState)
        : null;

    return this.createSnapshotWithAction(nextPlayState.room, {
      primary:
        floorCardId === null
          ? `${playerId} discarded ${revealedDrawCard} to the floor.`
          : `${playerId} captured ${floorCardId} with ${revealedDrawCard}.`,
      secondary: settlementText ?? (nextPlayState.phase === "completed" ? "Round complete." : null)
    });
  }

  prepareNextRound(playerId: string): TableSnapshot {
    const playState = this.getRequiredPlayState(playerId);
    if (playState.phase !== "completed") {
      throw new Error("The next round can only be prepared after the current round is completed.");
    }

    const scoring = scoreRound(playState.capturedByPlayer, playState.activePlayerIds);
    const nextDealerId =
      scoring.status === "scored"
        ? determineNextDealer(
            scoring.players.map((player) => ({
              playerId: player.playerId,
              finalScore: player.finalScore,
              orderIndex: playState.activePlayerIds.indexOf(player.playerId)
            }))
          ).playerId
        : playState.dealerId;
    const nextSetupBase = createNextRoundSetup(playState.room, nextDealerId);
    const nextSetupState =
      nextSetupBase.phase === "waiting_for_giveups"
        ? prepareGiveUpDealWithRedeal(nextSetupBase, () => shuffleDeck(createStandardDeck()))
        : nextSetupBase;

    this.playStates.delete(playState.room.roomId);
    this.setupStates.set(playState.room.roomId, nextSetupState);

    return this.createSnapshotWithAction(nextSetupState.room, {
      primary: `Next round prepared. Dealer: ${nextDealerId}.`,
      secondary:
        scoring.status === "reset"
          ? "Three or more Yak completions reset the round with no settlement."
          : null
    });
  }

  private createSnapshot(room: RoomState, viewerId: string): TableSnapshot {
    return {
      viewer: this.accountService.getUserView(viewerId),
      room,
      setupState: this.setupStates.get(room.roomId) ?? null,
      playState: this.playStates.get(room.roomId) ?? null,
      actionLog: [...(this.actionLogs.get(room.roomId) ?? [])],
      roundHistory: [...(this.roundHistory.get(room.roomId) ?? [])]
    };
  }

  private createSnapshotWithAction(
    room: RoomState,
    options: {
      viewerId?: string | null;
      primary: string;
      secondary?: string | null;
    }
  ): TableSnapshot {
    if (options.secondary !== undefined && options.secondary !== null) {
      this.recordAction(room.roomId, options.secondary);
    }
    this.recordAction(room.roomId, options.primary);
    this.persistStore();

    return this.createSnapshot(room, options.viewerId ?? room.players[0]?.playerId ?? room.hostPlayerId ?? "admin");
  }

  private applyCompletedRoundSettlement(playState: PlayState): string {
    const scoring = scoreRound(playState.capturedByPlayer, playState.activePlayerIds);
    const updates = this.accountService.applyRoundSettlement(scoring);
    const nextDealerId =
      scoring.status === "scored"
        ? determineNextDealer(
            scoring.players.map((player) => ({
              playerId: player.playerId,
              finalScore: player.finalScore,
              orderIndex: playState.activePlayerIds.indexOf(player.playerId)
            }))
          ).playerId
        : playState.dealerId;

    if (scoring.status === "reset") {
      const summaryText = "Round complete. Three or more Yak completions reset the round with no balance change.";
      this.recordRoundHistory(playState.room.roomId, {
        id: cryptoRandomId(),
        roomId: playState.room.roomId,
        completedAt: new Date().toISOString(),
        status: "reset",
        nextDealerId,
        summaryText,
        players: []
      });
      this.persistStore();
      return summaryText;
    }

    if (updates.length === 0) {
      const summaryText = "Round complete.";
      this.recordRoundHistory(playState.room.roomId, {
        id: cryptoRandomId(),
        roomId: playState.room.roomId,
        completedAt: new Date().toISOString(),
        status: "scored",
        nextDealerId,
        summaryText,
        players: scoring.players.map((player) => ({
          playerId: player.playerId,
          counts: player.counts,
          baseCardScore: player.baseCardScore,
          entryFee: player.entryFee,
          finalScore: player.finalScore,
          amountWon: player.amountWon,
          yakNetScore: player.yakNetScore,
          yakMonths: player.yakMonths,
          yakAdjustments: player.yakAdjustments,
          capturedCards: [...(playState.capturedByPlayer[player.playerId] ?? [])]
        }))
      });
      this.persistStore();
      return summaryText;
    }

    const summaryText = `Round complete. Balance updates: ${updates
      .map((update) => `${update.userId} ${update.delta >= 0 ? "+" : ""}${update.delta}`)
      .join(", ")}.`;
    this.recordRoundHistory(playState.room.roomId, {
      id: cryptoRandomId(),
      roomId: playState.room.roomId,
      completedAt: new Date().toISOString(),
      status: "scored",
      nextDealerId,
      summaryText,
      players: scoring.players.map((player) => ({
        playerId: player.playerId,
        counts: player.counts,
        baseCardScore: player.baseCardScore,
        entryFee: player.entryFee,
        finalScore: player.finalScore,
        amountWon: player.amountWon,
        yakNetScore: player.yakNetScore,
        yakMonths: player.yakMonths,
        yakAdjustments: player.yakAdjustments,
        capturedCards: [...(playState.capturedByPlayer[player.playerId] ?? [])]
      }))
    });
    this.persistStore();
    return summaryText;
  }

  private clearRoomProgress(roomId: string): { hadProgress: boolean; room: RoomState | null } {
    const hadProgress = this.setupStates.has(roomId) || this.playStates.has(roomId);
    this.setupStates.delete(roomId);
    this.playStates.delete(roomId);

    const room = this.roomService.getRoom(roomId);
    if (!hadProgress || room === null) {
      return {
        hadProgress,
        room
      };
    }

    return {
      hadProgress,
      room: this.roomService.replaceRoom(restoreSpectatorsForNextRound(room))
    };
  }

  private roomHasActiveProgress(roomId: string): boolean {
    if (this.setupStates.has(roomId)) {
      return true;
    }

    const playState = this.playStates.get(roomId);
    if (playState === undefined) {
      return false;
    }

    return playState.phase !== "completed";
  }

  private roomLeaveLocked(roomId: string): boolean {
    if (this.setupStates.has(roomId)) {
      return true;
    }

    const playState = this.playStates.get(roomId);
    if (playState === undefined) {
      return false;
    }

    return playState.phase !== "completed";
  }

  private handlePlayerDeparture(previousRoomId: string | null, playerId: string, nextRoomId: string): void {
    if (previousRoomId === null || previousRoomId === nextRoomId) {
      return;
    }

    const previousRoom = this.roomService.getRoom(previousRoomId);
    const resetResult = this.clearRoomProgress(previousRoomId);
    if (previousRoom === null) {
      this.actionLogs.delete(previousRoomId);
      this.roundHistory.delete(previousRoomId);
      return;
    }

    this.recordAction(previousRoomId, `${playerId} left room ${previousRoomId}.`);
    if (resetResult.hadProgress) {
      this.recordAction(previousRoomId, "Room roster changed. Setup and play progress were reset.");
    }
  }

  private assertCanLeaveCurrentRoom(playerId: string): void {
    const room = this.roomService.getRoomForPlayer(playerId);
    if (room === null) {
      return;
    }

    if (this.roomLeaveLocked(room.roomId)) {
      throw new Error("Cannot leave or switch rooms while a synchronized round is active.");
    }
  }

  private recordAction(roomId: string, message: string): void {
    const current = this.actionLogs.get(roomId) ?? [];
    this.actionLogs.set(roomId, [message, ...current].slice(0, MAX_ACTION_LOG_ENTRIES));
  }

  private recordRoundHistory(roomId: string, entry: RoundHistoryEntry): void {
    const current = this.roundHistory.get(roomId) ?? [];
    this.roundHistory.set(roomId, [entry, ...current].slice(0, 10));
  }

  private getNextBotIndex(room: RoomState): number {
    const usedIndices = room.players
      .map((player) => {
        const match = /^bot-[^-]+-(\d+)$/.exec(player.playerId);
        return match === null ? 0 : Number.parseInt(match[1] ?? "0", 10);
      })
      .filter((value) => value > 0);

    return (usedIndices.length === 0 ? 0 : Math.max(...usedIndices)) + 1;
  }

  private loadStore(): void {
    if (this.storagePath === null || !fs.existsSync(this.storagePath)) {
      return;
    }

    const rawStore = fs.readFileSync(this.storagePath, "utf8");
    const snapshot = JSON.parse(rawStore) as Partial<MultiplayerTableStoreSnapshot>;

    this.roomService.hydrateRooms(snapshot.rooms ?? []);
    this.setupStates.clear();
    this.playStates.clear();
    this.actionLogs.clear();
    this.roundHistory.clear();

    for (const [roomId, setupState] of snapshot.setupStates ?? []) {
      this.setupStates.set(roomId, setupState);
    }
    for (const [roomId, playState] of snapshot.playStates ?? []) {
      this.playStates.set(roomId, playState);
    }
    for (const [roomId, actionLog] of snapshot.actionLogs ?? []) {
      this.actionLogs.set(roomId, actionLog);
    }
    for (const [roomId, history] of snapshot.roundHistory ?? []) {
      this.roundHistory.set(roomId, history);
    }
  }

  private persistStore(): void {
    if (this.storagePath === null) {
      return;
    }

    const snapshot: MultiplayerTableStoreSnapshot = {
      rooms: this.roomService.getRooms(),
      setupStates: [...this.setupStates.entries()],
      playStates: [...this.playStates.entries()],
      actionLogs: [...this.actionLogs.entries()],
      roundHistory: [...this.roundHistory.entries()]
    };

    fs.mkdirSync(getParentDirectory(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify(snapshot, null, 2));
  }

  private getRequiredRoomForPlayer(playerId: string): RoomState {
    const room = this.roomService.getRoomForPlayer(playerId);
    if (room === null) {
      throw new Error("Player is not currently in a room.");
    }

    return room;
  }

  private getRequiredSetupState(playerId: string): RoundSetupState {
    const room = this.getRequiredRoomForPlayer(playerId);
    const setupState = this.setupStates.get(room.roomId);
    if (setupState === undefined) {
      throw new Error("Round setup has not started for this room.");
    }

    return setupState;
  }

  private getRequiredPlayState(playerId: string): PlayState {
    const room = this.getRequiredRoomForPlayer(playerId);
    const playState = this.playStates.get(room.roomId);
    if (playState === undefined) {
      throw new Error("A synchronized play state is not active for this room.");
    }

    return playState;
  }

  private assertCurrentPlayer(playState: PlayState, playerId: string): void {
    if (playState.phase === "completed") {
      throw new Error("The round is already completed.");
    }

    if (playState.currentPlayerId !== playerId) {
      throw new Error(`It is not ${playerId}'s turn.`);
    }
  }
}

function getDealerCandidates(setupState: DealerSelectionState): string[] {
  if (setupState.dealerDrawRounds.length === 0) {
    return sortPlayersBySeat(setupState.room.players).map((player) => player.playerId);
  }

  const progress = evaluateInitialDealerRounds(setupState.dealerDrawRounds);
  if (progress.status === "tied") {
    return progress.contenders.map((contender) => contender.playerId);
  }

  throw new Error("Dealer is already resolved.");
}

function createRandomDealerRound(playerIds: readonly string[]): InitialDealerRound {
  return {
    draws: playerIds.map((playerId) =>
      createDealerDraw(
        playerId,
        randomBetween(1, 12),
        DEALER_DRAW_SCORES[randomBetween(0, DEALER_DRAW_SCORES.length - 1)] ?? 0
      )
    )
  };
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getParentDirectory(filePath: string): string {
  const separatorIndex = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return separatorIndex === -1 ? "." : filePath.slice(0, separatorIndex);
}

function cryptoRandomId(): string {
  return crypto.randomUUID();
}
