import {
  createDealerDraw,
  createStandardDeck,
  prepareGiveUpDealWithRedeal,
  recordDealerDrawRound,
  shuffleDeck
} from "../index.js";
import type { ClientMessage, PlayStateView, RoomView, ServerCapabilities } from "../server/protocol.js";

import { CARD_SCORES, createDealerInputs, type AppState } from "./app-state.js";
import { createAnonymousAuthHandlers, createAuthenticatedHandlers } from "./app-event-handlers.js";
import { bindAnonymousAuthEvents, bindAuthenticatedEvents } from "./event-bindings.js";

interface AuthSessionRuntimeLike {
  submitLogin: () => Promise<void>;
  submitSignup: () => Promise<void>;
  logoutAuthenticatedUser: () => Promise<void>;
  fetchAdminOverview: () => Promise<void>;
  adjustAdminBalance: () => Promise<void>;
  refreshPublicRooms: () => Promise<void>;
  ensureAuthenticatedOnlineConnection: () => void;
}

interface OnlineClientLike {
  sendOnlineRoomAction: (type: "create_room" | "join_room") => void;
  sendOnlineMessage: (message: ClientMessage) => void;
}

interface LocalRoundActionsLike {
  resolveGiveUp: (giveUp: boolean) => void;
  dealCards: () => void;
  prepareNextRound: () => void;
}

interface BindAppEventsArgs {
  getState: () => AppState;
  setState: (nextState: AppState) => void;
  render: () => void;
  createAppState: (playerCount: number) => AppState;
  authSessionRuntime: AuthSessionRuntimeLike;
  onlineClient: OnlineClientLike;
  localRoundActions: LocalRoundActionsLike;
  getConnectedOnlineRoomPlayer: () => RoomView["players"][number] | null;
  getDealerCandidates: () => string[];
  getCandidatesFromState: (setupState: AppState["setupState"]) => string[];
  randomBetween: (min: number, max: number) => number;
}

export function updateOnlineFieldValue(
  state: AppState,
  field: "displayNameInput" | "roomIdInput",
  value: string
): AppState {
  return {
    ...state,
    online: {
      ...state.online,
      [field]: value
    }
  };
}

export function updateAuthFieldValue(
  state: AppState,
  field:
    | "loginUserId"
    | "loginPassword"
    | "signupUserId"
    | "signupName"
    | "signupPassword"
    | "watchRoomIdInput"
    | "adminBalanceUserId"
    | "adminBalanceAmount",
  value: string
): AppState {
  return {
    ...state,
    auth: {
      ...state.auth,
      [field]: value
    }
  };
}

