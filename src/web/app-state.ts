import type {
  AdminOverview,
  AuthenticatedUserView,
  PlayStateView,
  PublicRoomSummary,
  RoundHistoryEntry,
  RoomView,
  RoundSetupStateView,
  ServerCapabilities
} from "../server/protocol.js";
import {
  createRoundSetup,
  createRoom,
  joinRoom,
  sortPlayersBySeat,
  type CardScore,
  type DealtRoundState,
  type PlayState,
  type RoomState,
  type RoundSetupState
} from "../index.js";
import type { PersistedAuthSession, PersistedOnlineSession } from "./online-session.js";

export interface DealerInput {
  month: number;
  score: CardScore;
}

export type OnlineConnectionStatus = "disconnected" | "connecting" | "connected";
export type HomeMenuSection = "home" | "match" | "spectate" | "settings";
export type AuthStatus = "checking" | "anonymous" | "authenticated";

export interface AuthState {
  status: AuthStatus;
  sessionToken: string | null;
  user: AuthenticatedUserView | null;
  loginUserId: string;
  loginPassword: string;
  signupUserId: string;
  signupName: string;
  signupPassword: string;
  activeForm: "login" | "signup";
  watchRoomIdInput: string;
  adminBalanceUserId: string;
  adminBalanceAmount: string;
  adminOverview: AdminOverview | null;
  error: string | null;
  busy: boolean;
}

export interface OnlineLobbyState {
  serverUrl: string;
  playerId: string;
  displayNameInput: string;
  roomIdInput: string;
  shouldReconnect: boolean;
  connectionStatus: OnlineConnectionStatus;
  connectedPlayerId: string | null;
  syncedRoom: RoomView | null;
  syncedSetupState: RoundSetupStateView | null;
  syncedPlayState: PlayStateView | null;
  syncedActionLog: string[];
  roundHistory: RoundHistoryEntry[];
  availableRooms: PublicRoomSummary[];
  serverCapabilities: ServerCapabilities | null;
  protocolVersion: number | null;
  socket: WebSocket | null;
  error: string | null;
}

export interface AppState {
  auth: AuthState;
  playerCount: number;
  room: RoomState;
  setupState: RoundSetupState;
  dealtState: DealtRoundState | null;
  playState: PlayState | null;
  homeMenuSection: HomeMenuSection;
  online: OnlineLobbyState;
  dealerInputs: Record<string, DealerInput>;
  cutIndex: number;
  log: string[];
}

export const CARD_SCORES: CardScore[] = [0, 5, 10, 20];
export const ONLINE_SESSION_STORAGE_KEY = "minhwatu.online-session.v1";
export const AUTH_SESSION_STORAGE_KEY = "minhwatu.auth-session.v1";
export const ONLINE_RECONNECT_DELAY_MS = 1_500;

export function createInitialAuthState(persistedSession: PersistedAuthSession | null): AuthState {
  return {
    status: persistedSession === null ? "anonymous" : "checking",
    sessionToken: persistedSession?.sessionToken ?? null,
    user: null,
    loginUserId: "",
    loginPassword: "",
    signupUserId: "",
    signupName: "",
    signupPassword: "",
    activeForm: "login",
    watchRoomIdInput: "alpha",
    adminBalanceUserId: "",
    adminBalanceAmount: "",
    adminOverview: null,
    error: null,
    busy: false
  };
}

export function createInitialOnlineState(
  persistedSession: PersistedOnlineSession | null,
  defaultServerUrl: string
): OnlineLobbyState {
  return {
    serverUrl: persistedSession?.serverUrl ?? defaultServerUrl,
    playerId: persistedSession?.playerId ?? `player-${Math.random().toString(36).slice(2, 6)}`,
    displayNameInput: persistedSession?.displayNameInput ?? "Player",
    roomIdInput: persistedSession?.roomIdInput ?? "alpha",
    shouldReconnect: persistedSession?.shouldReconnect ?? false,
    connectionStatus: "disconnected",
    connectedPlayerId: null,
    syncedRoom: null,
    syncedSetupState: null,
    syncedPlayState: null,
    syncedActionLog: [],
    roundHistory: [],
    availableRooms: [],
    serverCapabilities: null,
    protocolVersion: null,
    socket: null,
    error: null
  };
}

export function createDealerInputs(playerIds: readonly string[]): Record<string, DealerInput> {
  return Object.fromEntries(
    playerIds.map((playerId, index) => [
      playerId,
      {
        month: index + 1,
        score: 0
      }
    ])
  );
}

export function createInitialState(playerCount: number, authState: AuthState, onlineState: OnlineLobbyState): AppState {
  let room = createRoom(`room-${playerCount}`);

  for (let index = 1; index <= playerCount; index += 1) {
    room = joinRoom(room, `p${index}`);
  }

  return {
    auth: authState,
    playerCount,
    room,
    setupState: createRoundSetup(room),
    dealtState: null,
    playState: null,
    homeMenuSection: "home",
    online: onlineState,
    dealerInputs: createDealerInputs(sortPlayersBySeat(room.players).map((player) => player.playerId)),
    cutIndex: 0,
    log: [`Room initialized with ${playerCount} seated players.`]
  };
}
