import type { CardScore } from "../index.js";
import type { PlayStateView, ServerCapabilities } from "../server/protocol.js";

import {
  onlineServerSupportsBots,
  onlineServerSupportsDisplayName,
  onlineServerSupportsReadyToggle
} from "./online-capabilities.js";

type HomeMenuSection = "home" | "match" | "spectate" | "settings";

interface ConnectedPlayerLike {
  isReady: boolean;
}

interface CreateAnonymousHandlersArgs {
  setHomeAuthForm: (form: "login" | "signup") => void;
  updateAuthField: (field: "loginUserId" | "loginPassword" | "signupUserId" | "signupName" | "signupPassword", value: string) => void;
  submitLogin: () => void;
  submitSignup: () => void;
}

interface CreateAuthenticatedHandlersArgs {
  setHomeSection: (section: HomeMenuSection) => void;
  backHome: () => void;
  updateOnlineField: (field: "serverUrl" | "playerId" | "displayNameInput" | "roomIdInput", value: string) => void;
  logout: () => void;
  reconnectServer: () => void;
  createRoom: () => void;
  joinRoom: () => void;
  leaveRoom: () => void;
  getConnectedPlayer: () => ConnectedPlayerLike | null;
  serverCapabilities: ServerCapabilities | null;
  setOnlineError: (message: string) => void;
  sendOnlineMessage: (message: Record<string, unknown>) => void;
  displayNameInput: string;
  updateAuthMetaField: (field: "watchRoomIdInput" | "adminBalanceUserId" | "adminBalanceAmount", value: string) => void;
  refreshAdminOverview: () => void;
  adjustAdminBalance: () => void;
  getSyncedPlayState: () => PlayStateView | null;
  resetLocalRoom: () => void;
  changePlayerCount: (value: number) => void;
  changeDealerInput: (playerId: string, targetField: string, value: number) => void;
  autoDealer: () => void;
  resolveDealer: () => void;
  choosePlay: () => void;
  chooseGiveUp: () => void;
  changeCutIndex: (value: number) => void;
  dealLocalCards: () => void;
  prepareLocalNextRound: () => void;
}

export function createAnonymousAuthHandlers(args: CreateAnonymousHandlersArgs) {
  return {
    onShowLogin: () => {
      args.setHomeAuthForm("login");
    },
    onShowSignup: () => {
      args.setHomeAuthForm("signup");
    },
    onUpdateAuthField: args.updateAuthField,
    onSubmitLogin: () => {
      args.submitLogin();
    },
    onSubmitSignup: () => {
      args.submitSignup();
    }
  };
}

export function createAuthenticatedHandlers(args: CreateAuthenticatedHandlersArgs) {
  return {
    onSelectHomeSection: (section: string) => {
      args.setHomeSection(section as HomeMenuSection);
    },
    onBackHome: args.backHome,
    onUpdateOnlineField: args.updateOnlineField,
    onLogout: args.logout,
    onReconnectServer: args.reconnectServer,
    onCreateRoom: args.createRoom,
    onJoinRoom: args.joinRoom,
    onLeaveRoom: args.leaveRoom,
    onToggleReady: () => {
      const connectedPlayer = args.getConnectedPlayer();
      if (connectedPlayer === null) {
        return;
      }

      if (!onlineServerSupportsReadyToggle(args.serverCapabilities)) {
        args.setOnlineError("The running server is outdated. Restart `npm run server` and reconnect.");
        return;
      }

      args.sendOnlineMessage({
        type: "set_ready",
        isReady: !connectedPlayer.isReady
      });
    },
    onAddTestBot: () => {
      if (!onlineServerSupportsBots(args.serverCapabilities)) {
        args.setOnlineError("This server does not support test bots. Restart the multiplayer server.");
        return;
      }

      args.sendOnlineMessage({ type: "add_test_bot" });
    },
    onSaveDisplayName: () => {
      if (!onlineServerSupportsDisplayName(args.serverCapabilities)) {
        args.setOnlineError("This server does not support display names. Restart the multiplayer server.");
        return;
      }

      args.sendOnlineMessage({
        type: "set_display_name",
        displayName: args.displayNameInput
      });
    },
    onTransferHost: (targetPlayerId: string) => {
      args.sendOnlineMessage({
        type: "transfer_host",
        targetPlayerId
      });
    },
    onKickPlayer: (targetPlayerId: string) => {
      args.sendOnlineMessage({
        type: "kick_player",
        targetPlayerId
      });
    },
    onUpdateWatchRoomId: (value: string) => {
      args.updateAuthMetaField("watchRoomIdInput", value);
    },
    onWatchRoom: (roomId: string) => {
      args.updateAuthMetaField("watchRoomIdInput", roomId);
      args.sendOnlineMessage({
        type: "watch_room",
        roomId
      });
    },
    onStopWatchingRoom: () => {
      args.sendOnlineMessage({
        type: "stop_watching_room"
      });
    },
    onUpdateAdminBalanceUserId: (value: string) => {
      args.updateAuthMetaField("adminBalanceUserId", value);
    },
    onUpdateAdminBalanceAmount: (value: string) => {
      args.updateAuthMetaField("adminBalanceAmount", value);
    },
    onRefreshAdminOverview: () => {
      args.refreshAdminOverview();
    },
    onAdjustAdminBalance: () => {
      args.adjustAdminBalance();
    },
    onStartRoundSetup: () => {
      args.sendOnlineMessage({ type: "start_round_setup" });
    },
    onAutoResolveDealer: () => {
      args.sendOnlineMessage({ type: "auto_resolve_dealer" });
    },
    onPlayDecision: () => {
      args.sendOnlineMessage({
        type: "declare_give_up",
        giveUp: false
      });
    },
    onGiveUpDecision: () => {
      args.sendOnlineMessage({
        type: "declare_give_up",
        giveUp: true
      });
    },
    onDealOnlineCards: () => {
      args.sendOnlineMessage({ type: "deal_cards" });
    },
    onPrepareOnlineNextRound: () => {
      args.sendOnlineMessage({ type: "prepare_next_round" });
    },
    onSelectOnlineCard: (cardId: string) => {
      args.sendOnlineMessage({
        type: "select_hand_card",
        cardId
      });
    },
    onSelectOnlineFloorCard: (floorCardId: string) => {
      const playState = args.getSyncedPlayState();
      if (playState === null) {
        return;
      }

      if (playState.phase === "awaiting_hand_choice") {
        args.sendOnlineMessage({
          type: "resolve_hand_choice",
          floorCardId
        });
        return;
      }

      if (playState.phase === "awaiting_draw_choice") {
        args.sendOnlineMessage({
          type: "resolve_draw_choice",
          floorCardId
        });
      }
    },
    onChangePlayerCount: args.changePlayerCount,
    onResetRoom: args.resetLocalRoom,
    onChangeDealerInput: args.changeDealerInput,
    onAutoDealer: args.autoDealer,
    onResolveDealer: args.resolveDealer,
    onChoosePlay: args.choosePlay,
    onChooseGiveUp: args.chooseGiveUp,
    onChangeCutIndex: args.changeCutIndex,
    onDealLocalCards: args.dealLocalCards,
    onPrepareLocalNextRound: args.prepareLocalNextRound
  };
}
