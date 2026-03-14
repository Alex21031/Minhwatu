import type { PlayStateView, RoomView, RoundSetupStateView, ServerCapabilities } from "../server/protocol.js";

import {
  onlineServerSupportsBots,
  onlineServerSupportsDisplayName,
  onlineServerSupportsHostTransfer,
  onlineServerSupportsKickPlayer,
  onlineServerSupportsReadyToggle
} from "./online-capabilities.js";

type OnlineConnectionStatus = "disconnected" | "connecting" | "connected";

export interface OnlineControlState {
  isConnected: boolean;
  syncedSetupState: RoundSetupStateView | null;
  syncedPlayState: PlayStateView | null;
  connectedPlayer: RoomView["players"][number] | null;
  isHost: boolean;
  supportsReadyToggle: boolean;
  supportsDisplayName: boolean;
  supportsHostTransfer: boolean;
  supportsKickPlayer: boolean;
  supportsBots: boolean;
  hasActiveSyncedRound: boolean;
  canToggleReady: boolean;
  canStartByRoster: boolean;
  disconnectedPlayers: string[];
  notReadyPlayers: string[];
  canStartRoundSetup: boolean;
  canAutoResolveDealer: boolean;
  canDeclareGiveUp: boolean;
  canDealCards: boolean;
  canFlipDrawCard: boolean;
  canPrepareNextRound: boolean;
  canAddTestBot: boolean;
  canChangeRooms: boolean;
  canLeaveRoom: boolean;
  viewerMode: "idle" | "spectator" | RoomView["players"][number]["role"];
  showRoomExitActions: boolean;
  primaryMatchActionLabel: string;
  phaseHint: string;
}

interface OnlineControlStateArgs {
  connectionStatus: OnlineConnectionStatus;
  syncedSetupState: RoundSetupStateView | null;
  syncedPlayState: PlayStateView | null;
  syncedRoom: RoomView | null;
  connectedPlayerId: string | null;
  connectedPlayer: RoomView["players"][number] | null;
  serverCapabilities: ServerCapabilities | null;
  getPlayerLabel: (playerId: string | null) => string;
}

export function getOnlineControlState(args: OnlineControlStateArgs): OnlineControlState {
  const {
    connectionStatus,
    syncedSetupState,
    syncedPlayState,
    syncedRoom,
    connectedPlayerId,
    connectedPlayer,
    serverCapabilities,
    getPlayerLabel
  } = args;
  const isConnected = connectionStatus === "connected";
  const isHost = connectedPlayer !== null && syncedRoom?.hostPlayerId === connectedPlayer.playerId;
  const supportsReadyToggle = onlineServerSupportsReadyToggle(serverCapabilities);
  const supportsDisplayName = onlineServerSupportsDisplayName(serverCapabilities);
  const supportsHostTransfer = onlineServerSupportsHostTransfer(serverCapabilities);
  const supportsKickPlayer = onlineServerSupportsKickPlayer(serverCapabilities);
  const supportsBots = onlineServerSupportsBots(serverCapabilities);
  const hasActiveSyncedRound = syncedSetupState !== null || syncedPlayState !== null;
  const canToggleReady =
    isConnected &&
    supportsReadyToggle &&
    connectedPlayer !== null &&
    syncedSetupState === null &&
    syncedPlayState === null;
  const canStartByRoster =
    syncedRoom !== null &&
    syncedRoom.players.length >= 5 &&
    syncedRoom.players.length <= 7 &&
    syncedRoom.players.every((player) => player.isReady && player.isConnected);
  const disconnectedPlayers =
    syncedRoom?.players.filter((player) => !player.isConnected).map((player) => getPlayerLabel(player.playerId)) ?? [];
  const notReadyPlayers =
    syncedRoom?.players.filter((player) => !player.isReady).map((player) => getPlayerLabel(player.playerId)) ?? [];
  const canStartRoundSetup =
    isConnected && isHost && canStartByRoster && syncedSetupState === null && syncedPlayState === null;
  const canAutoResolveDealer = syncedSetupState?.phase === "selecting_initial_dealer";
  const canDeclareGiveUp =
    syncedSetupState?.phase === "waiting_for_giveups" &&
    syncedSetupState.currentPlayerId === connectedPlayerId;
  const canDealCards = syncedSetupState?.phase === "ready_to_play";
  const canFlipDrawCard =
    syncedPlayState?.phase === "awaiting_draw_flip" &&
    syncedPlayState.currentPlayerId === connectedPlayerId;
  const canPrepareNextRound = syncedPlayState?.phase === "completed";
  const canAddTestBot =
    isConnected &&
    isHost &&
    supportsBots &&
    syncedRoom !== null &&
    !hasActiveSyncedRound &&
    syncedRoom.players.length < 7;
  const canChangeRooms = isConnected && !hasActiveSyncedRound;
  const canLeaveRoom =
    syncedRoom !== null &&
    (!hasActiveSyncedRound || syncedPlayState?.phase === "completed");
  const viewerMode =
    syncedRoom === null ? "idle" : connectedPlayer === null ? "spectator" : connectedPlayer.role;
  const showRoomExitActions = syncedRoom !== null;
  const primaryMatchActionLabel =
    canPrepareNextRound
      ? "Prepare Next Round"
      : canFlipDrawCard
        ? "Flip Draw Card"
        : canDealCards
          ? "Deal Cards"
          : canAutoResolveDealer
            ? "Resolve Dealer"
            : canStartRoundSetup
              ? "Start Setup"
              : canDeclareGiveUp
                ? "Choose Play Or Give Up"
                : "Waiting";
  const phaseHint =
    canPrepareNextRound
      ? "The round is complete. Move the table directly into the next setup."
      : canFlipDrawCard
        ? "Your draw step is waiting for an explicit flip."
        : canDealCards
          ? "The final five are locked. Reveal or deal the table."
          : canDeclareGiveUp
            ? "The current chooser must decide whether to play or give up."
            : canAutoResolveDealer
              ? "Dealer draw inputs are ready. Resolve the starting dealer."
              : canStartRoundSetup
                ? "Roster is ready. Start the synchronized round setup."
                : "Room actions and round actions will appear here when they become relevant.";

  return {
    isConnected,
    syncedSetupState,
    syncedPlayState,
    connectedPlayer,
    isHost,
    supportsReadyToggle,
    supportsDisplayName,
    supportsHostTransfer,
    supportsKickPlayer,
    supportsBots,
    hasActiveSyncedRound,
    canToggleReady,
    canStartByRoster,
    disconnectedPlayers,
    notReadyPlayers,
    canStartRoundSetup,
    canAutoResolveDealer,
    canDeclareGiveUp,
    canDealCards,
    canFlipDrawCard,
    canPrepareNextRound,
    canAddTestBot,
    canChangeRooms,
    canLeaveRoom,
    viewerMode,
    showRoomExitActions,
    primaryMatchActionLabel,
    phaseHint
  };
}
