import type { AuthenticatedUserView } from "../server/protocol.js";
import type { AppState } from "./app-state.js";

import { createInitialAuthState } from "./app-state.js";
import { restoreAuthSessionRequest } from "./auth-helpers.js";
import { createIdleSessionController } from "./idle-session-controller.js";
import {
  adjustAdminBalanceOnServer,
  fetchPublicRoomsFromServer,
  fetchAdminOverviewFromServer,
  logoutSessionOnServer,
  submitAuthRequestToServer
} from "./auth-api.js";
import { persistAuthSession as persistAuthSessionView } from "./online-session.js";

interface CreateAuthSessionRuntimeArgs {
  getState: () => AppState;
  setState: (nextState: AppState) => void;
  render: () => void;
  localStorage: Storage;
  activityTarget: Document;
  authSessionStorageKey: string;
  connectOnlineServer: () => void;
  disconnectOnlineServer: (logMessage: string) => void;
  maybeAutoReconnectOnlineServer: () => void;
  refreshPublicRooms: () => Promise<void>;
  idleTimeoutMs?: number;
}

const DEFAULT_IDLE_LOGOUT_MS = 60 * 60 * 1000;

export function createAuthSessionRuntime(args: CreateAuthSessionRuntimeArgs) {
  const idleSessionController = createIdleSessionController({
    target: args.activityTarget,
    idleTimeoutMs: args.idleTimeoutMs ?? DEFAULT_IDLE_LOGOUT_MS,
    onIdle: () => {
      void logoutAuthenticatedUser("Logged out due to inactivity.");
    }
  });

  function persistAuthSession(): void {
    persistAuthSessionView(args.localStorage, args.authSessionStorageKey, args.getState().auth.sessionToken);
  }

  async function restoreAuthSession(): Promise<void> {
    const currentState = args.getState();
    if (currentState.auth.sessionToken === null) {
      return;
    }

    try {
      const payload = await restoreAuthSessionRequest(currentState.auth.sessionToken);
      applyAuthenticatedUser(payload.user, currentState.auth.sessionToken);
      args.maybeAutoReconnectOnlineServer();
      void args.refreshPublicRooms();
    } catch {
      idleSessionController.stop();
      args.setState({
        ...currentState,
        auth: {
          ...currentState.auth,
          status: "anonymous",
          sessionToken: null,
          user: null,
          error: null,
          busy: false
        },
        online: {
          ...currentState.online,
          availableRooms: []
        }
      });
      args.render();
    }
  }

  function applyAuthenticatedUser(user: AuthenticatedUserView, sessionToken: string): void {
    const currentState = args.getState();
    idleSessionController.start();
    args.setState({
      ...currentState,
      auth: {
        ...currentState.auth,
        status: "authenticated",
        sessionToken,
        user,
        error: null,
        busy: false
      },
      online: {
        ...currentState.online,
        playerId: user.userId,
        displayNameInput: user.name
      }
    });
    args.render();
    ensureAuthenticatedOnlineConnection();
    void args.refreshPublicRooms();
    if (user.role === "admin") {
      void fetchAdminOverview();
    }
  }

  function ensureAuthenticatedOnlineConnection(): void {
    const currentState = args.getState();
    if (currentState.auth.status !== "authenticated" || currentState.auth.user === null) {
      return;
    }

    if (currentState.online.connectionStatus !== "disconnected") {
      return;
    }

    args.connectOnlineServer();
  }

  async function submitLogin(): Promise<void> {
    const currentState = args.getState();
    await submitAuthRequest("/api/auth/login", {
      userId: currentState.auth.loginUserId,
      password: currentState.auth.loginPassword
    });
  }

  async function submitSignup(): Promise<void> {
    const currentState = args.getState();
    await submitAuthRequest("/api/auth/signup", {
      userId: currentState.auth.signupUserId,
      name: currentState.auth.signupName,
      password: currentState.auth.signupPassword
    });
  }

  async function submitAuthRequest(path: string, payload: Record<string, string>): Promise<void> {
    const currentState = args.getState();
    args.setState({
      ...currentState,
      auth: {
        ...currentState.auth,
        busy: true,
        error: null
      }
    });
    args.render();

    try {
      const data = await submitAuthRequestToServer(path, payload);
      applyAuthenticatedUser(data.user, data.token);
      args.maybeAutoReconnectOnlineServer();
    } catch (error) {
      const latestState = args.getState();
      args.setState({
        ...latestState,
        auth: {
          ...latestState.auth,
          busy: false,
          error: error instanceof Error ? error.message : "Authentication failed."
        }
      });
      args.render();
    }
  }

  async function logoutAuthenticatedUser(reason = "Logged out."): Promise<void> {
    const currentState = args.getState();
    const token = currentState.auth.sessionToken;
    idleSessionController.stop();
    args.disconnectOnlineServer(reason);
    if (token !== null) {
      await logoutSessionOnServer(token);
    }

    args.setState({
      ...args.getState(),
      auth: {
        ...createInitialAuthState(null),
        status: "anonymous"
      },
      online: {
        ...args.getState().online,
        availableRooms: []
      }
    });
    args.render();
  }

  async function fetchAdminOverview(): Promise<void> {
    const currentState = args.getState();
    if (currentState.auth.user?.role !== "admin" || currentState.auth.sessionToken === null) {
      return;
    }

    const data = await fetchAdminOverviewFromServer(currentState.auth.sessionToken);
    args.setState({
      ...currentState,
      auth: {
        ...currentState.auth,
        user: data.viewer,
        adminOverview: data.overview
      }
    });
    args.render();
  }

  async function adjustAdminBalance(): Promise<void> {
    const currentState = args.getState();
    if (currentState.auth.user?.role !== "admin" || currentState.auth.sessionToken === null) {
      return;
    }

    const data = await adjustAdminBalanceOnServer(
      currentState.auth.sessionToken,
      currentState.auth.adminBalanceUserId,
      currentState.auth.adminBalanceAmount
    );

    args.setState({
      ...currentState,
      auth: {
        ...currentState.auth,
        user: data.viewer,
        adminOverview: data.overview,
        adminBalanceAmount: ""
      }
    });
    args.render();
  }

  async function refreshPublicRooms(): Promise<void> {
    const currentState = args.getState();
    if (currentState.auth.sessionToken === null) {
      args.setState({
        ...currentState,
        online: {
          ...currentState.online,
          availableRooms: []
        }
      });
      args.render();
      return;
    }

    try {
      const rooms = await fetchPublicRoomsFromServer(currentState.auth.sessionToken);
      const latestState = args.getState();
      args.setState({
        ...latestState,
        online: {
          ...latestState.online,
          availableRooms: rooms
        }
      });
      args.render();
    } catch {
      const latestState = args.getState();
      args.setState({
        ...latestState,
        online: {
          ...latestState.online,
          availableRooms: []
        }
      });
      args.render();
    }
  }

  return {
    persistAuthSession,
    restoreAuthSession,
    applyAuthenticatedUser,
    ensureAuthenticatedOnlineConnection,
    submitLogin,
    submitSignup,
    logoutAuthenticatedUser,
    fetchAdminOverview,
    adjustAdminBalance,
    refreshPublicRooms
  };
}