export function bindAppEvents(args: BindAppEventsArgs): void {
  const state = args.getState();

  if (state.auth.status !== "authenticated" || state.auth.user === null) {
    bindAnonymousAuthEvents(createAnonymousAuthHandlers({
      setHomeAuthForm: (form) => {
        const currentState = args.getState();
        args.setState({
          ...currentState,
          auth: {
            ...currentState.auth,
            activeForm: form,
            error: null
          }
        });
        args.render();
      },
      updateAuthField: (field, value) => {
        args.setState(updateAuthFieldValue(args.getState(), field, value));
      },
      submitLogin: () => {
        void args.authSessionRuntime.submitLogin();
      },
      submitSignup: () => {
        void args.authSessionRuntime.submitSignup();
      }
    }));
    return;
  }

  bindAuthenticatedEvents(createAuthenticatedHandlers({
    setHomeSection: (section) => {
      args.setState({
        ...args.getState(),
        homeMenuSection: section
      });
      if (section === "match") {
        args.authSessionRuntime.ensureAuthenticatedOnlineConnection();
        void args.authSessionRuntime.refreshPublicRooms();
      }
      args.render();
    },
    backHome: () => {
      args.setState({
        ...args.getState(),
        homeMenuSection: "home"
      });
      args.render();
    },
    updateOnlineField: (field, value) => {
      args.setState(updateOnlineFieldValue(args.getState(), field, value));
    },
    logout: () => {
      void args.authSessionRuntime.logoutAuthenticatedUser();
    },
    createRoom: () => {
      args.onlineClient.sendOnlineRoomAction("create_room");
    },
    joinRoom: () => {
      args.onlineClient.sendOnlineRoomAction("join_room");
    },
    quickJoinRoom: (roomId) => {
      const currentState = args.getState();
      args.setState({
        ...currentState,
        online: {
          ...currentState.online,
          roomIdInput: roomId
        }
      });
      args.onlineClient.sendOnlineMessage({
        type: "join_room",
        roomId
      });
    },
    refreshPublicRooms: () => {
      void args.authSessionRuntime.refreshPublicRooms();
    },
    leaveRoom: () => {
      args.onlineClient.sendOnlineMessage({ type: "leave_room" });
    },
    getConnectedPlayer: args.getConnectedOnlineRoomPlayer,
    serverCapabilities: args.getState().online.serverCapabilities as ServerCapabilities | null,
    setOnlineError: (message) => {
      const currentState = args.getState();
      args.setState({
        ...currentState,
        online: {
          ...currentState.online,
          error: message
        }
      });
      args.render();
    },
    sendOnlineMessage: (message) => {
      args.onlineClient.sendOnlineMessage(message as ClientMessage);
    },
    displayNameInput: args.getState().online.displayNameInput,
    updateAuthMetaField: (field, value) => {
      args.setState(updateAuthFieldValue(args.getState(), field, value));
    },
    refreshAdminOverview: () => {
      void args.authSessionRuntime.fetchAdminOverview();
    },
    adjustAdminBalance: () => {
      void args.authSessionRuntime.adjustAdminBalance();
    },
    deleteRoom: (roomId) => {
      args.onlineClient.sendOnlineMessage({
        type: "delete_room",
        roomId
      });
      void args.authSessionRuntime.refreshPublicRooms();
    },
    adminStartRoom: (roomId) => {
      args.onlineClient.sendOnlineMessage({
        type: "admin_start_room",
        roomId
      });
      void args.authSessionRuntime.refreshPublicRooms();
    },
    getSyncedPlayState: (): PlayStateView | null => args.getState().online.syncedPlayState,
    resetLocalRoom: () => {
      args.setState(args.createAppState(args.getState().playerCount));
      args.render();
    },
    changePlayerCount: (value) => {
      args.setState(args.createAppState(value));
      args.render();
    },
    changeDealerInput: (playerId, targetField, value) => {
      const currentState = args.getState();
      const current = currentState.dealerInputs[playerId];
      if (current === undefined) {
        return;
      }

      args.setState({
        ...currentState,
        dealerInputs: {
          ...currentState.dealerInputs,
          [playerId]: {
            ...current,
            [targetField]: value
          }
        }
      });
    },
    autoDealer: () => {
      const currentState = args.getState();
      const nextInputs = { ...currentState.dealerInputs };
      for (const playerId of args.getDealerCandidates()) {
        nextInputs[playerId] = {
          month: args.randomBetween(1, 12),
          score: CARD_SCORES[args.randomBetween(0, CARD_SCORES.length - 1)]
        };
      }

      args.setState({
        ...currentState,
        dealerInputs: nextInputs
      });
      args.render();
    },
    resolveDealer: () => {
      const currentState = args.getState();
      if (currentState.setupState.phase !== "selecting_initial_dealer") {
        return;
      }

      const contenders = args.getDealerCandidates();
      const draws = contenders.map((playerId) => {
        const value = currentState.dealerInputs[playerId];
        return createDealerDraw(playerId, value.month, value.score);
      });

      const nextState = recordDealerDrawRound(currentState.setupState, { draws });
      const preparedSetupState =
        nextState.phase === "waiting_for_giveups"
          ? prepareGiveUpDealWithRedeal(
              nextState,
              () => shuffleDeck(createStandardDeck()),
              currentState.cutIndex
            )
          : nextState;
      const nextInputs = createDealerInputs(args.getCandidatesFromState(preparedSetupState));
      const nextLog = [...currentState.log];

      if (preparedSetupState.phase === "selecting_initial_dealer") {
        nextLog.unshift(`Dealer draw tied. Next contenders: ${args.getCandidatesFromState(preparedSetupState).join(", ")}`);
      } else if (preparedSetupState.phase === "waiting_for_giveups") {
        nextLog.unshift(`Dealer resolved: ${preparedSetupState.dealerId}. Hands dealt for give-up decisions.`);
      } else {
        nextLog.unshift(`Dealer resolved: ${preparedSetupState.dealerId}`);
      }

      args.setState({
        ...currentState,
        room: preparedSetupState.room,
        setupState: preparedSetupState,
        dealtState: null,
        playState: null,
        dealerInputs: nextInputs,
        log: nextLog.slice(0, 10)
      });
      args.render();
    },
    choosePlay: () => {
      args.localRoundActions.resolveGiveUp(false);
    },
    chooseGiveUp: () => {
      args.localRoundActions.resolveGiveUp(true);
    },
    changeCutIndex: (value) => {
      const currentState = args.getState();
      args.setState({
        ...currentState,
        cutIndex: Number.isNaN(value) ? 0 : Math.max(0, Math.min(47, value))
      });
    },
    dealLocalCards: args.localRoundActions.dealCards,
    prepareLocalNextRound: args.localRoundActions.prepareNextRound
  }));
}
