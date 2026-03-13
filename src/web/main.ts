import "../web/styles.css";
import type {
  AdminOverview,
  AuthenticatedUserView,
  ClientMessage,
  PlayStateView,
  PublicRoomSummary,
  RoundHistoryEntry,
  RoomView,
  RoundSetupStateView,
  ServerCapabilities,
  ServerMessage,
  VisibleCard
} from "../server/protocol.js";

import {
  createDealerDraw,
  createPlayState,
  createNextRoundSetup,
  createRoundSetup,
  createStandardDeck,
  declareGiveUp,
  determineNextDealer,
  evaluateInitialDealerRounds,
  flipDrawCard,
  joinRoom,
  prepareFinalFiveDealWithRedeal,
  prepareGiveUpDealWithRedeal,
  recordDealerDrawRound,
  resolveDrawChoice,
  resolveHandChoice,
  scoreRound,
  selectHandCard,
  shuffleDeck,
  sortPlayersBySeat,
  type CardId,
  type CardScore,
  type PlayState,
  type DealtRoundState,
  type RoomState,
  type RoundSetupState,
  createRoom
} from "../index.js";

interface DealerInput {
  month: number;
  score: CardScore;
}

type OnlineConnectionStatus = "disconnected" | "connecting" | "connected";
type HomeMenuSection = "home" | "match" | "spectate" | "settings";
type AuthStatus = "checking" | "anonymous" | "authenticated";

interface AuthState {
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

interface OnlineLobbyState {
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
  resultModalEntry: RoundHistoryEntry | null;
  lastOpenedResultId: string | null;
  availableRooms: PublicRoomSummary[];
  serverCapabilities: ServerCapabilities | null;
  protocolVersion: number | null;
  socket: WebSocket | null;
  error: string | null;
}

interface AppState {
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

interface PersistedOnlineSession {
  serverUrl: string;
  playerId: string;
  displayNameInput: string;
  roomIdInput: string;
  shouldReconnect: boolean;
}

interface PersistedAuthSession {
  sessionToken: string;
}

const CARD_SCORES: CardScore[] = [0, 5, 10, 20];
const ONLINE_SESSION_STORAGE_KEY = "minhwatu.online-session.v1";
const AUTH_SESSION_STORAGE_KEY = "minhwatu.auth-session.v1";
const ONLINE_RECONNECT_DELAY_MS = 1_500;
const AUTH_IDLE_TIMEOUT_MS = 15 * 60_000;
const AUTH_ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "mousedown"] as const;
const appRoot = document.querySelector<HTMLDivElement>("#app");
let pendingOnlineReconnectTimer: number | null = null;
let pendingAuthIdleTimer: number | null = null;

if (appRoot === null) {
  throw new Error("App root element was not found.");
}

let state = createInitialState(7);
render();
initializeActivityTracking();
restoreAuthSession();

function createInitialState(playerCount: number): AppState {
  let room = createRoom(`room-${playerCount}`);

  for (let index = 1; index <= playerCount; index += 1) {
    room = joinRoom(room, `p${index}`);
  }

  return {
    auth: createInitialAuthState(),
    playerCount,
    room,
    setupState: createRoundSetup(room),
    dealtState: null,
    playState: null,
    homeMenuSection: "home",
    online: createInitialOnlineState(),
    dealerInputs: createDealerInputs(sortPlayersBySeat(room.players).map((player) => player.playerId)),
    cutIndex: 0,
    log: [`Room initialized with ${playerCount} seated players.`]
  };
}

function createInitialAuthState(): AuthState {
  const persistedSession = loadPersistedAuthSession();
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

function createInitialOnlineState(): OnlineLobbyState {
  const persistedSession = loadPersistedOnlineSession();
  return {
    serverUrl: persistedSession?.serverUrl ?? getDefaultServerUrl(),
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
    resultModalEntry: null,
    lastOpenedResultId: null,
    availableRooms: [],
    serverCapabilities: null,
    protocolVersion: null,
    socket: null,
    error: null
  };
}

function loadPersistedAuthSession(): PersistedAuthSession | null {
  try {
    const rawValue = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (rawValue === null) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<PersistedAuthSession>;
    if (typeof parsed.sessionToken !== "string") {
      return null;
    }

    return {
      sessionToken: parsed.sessionToken
    };
  } catch {
    return null;
  }
}

function getDefaultServerUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const hostname = window.location.hostname === "" ? "localhost" : window.location.hostname;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const portSegment = isLocalHost ? ":8080" : window.location.port === "" ? "" : `:${window.location.port}`;
  return `${protocol}://${hostname}${portSegment}/ws`;
}

function loadPersistedOnlineSession(): PersistedOnlineSession | null {
  try {
    const rawValue = window.localStorage.getItem(ONLINE_SESSION_STORAGE_KEY);
    if (rawValue === null) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<PersistedOnlineSession>;
    if (
      typeof parsed.serverUrl !== "string" ||
      typeof parsed.playerId !== "string" ||
      typeof parsed.displayNameInput !== "string" ||
      typeof parsed.roomIdInput !== "string" ||
      typeof parsed.shouldReconnect !== "boolean"
    ) {
      return null;
    }

    return {
      serverUrl: parsed.serverUrl,
      playerId: parsed.playerId,
      displayNameInput: parsed.displayNameInput,
      roomIdInput: parsed.roomIdInput,
      shouldReconnect: parsed.shouldReconnect
    };
  } catch {
    return null;
  }
}

function persistOnlineSession(): void {
  const persistedState: PersistedOnlineSession = {
    serverUrl: state.online.serverUrl,
    playerId: state.online.playerId,
    displayNameInput: state.online.displayNameInput,
    roomIdInput: state.online.roomIdInput,
    shouldReconnect: state.online.shouldReconnect
  };

  window.localStorage.setItem(ONLINE_SESSION_STORAGE_KEY, JSON.stringify(persistedState));
}

function createDealerInputs(playerIds: readonly string[]): Record<string, DealerInput> {
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

function render(): void {
  persistOnlineSession();
  persistAuthSession();

  if (state.auth.status !== "authenticated" || state.auth.user === null) {
    appRoot.innerHTML = renderAuthLanding();
    bindEvents();
    return;
  }

  appRoot.innerHTML = `
    <div class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">${getHeroEyebrow()}</p>
          <h1>${getHeroTitle()}</h1>
          <p class="lede">${getHeroLede()}</p>
        </div>
        <div class="hero-stats">
          <div class="stat-card">
            <span class="stat-label">Phase</span>
            <strong>${getPrimaryPhaseLabel()}</strong>
          </div>
          <div class="stat-card">
            <span class="stat-label">${getSecondaryStatLabel()}</span>
            <strong>${getSecondaryStatValue()}</strong>
          </div>
        </div>
      </header>

      <main class="workspace ${hasActiveOnlineRoom() ? "workspace-live workspace-live-room" : "workspace-home"}">
        <section class="workspace-main">
          ${renderMainColumn()}
        </section>
        ${
          !hasActiveOnlineRoom()
            ? `<aside class="workspace-rail workspace-rail-right">
                ${renderRightRail()}
              </aside>`
            : ""
        }
      </main>
    </div>
    ${renderRoundResultModal()}
  `;

  bindEvents();
}

function renderAuthLanding(): string {
  const loginSelected = state.auth.activeForm === "login";
  return `
    <div class="shell auth-shell">
      <main class="auth-layout">
        <section class="panel board auth-stage">
          <div class="auth-stage-copy">
            <span class="eyebrow">Minhwatu Online</span>
            <h1>로그인 후 입장</h1>
            <p class="lede">사이트 첫 진입은 항상 로그인 화면으로 시작합니다. 로그인 또는 회원가입을 완료해야만 메인 로비와 게임에 접근할 수 있습니다.</p>
            <div class="chips">
              <span class="chip">5-7인 온라인</span>
              <span class="chip">실시간 관전</span>
              <span class="chip">즉시 잔고 반영</span>
            </div>
          </div>
        </section>
        <section class="panel auth-panel">
          <div class="auth-tab-row">
            <button class="secondary-button ${loginSelected ? "auth-tab-active" : ""}" id="auth-show-login">로그인</button>
            <button class="secondary-button ${loginSelected ? "" : "auth-tab-active"}" id="auth-show-signup">회원가입</button>
          </div>
          ${
            state.auth.error === null
              ? ""
              : `<p class="panel-copy"><strong>오류:</strong> ${state.auth.error}</p>`
          }
          ${
            loginSelected
              ? `
                <div class="auth-form">
                  <label class="field">
                    <span>ID</span>
                    <input id="auth-login-user-id" type="text" value="${state.auth.loginUserId}" />
                  </label>
                  <label class="field">
                    <span>비밀번호</span>
                    <input id="auth-login-password" type="password" value="${state.auth.loginPassword}" />
                  </label>
                  <button id="auth-login-submit" class="primary-button" ${state.auth.busy ? "disabled" : ""}>로그인</button>
                </div>
              `
              : `
                <div class="auth-form">
                  <label class="field">
                    <span>ID</span>
                    <input id="auth-signup-user-id" type="text" value="${state.auth.signupUserId}" />
                  </label>
                  <label class="field">
                    <span>이름</span>
                    <input id="auth-signup-name" type="text" value="${state.auth.signupName}" />
                  </label>
                  <label class="field">
                    <span>비밀번호</span>
                    <input id="auth-signup-password" type="password" value="${state.auth.signupPassword}" />
                  </label>
                  <button id="auth-signup-submit" class="primary-button" ${state.auth.busy ? "disabled" : ""}>회원가입</button>
                </div>
              `
          }
          <p class="panel-copy auth-footer-note">Account and balance rules are enforced on the server. Client access is gated behind a valid session token.</p>
        </section>
      </main>
    </div>
  `;
}

function renderMainColumn(): string {
  if (!hasActiveOnlineRoom()) {
    return renderHomeMenu();
  }

  return renderActiveRoomWorkspace();
}

function renderActiveRoomWorkspace(): string {
  const room = state.online.syncedRoom;
  const titleOwner = state.auth.user?.name ?? "Player";
  const isFocusedPlay = state.online.syncedPlayState !== null;
  const activeTab =
    state.online.syncedPlayState !== null
      ? "Game"
      : state.online.syncedSetupState !== null
        ? "Match"
        : "Room";

  return `
    <section class="room-studio ${isFocusedPlay ? "room-studio-focus" : ""}">
      ${isFocusedPlay ? "" : `
      <aside class="room-player-column">
        ${renderOnlineRoomMetaPanel()}
      </aside>
      `}
      <section class="room-main-column">
        <section class="panel room-console-shell">
          <div class="room-console-header">
            <div>
              <span class="eyebrow">Private Room</span>
              <h2>${titleOwner}'s Room</h2>
              <p class="panel-copy">Authoritative multiplayer room ${room?.roomId ?? "idle"} with synchronized setup and live turn control.</p>
            </div>
            <div class="chips board-header-chips">
              <span class="chip">Players ${room?.players.length ?? 0}</span>
              <span class="chip">Phase ${state.online.syncedPlayState?.phase ?? state.online.syncedSetupState?.phase ?? "idle"}</span>
            </div>
          </div>
          <div class="room-console-tabs ${isFocusedPlay ? "room-console-tabs-hidden" : ""}" aria-hidden="true">
            <span class="room-console-tab ${activeTab === "Room" ? "active" : ""}">Room</span>
            <span class="room-console-tab ${activeTab === "Match" ? "active" : ""}">Match</span>
            <span class="room-console-tab ${activeTab === "Game" ? "active" : ""}">Game</span>
          </div>
          <div class="room-console-body ${isFocusedPlay ? "room-console-body-focus" : ""}">
            <div class="live-table-column">
              ${renderTable()}
            </div>
            ${isFocusedPlay ? "" : `
            <aside class="live-command-column">
              ${renderOnlineLobby()}
            </aside>
            `}
          </div>
        </section>
      </section>
    </section>
  `;
}

function renderRightRail(): string {
  return renderOnlineRoomMetaPanel();
}

function hasActiveOnlineRoom(): boolean {
  return state.online.syncedRoom !== null;
}

function renderHomeMenu(): string {
  if (state.homeMenuSection === "home") {
    return renderHomeMenuRoot();
  }

  return renderHomeMenuSectionPage();
}

function renderHomeMenuRoot(): string {
  const room = state.online.syncedRoom;
  const isAdminViewer = false;
  const connectionLabel =
    state.online.connectionStatus === "connected"
      ? "CONNECTED"
      : state.online.connectionStatus === "connecting"
        ? "CONNECTING"
        : "OFFLINE";

  return `
    <section class="panel board home-menu-shell home-launch-shell">
      <div class="home-launch-grid">
        <div class="home-launch-main">
          <section class="home-showcase-card">
            <div class="home-showcase-header">
              <div>
                <span class="eyebrow">Minhwatu Network</span>
                <p class="home-showcase-kicker">Five-player online table with server-authoritative flow</p>
              </div>
              <span class="home-showcase-badge">${connectionLabel}</span>
            </div>
            <div class="home-showcase-copy">
              <h2>민화투 온라인</h2>
              <p class="panel-copy">방 생성, 준비, 기권, 배패, 실시간 턴 진행까지 한 흐름으로 이어지는 멀티플레이 클라이언트입니다.</p>
            </div>
            <div class="home-showcase-metrics">
              <article class="home-metric-card">
                <span class="mini-label">Wallet</span>
                <strong>${state.auth.user?.balance.toLocaleString() ?? "0"} KRW</strong>
              </article>
              <article class="home-metric-card">
                <span class="mini-label">Identity</span>
                <strong>${state.auth.user?.name ?? "Player"}</strong>
              </article>
              <article class="home-metric-card">
                <span class="mini-label">Phase</span>
                <strong>${room === null ? "Lobby Idle" : "Room Live"}</strong>
              </article>
            </div>
            <div class="home-showcase-strip">
              <span class="chip">Server ${state.online.serverUrl}</span>
              <span class="chip">Room ${room?.roomId ?? "idle"}</span>
              <span class="chip">Players ${room?.players.length ?? 0}</span>
            </div>
          </section>
          <section class="home-mode-grid">
            ${
              isAdminViewer
                ? ""
                : renderHomeMenuButton("match", "VS", "대전", "온라인 방에 들어가 준비를 맞추고 바로 플레이를 시작합니다.")
            }
            ${renderHomeMenuButton("spectate", "OBS", "관전", "현재 방 상태와 관전자 동작을 확인합니다.")}
            ${renderHomeMenuButton("settings", "SYS", "설정", "서버 주소, 플레이어 ID, 저장된 연결 상태를 점검합니다.")}
          </section>
        </div>
        ${renderHomeStatusRail()}
      </div>
    </section>
  `;

  return `
    <section class="panel board home-menu-shell">
      <div class="home-menu-stage">
        <div class="home-menu-frame">
          <div class="home-menu-door">
            <div class="home-menu-center">
              <div class="home-menu-kicker">Minhwatu Online</div>
              <div class="home-menu-title-block">
                <h2>민화투</h2>
                <p class="panel-copy">들어갈 메뉴를 선택하세요.</p>
              </div>
              <div class="home-menu-wheel">
                ${renderHomeMenuButton("match", "대전", "온라인 방에 입장하고 대전을 시작합니다.")}
                ${renderHomeMenuButton("spectate", "관전", "관전자 동작과 방 상태를 확인합니다.")}
                ${renderHomeMenuButton("settings", "설정", "연결 기본값과 현재 상태를 확인합니다.")}
              </div>
            </div>
          </div>
        </div>
        <div class="home-menu-bottom-bar">
          <span class="chip">대전: 온라인 방 입장</span>
          <span class="chip">관전: 상태/시야 확인</span>
          <span class="chip">설정: 연결 기본값 확인</span>
        </div>
      </div>
    </section>
  `;
}

function renderHomeMenuSectionPage(): string {
  const meta = getHomeSectionMeta(state.homeMenuSection);

  return `
    <section class="panel board home-menu-shell home-menu-section-shell">
      <div class="home-section-layout">
        <div class="home-section-main">
          <div class="home-section-banner ${meta.toneClass}">
            <div class="home-section-banner-top">
              <button class="secondary-button home-back-button" id="home-back-button">Back</button>
              <span class="home-section-tag">${meta.tag}</span>
            </div>
            <div class="home-section-banner-copy">
              <span class="eyebrow">${meta.eyebrow}</span>
              <h2>${meta.title}</h2>
              <p class="panel-copy">${meta.description}</p>
            </div>
          </div>
          <div class="home-menu-dock home-menu-section-dock">
            ${renderHomeMenuPanel()}
          </div>
        </div>
        ${renderHomeStatusRail("compact")}
      </div>
    </section>
  `;

  return `
    <section class="panel board home-menu-shell home-menu-section-shell">
      <div class="home-menu-stage">
        <div class="home-section-header">
          <button class="secondary-button home-back-button" id="home-back-button">Back</button>
          <div>
            <span class="eyebrow">Main Menu</span>
            <h2>${getHomeSectionTitle()}</h2>
            <p class="panel-copy">${getHomeSectionDescription()}</p>
          </div>
        </div>
        <div class="home-menu-dock home-menu-section-dock">
          ${renderHomeMenuPanel()}
        </div>
      </div>
    </section>
  `;
}

function renderHomeMenuButton(
  section: HomeMenuSection,
  markOrLabel: string,
  labelOrDescription: string,
  description?: string
): string {
  const meta = getHomeSectionMeta(section);
  const mark = description === undefined ? markOrLabel.slice(0, 3).toUpperCase() : markOrLabel;
  const label = description === undefined ? markOrLabel : labelOrDescription;
  const body = description === undefined ? labelOrDescription : description;

  return `
    <button
      class="home-menu-button ${meta.toneClass} ${state.homeMenuSection === section ? "active" : ""}"
      data-home-menu-section="${section}"
      title="${body}"
    >
      <span class="home-menu-mark">${mark}</span>
      <span class="home-menu-copy">
        <strong>${label}</strong>
        <span>${body}</span>
      </span>
      <span class="home-menu-enter">ENTER</span>
    </button>
  `;

  return `
    <button
      class="home-menu-button ${state.homeMenuSection === section ? "active" : ""}"
      data-home-menu-section="${section}"
      title="${description}"
    >
      <span>${label}</span>
    </button>
  `;
}

function renderHomeMenuPanel(): string {
  switch (state.homeMenuSection) {
    case "spectate":
      return renderSpectateMenuPanel();
    case "settings":
      return renderSettingsMenuPanel();
    case "home":
      return "";
    case "match":
    default:
      return renderMatchMenuPanel();
  }
}

function getOnlineControlState() {
  const isConnected = state.online.connectionStatus === "connected";
  const syncedSetupState = state.online.syncedSetupState;
  const syncedPlayState = state.online.syncedPlayState;
  const isAdmin = state.auth.user?.role === "admin";
  const adminRoomId = state.online.syncedRoom?.roomId ?? null;
  const connectedPlayer = getConnectedOnlineRoomPlayer();
  const isHost = connectedPlayer !== null && state.online.syncedRoom?.hostPlayerId === connectedPlayer.playerId;
  const supportsReadyToggle = onlineServerSupportsReadyToggle();
  const supportsDisplayName = onlineServerSupportsDisplayName();
  const supportsHostTransfer = onlineServerSupportsHostTransfer();
  const supportsKickPlayer = onlineServerSupportsKickPlayer();
  const supportsBots = onlineServerSupportsBots();
  const supportsDeleteRoom = onlineServerSupportsDeleteRoom();
  const supportsAdminForceStart = onlineServerSupportsAdminForceStart();
  const supportsAdminProxyPlay = onlineServerSupportsAdminProxyPlay();
  const hasActiveSyncedRound = syncedSetupState !== null || syncedPlayState !== null;
  const canToggleReady =
    isConnected &&
    supportsReadyToggle &&
    connectedPlayer !== null &&
    syncedSetupState === null &&
    syncedPlayState === null;
  const canStartByRoster =
    state.online.syncedRoom !== null &&
    state.online.syncedRoom.players.length >= 5 &&
    state.online.syncedRoom.players.length <= 7 &&
    state.online.syncedRoom.players.every((player) => player.isReady && player.isConnected);
  const disconnectedPlayers =
    state.online.syncedRoom?.players.filter((player) => !player.isConnected).map((player) => getOnlinePlayerLabel(player.playerId)) ?? [];
  const notReadyPlayers =
    state.online.syncedRoom?.players.filter((player) => !player.isReady).map((player) => getOnlinePlayerLabel(player.playerId)) ?? [];
  const canStartRoundSetup =
    isConnected && isHost && canStartByRoster && syncedSetupState === null && syncedPlayState === null;
  const canAdminForceStartRoundSetup =
    isConnected &&
    isAdmin &&
    supportsAdminForceStart &&
    adminRoomId !== null &&
    syncedSetupState === null &&
    syncedPlayState === null &&
    state.online.syncedRoom !== null &&
    state.online.syncedRoom.players.length >= 5 &&
    state.online.syncedRoom.players.length <= 7;
  const canAutoResolveDealer = syncedSetupState?.phase === "selecting_initial_dealer";
  const canAdminAutoResolveDealer =
    isConnected && isAdmin && supportsAdminForceStart && adminRoomId !== null && syncedSetupState?.phase === "selecting_initial_dealer";
  const canDeclareGiveUp =
    syncedSetupState?.phase === "waiting_for_giveups" &&
    syncedSetupState.currentPlayerId === state.online.connectedPlayerId;
  const canAdminDeclareGiveUp =
    isConnected &&
    isAdmin &&
    supportsAdminProxyPlay &&
    adminRoomId !== null &&
    syncedSetupState?.phase === "waiting_for_giveups";
  const canDealCards = syncedSetupState?.phase === "ready_to_play";
  const canAdminDealCards =
    isConnected && isAdmin && supportsAdminForceStart && adminRoomId !== null && syncedSetupState?.phase === "ready_to_play";
  const canFlipDrawCard =
    syncedPlayState?.phase === "awaiting_draw_flip" &&
    syncedPlayState.currentPlayerId === state.online.connectedPlayerId;
  const canAdminFlipDrawCard =
    isConnected &&
    isAdmin &&
    supportsAdminProxyPlay &&
    adminRoomId !== null &&
    syncedPlayState?.phase === "awaiting_draw_flip";
  const canPrepareNextRound = syncedPlayState?.phase === "completed";
  const canAdminPrepareNextRound =
    isConnected && isAdmin && supportsAdminForceStart && adminRoomId !== null && syncedPlayState?.phase === "completed";
  const canAddTestBot =
    isConnected &&
    isHost &&
    supportsBots &&
    state.online.syncedRoom !== null &&
    !hasActiveSyncedRound &&
    state.online.syncedRoom.players.length < 7;
  const canChangeRooms = isConnected && !hasActiveSyncedRound;
  const canLeaveRoom =
    state.online.syncedRoom !== null &&
    (!hasActiveSyncedRound || syncedPlayState?.phase === "completed");
  const canDeleteCurrentRoom =
    isConnected && isAdmin && supportsDeleteRoom && adminRoomId !== null;
  const canAdminProxyCurrentTurn =
    isConnected &&
    isAdmin &&
    supportsAdminProxyPlay &&
    adminRoomId !== null &&
    syncedPlayState !== null &&
    syncedPlayState.phase !== "completed";
  const viewerMode =
    state.online.syncedRoom === null ? "idle" : connectedPlayer === null ? "spectator" : connectedPlayer.role;
  const showRoomExitActions = state.online.syncedRoom !== null;
  const primaryMatchActionLabel =
    canPrepareNextRound
      ? "Prepare Next Round"
      : canFlipDrawCard
        ? "Flip Draw Card"
        : canAdminFlipDrawCard
          ? "Admin Flip Draw"
        : canDealCards
          ? "Deal Cards"
          : canAdminDealCards
            ? "Admin Deal Cards"
          : canAutoResolveDealer
            ? "Resolve Dealer"
            : canAdminAutoResolveDealer
              ? "Admin Resolve Dealer"
            : canStartRoundSetup
              ? "Start Setup"
              : canAdminForceStartRoundSetup
                ? "Admin Force Start"
              : canDeclareGiveUp
                ? "Choose Play Or Give Up"
                : canAdminDeclareGiveUp
                  ? "Admin Choose Give Up"
                : "Waiting";
  const phaseHint =
    canPrepareNextRound
      ? "The round is complete. Move the table directly into the next setup."
      : canAdminPrepareNextRound
        ? "Admin can advance this room into the next synchronized setup."
      : canFlipDrawCard
        ? "Your draw step is waiting for an explicit flip."
        : canAdminFlipDrawCard
          ? "Admin can flip the draw pile on behalf of the current player."
        : canDealCards
          ? "The final five are locked. Reveal or deal the table."
          : canAdminDealCards
            ? "Admin can deal the locked table immediately."
          : canDeclareGiveUp
            ? "The current chooser must decide whether to play or give up."
            : canAdminDeclareGiveUp
              ? "Admin can decide the give-up action for the current chooser."
            : canAutoResolveDealer
              ? "Dealer draw inputs are ready. Resolve the starting dealer."
              : canAdminAutoResolveDealer
                ? "Admin can resolve the dealer draw for this room."
              : canStartRoundSetup
                ? "Roster is ready. Start the synchronized round setup."
                : canAdminForceStartRoundSetup
                  ? "Admin can force this room to start even if ready or host locks are not met."
                : "Room actions and round actions will appear here when they become relevant.";

  return {
    isConnected,
    syncedSetupState,
    syncedPlayState,
    isAdmin,
    adminRoomId,
    connectedPlayer,
    isHost,
    supportsReadyToggle,
    supportsDisplayName,
    supportsHostTransfer,
    supportsKickPlayer,
    supportsBots,
    supportsDeleteRoom,
    supportsAdminForceStart,
    supportsAdminProxyPlay,
    hasActiveSyncedRound,
    canToggleReady,
    canStartByRoster,
    disconnectedPlayers,
    notReadyPlayers,
    canStartRoundSetup,
    canAdminForceStartRoundSetup,
    canAutoResolveDealer,
    canAdminAutoResolveDealer,
    canDeclareGiveUp,
    canAdminDeclareGiveUp,
    canDealCards,
    canAdminDealCards,
    canFlipDrawCard,
    canAdminFlipDrawCard,
    canPrepareNextRound,
    canAdminPrepareNextRound,
    canAddTestBot,
    canChangeRooms,
    canLeaveRoom,
    canDeleteCurrentRoom,
    canAdminProxyCurrentTurn,
    viewerMode,
    showRoomExitActions,
    primaryMatchActionLabel,
    phaseHint
  };
}

function persistAuthSession(): void {
  if (state.auth.sessionToken === null) {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      sessionToken: state.auth.sessionToken
    } satisfies PersistedAuthSession)
  );
}

function initializeActivityTracking(): void {
  for (const eventName of AUTH_ACTIVITY_EVENTS) {
    window.addEventListener(eventName, () => {
      resetAuthIdleTimer();
    });
  }
}

function clearAuthIdleTimer(): void {
  if (pendingAuthIdleTimer !== null) {
    window.clearTimeout(pendingAuthIdleTimer);
    pendingAuthIdleTimer = null;
  }
}

function resetAuthIdleTimer(): void {
  clearAuthIdleTimer();

  if (state.auth.status !== "authenticated" || state.auth.sessionToken === null) {
    return;
  }

  pendingAuthIdleTimer = window.setTimeout(() => {
    void logoutAuthenticatedUser("Logged out automatically after inactivity.");
  }, AUTH_IDLE_TIMEOUT_MS);
}

async function fetchPublicRooms(): Promise<void> {
  const sessionToken = state.auth.sessionToken;
  if (state.auth.status !== "authenticated" || sessionToken === null) {
    return;
  }

  try {
    const response = await fetch(`/api/lobby/rooms?token=${encodeURIComponent(sessionToken)}`);
    const payload = (await response.json()) as { rooms?: PublicRoomSummary[]; message?: string };
    if (!response.ok || payload.rooms === undefined) {
      throw new Error(payload.message ?? "Failed to load room list.");
    }

    if (state.auth.sessionToken !== sessionToken) {
      return;
    }

    state = {
      ...state,
      online: {
        ...state.online,
        availableRooms: payload.rooms
      }
    };
    render();
  } catch {
    if (state.auth.sessionToken !== sessionToken) {
      return;
    }

    state = {
      ...state,
      online: {
        ...state.online,
        availableRooms: []
      }
    };
    render();
  }
}

function shouldRefreshPublicRoomsFromSnapshot(
  previousRoom: RoomView | null,
  nextRoom: RoomView,
  previousSetupState: RoundSetupStateView | null,
  previousPlayState: PlayStateView | null,
  nextSetupState: RoundSetupStateView | null,
  nextPlayState: PlayStateView | null
): boolean {
  if (previousRoom === null) {
    return true;
  }

  const previousReadyCount = previousRoom.players.filter((player) => player.isReady).length;
  const nextReadyCount = nextRoom.players.filter((player) => player.isReady).length;
  const previousConnectedCount = previousRoom.players.filter((player) => player.isConnected).length;
  const nextConnectedCount = nextRoom.players.filter((player) => player.isConnected).length;
  const previousInProgress = previousSetupState !== null || previousPlayState !== null;
  const nextInProgress = nextSetupState !== null || nextPlayState !== null;

  return (
    previousRoom.roomId !== nextRoom.roomId ||
    previousRoom.players.length !== nextRoom.players.length ||
    previousReadyCount !== nextReadyCount ||
    previousConnectedCount !== nextConnectedCount ||
    previousInProgress !== nextInProgress
  );
}

async function restoreAuthSession(): Promise<void> {
  if (state.auth.sessionToken === null) {
    return;
  }

  try {
    const response = await fetch(`/api/auth/session?token=${encodeURIComponent(state.auth.sessionToken)}`);
    if (!response.ok) {
      throw new Error("Saved session is no longer valid.");
    }

    const payload = (await response.json()) as { user: AuthenticatedUserView };
    applyAuthenticatedUser(payload.user, state.auth.sessionToken);
    maybeAutoReconnectOnlineServer();
  } catch {
    clearAuthIdleTimer();
    state = {
      ...state,
      auth: {
        ...state.auth,
        status: "anonymous",
        sessionToken: null,
        user: null,
        error: null,
        busy: false
      }
    };
    render();
  }
}

function applyAuthenticatedUser(user: AuthenticatedUserView, sessionToken: string): void {
  state = {
    ...state,
    auth: {
      ...state.auth,
      status: "authenticated",
      sessionToken,
      user,
      error: null,
      busy: false
    },
    online: {
      ...state.online,
      playerId: user.userId,
      displayNameInput: user.name
    }
  };
  resetAuthIdleTimer();
  render();
  void fetchPublicRooms();
  ensureAuthenticatedOnlineConnection();
  if (user.role === "admin") {
    void fetchAdminOverview();
  }
}

function ensureAuthenticatedOnlineConnection(): void {
  if (state.auth.status !== "authenticated" || state.auth.user === null) {
    return;
  }

  if (state.online.connectionStatus !== "disconnected") {
    return;
  }

  connectOnlineServer();
}

function getHomeSectionTitle(): string {
  switch (state.homeMenuSection) {
    case "spectate":
      return "관전";
    case "settings":
      return "설정";
    case "match":
    default:
      return "대전";
  }
}

function getHomeSectionDescription(): string {
  switch (state.homeMenuSection) {
    case "spectate":
      return "관전자 흐름과 현재 방 상태를 확인합니다.";
    case "settings":
      return "연결 기본값과 저장된 로컬 세션 상태를 확인합니다.";
    case "match":
    default:
      return "멀티플레이 서버에 연결하고 방에 입장해 대전을 시작합니다.";
  }
}

function getHomeSectionMeta(section: HomeMenuSection): {
  title: string;
  description: string;
  eyebrow: string;
  tag: string;
  toneClass: string;
} {
  switch (section) {
    case "spectate":
      return {
        title: "관전",
        description: "현재 방의 진행 상태와 관전자 시야 규칙을 빠르게 확인합니다.",
        eyebrow: "Watch Mode",
        tag: "Observer Feed",
        toneClass: "tone-spectate"
      };
    case "settings":
      return {
        title: "설정",
        description: "서버 주소, 플레이어 식별자, 자동 재연결 상태를 정리합니다.",
        eyebrow: "System",
        tag: "Session Control",
        toneClass: "tone-settings"
      };
    case "match":
      return {
        title: "대전",
        description: "서버에 연결하고 방을 만들거나 입장한 뒤 준비를 맞춰 대전을 시작합니다.",
        eyebrow: "Versus",
        tag: "Multiplayer Room",
        toneClass: "tone-match"
      };
    case "home":
    default:
      return {
        title: "민화투 온라인",
        description: "원하는 모드를 선택해 시작합니다.",
        eyebrow: "Home",
        tag: "Launcher",
        toneClass: "tone-home"
      };
  }
}

function renderMatchMenuPanel(): string {
  if (false && state.auth.user?.role === "admin") {
    return `
      <section class="panel home-mode-panel">
        <div class="section-kicker">
          <span class="eyebrow">Match</span>
          <h2>운영 전용 계정</h2>
        </div>
        <p class="panel-copy">관리자 계정은 플레이어 방 생성과 입장이 숨겨져 있습니다. 관전 메뉴와 설정 메뉴만 사용하세요.</p>
      </section>
    `;
  }

  return `
    <section class="home-mode-stack">
      ${renderOnlineLobby()}
    </section>
  `;
}

function renderSpectateMenuPanel(): string {
  const canWatch = state.auth.user?.role === "admin";
  const activeRooms = state.auth.adminOverview?.activeRooms ?? [];

  return `
    <section class="panel home-mode-panel">
      <div class="section-kicker">
        <span class="eyebrow">Spectate</span>
        <h2>관전</h2>
      </div>
      <p class="panel-copy">관전자와 기권자는 모든 카드를 볼 수 있습니다. 관리자는 특정 방을 실시간으로 감시하되 게임에는 개입하지 않습니다.</p>
      <div class="home-mode-card-row">
        <article class="score-card">
          <h4>Current Room</h4>
          <p class="score-line"><strong>${state.online.syncedRoom?.roomId ?? "no room"}</strong></p>
        </article>
        <article class="score-card">
          <h4>Visibility</h4>
          <p class="score-line"><strong>spectators see all cards</strong></p>
        </article>
        <article class="score-card">
          <h4>Live Rooms</h4>
          <p class="score-line"><strong>${activeRooms.length}</strong></p>
          <p class="score-line muted">${activeRooms.filter((room) => room.inProgress).length} in progress</p>
        </article>
      </div>
      ${
        !canWatch
          ? ""
          : `
            <div class="admin-grid">
              <article class="score-card admin-panel-card">
                <h4>Admin Watch</h4>
                <label class="field compact">
                  <span>Room ID</span>
                  <input id="admin-watch-room-id" type="text" value="${state.auth.watchRoomIdInput}" />
                </label>
                <div class="button-row compact-button-row">
                  <button id="admin-watch-room" class="primary-button">Watch Room</button>
                  <button id="admin-stop-watch-room" class="secondary-button">Stop Watching</button>
                </div>
              </article>
              <article class="score-card admin-panel-card">
                <h4>Quick Watch</h4>
                ${
                  activeRooms.length === 0
                    ? `<p class="panel-copy">No active rooms right now.</p>`
                    : `
                      <div class="admin-room-list">
                        ${activeRooms.map((room) => `
                          <div class="admin-room-item">
                            <div>
                              <strong>${room.roomId}</strong>
                              <p class="panel-copy">${room.hostName ?? "no host"} · ${room.playerCount} players · ${room.inProgress ? "in progress" : "idle"}</p>
                            </div>
                            <div class="button-row compact-button-row">
                              <button class="secondary-button admin-watch-room-quick" data-room-id="${room.roomId}">Watch</button>
                              <button class="secondary-button admin-delete-room-quick" data-room-id="${room.roomId}">Delete</button>
                            </div>
                          </div>
                        `).join("")}
                      </div>
                    `
                }
              </article>
            </div>
          `
      }
    </section>
  `;

  return `
    <section class="panel home-mode-panel">
      <div class="section-kicker">
        <span class="eyebrow">Spectate</span>
        <h2>관전 안내</h2>
      </div>
      <p class="panel-copy">현재 프로토타입에서는 방 안에서 관전자/기권자 상태가 되면 전체 카드를 볼 수 있습니다. 관전 전용 입장은 다음 단계에서 다듬을 수 있습니다.</p>
      <div class="home-mode-card-row">
        <article class="score-card">
          <h4>Current Room</h4>
          <p class="score-line"><strong>${state.online.syncedRoom?.roomId ?? "no room"}</strong></p>
        </article>
        <article class="score-card">
          <h4>Visibility</h4>
          <p class="score-line"><strong>spectators see all cards</strong></p>
        </article>
      </div>
    </section>
  `;
}

function renderSettingsMenuPanel(): string {
  const viewer = state.auth.user;
  const adminOverview = state.auth.adminOverview;
  const users = adminOverview?.users ?? [];
  const activeRooms = adminOverview?.activeRooms ?? [];
  const auditLog = adminOverview?.auditLog ?? [];
  const balanceLedger = viewer?.ledger ?? [];
  const canUpdateDisplayName =
    state.online.connectionStatus === "connected" &&
    getConnectedOnlineRoomPlayer() !== null &&
    onlineServerSupportsDisplayName();

  return `
    <section class="panel home-mode-panel">
      <div class="section-kicker">
        <span class="eyebrow">Settings</span>
        <h2>계정 및 설정</h2>
      </div>
      <p class="panel-copy">공개 정보는 이름만 노출됩니다. 잔고와 계정 정보는 본인 또는 관리자만 볼 수 있습니다.</p>
      <div class="home-mode-card-row">
        <article class="score-card">
          <h4>Account</h4>
          <p class="score-line"><strong>${viewer?.name ?? "-"}</strong></p>
          <p class="score-line muted">ID: ${viewer?.userId ?? "-"}</p>
        </article>
        <article class="score-card">
          <h4>Balance</h4>
          <p class="score-line"><strong>${viewer?.balance.toLocaleString() ?? "0"} KRW</strong></p>
        </article>
        <article class="score-card">
          <h4>Reconnect</h4>
          <p class="score-line"><strong>${state.online.shouldReconnect ? "enabled" : "disabled"}</strong></p>
        </article>
        <article class="score-card">
          <h4>Role</h4>
          <p class="score-line"><strong>${viewer?.role ?? "player"}</strong></p>
        </article>
      </div>
      <div class="admin-grid">
        <article class="score-card admin-panel-card">
          <h4>Server</h4>
          <label class="field compact">
            <span>Server URL</span>
            <input id="settings-server-url" type="text" value="${state.online.serverUrl}" />
          </label>
          <div class="button-row compact-button-row">
            <button id="settings-reconnect-server" class="secondary-button">Reconnect</button>
          </div>
        </article>
        <article class="score-card admin-panel-card">
          <h4>Public Profile</h4>
          <label class="field compact">
            <span>Public Name</span>
            <input id="settings-display-name" type="text" value="${state.online.displayNameInput}" />
          </label>
          <div class="button-row compact-button-row">
            <button id="settings-set-display-name" class="secondary-button" ${canUpdateDisplayName ? "" : "disabled"}>Save Name</button>
          </div>
        </article>
      </div>
      <div class="button-row compact-button-row">
        <button id="auth-logout-settings" class="secondary-button">Logout</button>
      </div>
      <div class="admin-grid">
        <article class="score-card admin-panel-card">
          <h4>Wallet History</h4>
          <div class="admin-ledger-list">
            ${
              balanceLedger.length === 0
                ? `<p class="panel-copy">No balance changes yet.</p>`
                : balanceLedger.map((entry) => `
                    <div class="admin-room-item">
                      <div>
                        <strong>${entry.amount >= 0 ? "+" : ""}${entry.amount.toLocaleString()} KRW</strong>
                        <p class="panel-copy">${entry.reason}</p>
                        <p class="panel-copy muted">${new Date(entry.timestamp).toLocaleString()}</p>
                      </div>
                      <strong>${entry.balanceAfter.toLocaleString()} KRW</strong>
                    </div>
                  `).join("")
            }
          </div>
        </article>
      </div>
      ${
        viewer?.role !== "admin"
          ? ""
          : `
            <section class="panel home-mode-panel">
              <div class="section-kicker">
                <span class="eyebrow">Admin</span>
                <h2>관리자 도구</h2>
              </div>
              <div class="home-mode-card-row">
                <article class="score-card">
                  <h4>자산 조정</h4>
                  <label class="field compact">
                    <span>Target ID</span>
                    <input id="admin-balance-user-id" type="text" value="${state.auth.adminBalanceUserId}" />
                  </label>
                  <label class="field compact">
                    <span>Amount</span>
                    <input id="admin-balance-amount" type="number" value="${state.auth.adminBalanceAmount}" />
                  </label>
                  <div class="button-row compact-button-row">
                    <button id="admin-adjust-balance" class="primary-button">Apply</button>
                    <button id="admin-refresh-overview" class="secondary-button">Refresh</button>
                  </div>
                </article>
                <article class="score-card">
                  <h4>Active Rooms</h4>
                  <p class="score-line"><strong>${adminOverview?.activeRooms.length ?? 0}</strong></p>
                  <p class="score-line muted">${adminOverview?.activeRooms.map((room) => `${room.roomId} (${room.playerCount})`).join(", ") ?? "no rooms"}</p>
                </article>
              </div>
              <div class="admin-grid">
                <article class="score-card admin-panel-card">
                  <h4>Quick Watch</h4>
                  <div class="admin-room-list">
                    ${
                      activeRooms.length === 0
                        ? `<p class="panel-copy">No active rooms.</p>`
                        : activeRooms.map((room) => `
                            <div class="admin-room-item">
                              <div>
                                <strong>${room.roomId}</strong>
                                <p class="panel-copy">${room.hostName ?? "no host"} · ${room.playerCount} players · ${room.inProgress ? "in progress" : "idle"}</p>
                              </div>
                              <div class="button-row compact-button-row">
                                <button class="secondary-button admin-watch-room-quick" data-room-id="${room.roomId}">Watch</button>
                                <button class="secondary-button admin-delete-room-quick" data-room-id="${room.roomId}">Delete</button>
                              </div>
                            </div>
                          `).join("")
                    }
                  </div>
                </article>
                <article class="score-card admin-panel-card">
                  <h4>User Ledger</h4>
                  <div class="admin-ledger-list">
                    ${
                      users.length === 0
                        ? `<p class="panel-copy">No users loaded.</p>`
                        : users.map((user) => `
                            <div class="admin-room-item">
                              <div>
                                <strong>${user.name}</strong>
                                <p class="panel-copy">${user.userId} · ${user.role}</p>
                              </div>
                              <strong>${user.balance.toLocaleString()} KRW</strong>
                            </div>
                          `).join("")
                    }
                  </div>
                </article>
              </div>
              <div class="admin-grid">
                <article class="score-card admin-panel-card">
                  <h4>Audit Trail</h4>
                  <div class="admin-audit-list">
                    ${
                      auditLog.length === 0
                        ? `<p class="panel-copy">No audit entries yet.</p>`
                        : auditLog.map((entry) => `<div class="admin-audit-entry">${entry}</div>`).join("")
                    }
                  </div>
                </article>
              </div>
            </section>
          `
      }
    </section>
  `;

  return `
    <section class="panel home-mode-panel">
      <div class="section-kicker">
        <span class="eyebrow">Settings</span>
        <h2>기본 설정</h2>
      </div>
      <p class="panel-copy">연결 기본값과 저장된 로컬 세션 정보를 여기서 확인할 수 있습니다. 실제 방 연결은 대전 메뉴에서 진행합니다.</p>
      <div class="home-mode-card-row">
        <article class="score-card">
          <h4>Server</h4>
          <p class="score-line"><strong>${state.online.serverUrl}</strong></p>
        </article>
        <article class="score-card">
          <h4>Player</h4>
          <p class="score-line"><strong>${state.online.playerId}</strong></p>
        </article>
        <article class="score-card">
          <h4>Reconnect</h4>
          <p class="score-line"><strong>${state.online.shouldReconnect ? "enabled" : "disabled"}</strong></p>
        </article>
      </div>
    </section>
  `;
}

function renderHomeStatusRail(mode: "full" | "compact" = "full"): string {
  const room = state.online.syncedRoom;
  const playerCount = room?.players.length ?? 0;
  const readyCount = room?.players.filter((player) => player.isReady).length ?? 0;
  const connectedCount = room?.players.filter((player) => player.isConnected).length ?? 0;
  const isCompact = mode === "compact";

  return `
    <aside class="home-status-rail ${isCompact ? "compact" : ""}">
      <section class="home-status-card">
        <span class="eyebrow">Session</span>
        <h3>${state.online.connectionStatus === "connected" ? "Live session" : "Idle session"}</h3>
        <p class="panel-copy">${state.online.connectedPlayerId === null ? "서버 연결 전입니다." : `${state.auth.user?.name ?? state.online.connectedPlayerId} 로 연결되었습니다.`}</p>
      </section>
      <section class="home-status-card">
        <span class="eyebrow">Room Pulse</span>
        <div class="home-status-metric">
          <strong>${room?.roomId ?? "NO ROOM"}</strong>
          <span>${playerCount} seated</span>
        </div>
        <p class="panel-copy">Ready ${readyCount} / Connected ${connectedCount}</p>
      </section>
      <section class="home-status-card">
        <span class="eyebrow">Flow</span>
        <ul class="home-status-list">
          <li>연결</li>
          <li>방 입장</li>
          <li>준비 완료</li>
          <li>게임 시작</li>
        </ul>
      </section>
    </aside>
  `;
}

function renderOnlineLobby(): string {
  const controls = getOnlineControlState();
  const {
    isConnected,
    syncedSetupState,
    syncedPlayState,
    connectedPlayer,
    supportsReadyToggle,
    supportsDisplayName,
    supportsHostTransfer,
    supportsKickPlayer,
    hasActiveSyncedRound,
    canToggleReady,
    canStartByRoster,
    disconnectedPlayers,
    notReadyPlayers,
    canChangeRooms,
    canLeaveRoom,
    viewerMode,
    showRoomExitActions,
    primaryMatchActionLabel,
    phaseHint,
    canAddTestBot,
    supportsBots
  } = controls;
  const roomLabel = state.online.syncedRoom?.roomId ?? state.online.roomIdInput;
  const seatedCount = state.online.syncedRoom?.players.length ?? 0;
  const readyCount = state.online.syncedRoom?.players.filter((player) => player.isReady).length ?? 0;
  const connectedCount = state.online.syncedRoom?.players.filter((player) => player.isConnected).length ?? 0;
  const currentPhase = syncedPlayState?.phase ?? syncedSetupState?.phase ?? "idle";

  return `
    <section class="panel command-panel workspace-primary-panel">
      <div class="section-kicker">
        <span class="eyebrow">Command Deck</span>
        <h2>Room Control</h2>
      </div>
      ${
        state.online.error === null
          ? ""
          : `<div class="command-alert command-alert-error"><strong>Server error</strong><span>${state.online.error}</span></div>`
      }
      ${
        isConnected && (!supportsReadyToggle || !supportsDisplayName || !supportsHostTransfer || !supportsKickPlayer)
          ? `<div class="command-alert command-alert-warning"><strong>Compatibility</strong><span>The running server is outdated. Restart \`npm run server\` to use ready, display-name, host-transfer, and kick actions.</span></div>`
          : ""
      }
      <article class="command-stage-card command-room-entry-card">
        <span class="mini-label">Room Entry</span>
        <h3>${roomLabel}</h3>
        <p class="panel-copy">Enter a room name, then create it or join an idle room.</p>
        <label class="field">
          <span>Room ID</span>
          <input id="online-room-id" type="text" value="${state.online.roomIdInput}" />
        </label>
        <div class="button-row compact-button-row command-room-buttons">
          <button id="online-create-room" class="primary-button" ${canChangeRooms ? "" : "disabled"}>Create Room</button>
          <button id="online-join-room" class="secondary-button" ${canChangeRooms ? "" : "disabled"}>Join Room</button>
          ${canToggleReady ? `<button id="online-toggle-ready" class="secondary-button">${connectedPlayer?.isReady ? "Set Not Ready" : "Set Ready"}</button>` : ""}
          ${canAddTestBot ? `<button id="online-add-test-bot" class="secondary-button">Add Test Bot</button>` : ""}
        </div>
        <p class="panel-copy">Viewer mode: <strong>${viewerMode}</strong></p>
        ${
          supportsBots && state.online.syncedRoom !== null && !canAddTestBot && state.online.syncedRoom.players.length >= 7
            ? `<p class="panel-copy">Bot slots are full.</p>`
            : ""
        }
      </article>
      <article class="command-stage-card command-room-entry-card">
        <div class="zone-header">
          <h3>Open Rooms</h3>
          <button id="online-refresh-room-list" class="secondary-button">Refresh</button>
        </div>
        <p class="panel-copy">Current rooms on the server. Idle rooms can be joined directly.</p>
        ${renderPublicRoomList(canChangeRooms)}
      </article>
    </section>
  `;

  return `
    <section class="panel command-panel workspace-primary-panel">
      <div class="section-kicker">
        <span class="eyebrow">Command Deck</span>
        <h2>Room Control</h2>
      </div>
      <div class="command-hero-bar">
        <div class="command-hero-copy">
          <strong>${roomLabel.toUpperCase()}</strong>
          <span>${currentPhase} · ${seatedCount} seated · ${readyCount}/${seatedCount === 0 ? 0 : seatedCount} ready</span>
        </div>
        <div class="command-hero-pills">
          <span class="command-pill">${state.online.connectionStatus}</span>
          <span class="command-pill">${viewerMode}</span>
        </div>
      </div>
      ${
        state.online.error === null
          ? ""
          : `<div class="command-alert command-alert-error"><strong>Server error</strong><span>${state.online.error}</span></div>`
      }
      ${
        isConnected && (!supportsReadyToggle || !supportsDisplayName || !supportsHostTransfer || !supportsKickPlayer)
          ? `<div class="command-alert command-alert-warning"><strong>Compatibility</strong><span>The running server is outdated. Restart \`npm run server\` to use ready, display-name, host-transfer, and kick actions.</span></div>`
          : ""
      }
      <article class="command-stage-card command-stage-card-room">
        <span class="mini-label">Room Flow</span>
        <h3>${roomLabel}</h3>
        <p class="panel-copy">${
          state.online.syncedRoom === null
            ? "Create a room or join an idle room."
            : hasActiveSyncedRound
              ? "This room is live. Room changes stay locked until the round returns to idle."
              : "The room is idle. Handle room entry and readiness here."
        }</p>
        <label class="field">
          <span>Room ID</span>
          <input id="online-room-id" type="text" value="${state.online.roomIdInput}" />
        </label>
        <div class="command-mini-grid">
          <div class="command-mini-card">
            <span class="mini-label">Roster</span>
            <strong>${seatedCount} seated</strong>
            <p class="panel-copy">${connectedCount} connected</p>
          </div>
          <div class="command-mini-card">
            <span class="mini-label">Gate</span>
            <strong>${canStartByRoster ? "Ready" : "Locked"}</strong>
            <p class="panel-copy">${notReadyPlayers.length === 0 && disconnectedPlayers.length === 0 ? "all clear" : "waiting on roster"}</p>
          </div>
        </div>
        <div class="button-row compact-button-row command-room-buttons">
          <button id="online-create-room" class="primary-button" ${canChangeRooms ? "" : "disabled"}>Create Room</button>
          <button id="online-join-room" class="secondary-button" ${canChangeRooms ? "" : "disabled"}>Join Room</button>
          ${showRoomExitActions ? `<button id="online-leave-room" class="secondary-button" ${canLeaveRoom ? "" : "disabled"}>Leave</button>` : ""}
          ${canToggleReady ? `<button id="online-toggle-ready" class="secondary-button">${connectedPlayer?.isReady ? "Set Not Ready" : "Set Ready"}</button>` : ""}
        </div>
        ${
          syncedSetupState === null && syncedPlayState === null && !canStartByRoster
            ? `<div class="command-inline-note"><span class="mini-label">Start Lock</span><strong>Need 5-7 connected ready players</strong></div>`
            : ""
        }
        ${
          hasActiveSyncedRound
            ? `<div class="command-inline-note"><span class="mini-label">Round Lock</span><strong>Create, join, and leave are paused during the live round</strong></div>`
            : ""
        }
        ${
          disconnectedPlayers.length === 0
            ? ""
            : `<p class="panel-copy">Offline: <strong>${disconnectedPlayers.join(", ")}</strong></p>`
        }
        ${
          notReadyPlayers.length === 0
            ? ""
            : `<p class="panel-copy">Not ready: <strong>${notReadyPlayers.join(", ")}</strong></p>`
        }
        <p class="panel-copy">Live turn actions stay below the board. Settings handles reconnect, public name, and logout.</p>
      </article>
      <div class="command-footer-strip">
        <span>${state.auth.user?.name ?? state.online.playerId}</span>
        <span>${primaryMatchActionLabel}</span>
      </div>
    </section>
  `;

  return `
    <section class="panel command-panel workspace-primary-panel">
      <div class="section-kicker">
        <span class="eyebrow">Command Deck</span>
        <h2>Online Command</h2>
      </div>
      <p class="panel-copy">Status: <strong>${state.online.connectionStatus}</strong>${state.auth.user === null ? "" : ` · ${state.auth.user.name} · ${state.auth.user.balance.toLocaleString()} KRW`}</p>
      ${
        state.online.error === null
          ? ""
          : `<div class="command-alert command-alert-error"><strong>Server error</strong><span>${state.online.error}</span></div>`
      }
      ${
        isConnected && (!supportsReadyToggle || !supportsDisplayName || !supportsHostTransfer || !supportsKickPlayer)
          ? `<div class="command-alert command-alert-warning"><strong>Compatibility</strong><span>The running server is outdated. Restart \`npm run server\` to use ready, display-name, host-transfer, and kick actions.</span></div>`
          : ""
      }
      <div class="menu-status-grid">
        <article class="menu-status-card">
          <span class="mini-label">Server</span>
          <strong>${state.online.connectionStatus}</strong>
          <p class="panel-copy">${state.online.serverUrl}</p>
        </article>
        <article class="menu-status-card">
          <span class="mini-label">Viewer</span>
          <strong>${viewerMode}</strong>
          <p class="panel-copy">${state.auth.user?.name ?? "guest account"}</p>
        </article>
        <article class="menu-status-card">
          <span class="mini-label">Room</span>
          <strong>${state.online.syncedRoom?.roomId ?? state.online.roomIdInput}</strong>
          <p class="panel-copy">${state.online.syncedRoom?.players.length ?? 0} seated</p>
        </article>
        <article class="menu-status-card">
          <span class="mini-label">Round</span>
          <strong>${syncedPlayState?.phase ?? syncedSetupState?.phase ?? "idle"}</strong>
          <p class="panel-copy">${syncedPlayState !== null || syncedSetupState !== null ? "live server state" : "waiting in lobby"}</p>
        </article>
      </div>
      <div class="command-stage-grid">
        <article class="command-stage-card">
          <span class="mini-label">Session</span>
          <h3>${state.auth.user?.name ?? state.online.playerId}</h3>
          <p class="panel-copy">Profile editing lives in Settings. This surface is now focused on live room flow only.</p>
          <div class="command-pill-row">
            <span class="command-pill">ID ${state.online.playerId}</span>
            <span class="command-pill">Balance ${state.auth.user?.balance.toLocaleString() ?? "0"} KRW</span>
            <span class="command-pill">Public ${state.online.displayNameInput}</span>
          </div>
          <div class="button-row compact-button-row">
            <button id="auth-logout" class="secondary-button">Logout</button>
          </div>
        </article>
        <article class="command-stage-card">
          <span class="mini-label">Room Flow</span>
          <h3>${state.online.syncedRoom?.roomId ?? state.online.roomIdInput}</h3>
          <p class="panel-copy">${
            state.online.syncedRoom === null
              ? "Create a room or join an idle room."
              : hasActiveSyncedRound
                ? "The room is live. Roster changes are locked until the round returns to idle."
                : "Room is idle. You can leave, toggle ready, or prepare the next setup."
          }</p>
          <label class="field">
            <span>Room ID</span>
            <input id="online-room-id" type="text" value="${state.online.roomIdInput}" />
          </label>
          <div class="command-inline-note">
            <span class="mini-label">Ready Gate</span>
            <strong>${canStartByRoster ? "All seats clear" : "Waiting on roster"}</strong>
          </div>
          <div class="button-row compact-button-row">
            <button id="online-create-room" class="primary-button" ${canChangeRooms ? "" : "disabled"}>Create Room</button>
            <button id="online-join-room" class="secondary-button" ${canChangeRooms ? "" : "disabled"}>Join Room</button>
            ${showRoomExitActions ? `<button id="online-leave-room" class="secondary-button" ${canLeaveRoom ? "" : "disabled"}>Leave</button>` : ""}
            ${canToggleReady ? `<button id="online-toggle-ready" class="secondary-button">${connectedPlayer?.isReady ? "Set Not Ready" : "Set Ready"}</button>` : ""}
          </div>
        </article>
        <article class="command-stage-card command-stage-card-wide">
          <span class="mini-label">Live Action</span>
          <h3>${primaryMatchActionLabel}</h3>
          <p class="panel-copy">${phaseHint}</p>
          <div class="action-focus-grid">
            <div class="command-inline-note">
              <span class="mini-label">Control Focus</span>
              <strong>${syncedPlayState !== null ? "Turn Actions" : syncedSetupState !== null ? "Round Setup" : "Lobby Setup"}</strong>
            </div>
            <div class="command-inline-note">
              <span class="mini-label">Action Surface</span>
              <strong>${syncedPlayState !== null || syncedSetupState !== null ? "Board Action Dock" : "Room Flow"}</strong>
            </div>
          </div>
          <div class="control-timeline">
            <div class="timeline-step ${syncedSetupState === null && syncedPlayState === null ? "timeline-step-active" : "timeline-step-complete"}">
              <span class="mini-label">1</span>
              <strong>Room</strong>
            </div>
            <div class="timeline-step ${syncedSetupState !== null && syncedPlayState === null ? "timeline-step-active" : syncedPlayState !== null ? "timeline-step-complete" : ""}">
              <span class="mini-label">2</span>
              <strong>Setup</strong>
            </div>
            <div class="timeline-step ${syncedPlayState !== null ? "timeline-step-active" : ""}">
              <span class="mini-label">3</span>
              <strong>Game</strong>
            </div>
          </div>
          <p class="panel-copy">Turn-critical actions now live directly under the board so you do not need to bounce between the table and this command card.</p>
        </article>
      </div>
      ${
        state.online.syncedRoom === null
          ? `<p class="panel-copy">No synchronized room snapshot yet.</p>`
          : `
            <div class="zone command-summary-zone">
              <div class="zone-header">
                <h3>Room Summary</h3>
                <span>${state.online.syncedRoom.roomId}</span>
              </div>
              <p class="panel-copy">Host: <strong>${state.online.syncedRoom.hostPlayerId === null ? "pending" : getOnlinePlayerLabel(state.online.syncedRoom.hostPlayerId)}</strong></p>
              <p class="panel-copy">Setup phase: <strong>${syncedSetupState === null ? "idle" : syncedSetupState.phase}</strong></p>
              <p class="panel-copy">Play phase: <strong>${syncedPlayState === null ? "idle" : syncedPlayState.phase}</strong></p>
              ${
                syncedSetupState === null && syncedPlayState === null && !canStartByRoster
                  ? `<p class="panel-copy">Start is locked until 5-7 players are seated and everyone is both connected and ready.</p>`
                  : ""
              }
              ${
                hasActiveSyncedRound
                  ? `<p class="panel-copy">Leave, create, and join actions are locked while a synchronized round is active.</p>`
                  : ""
              }
              ${
                disconnectedPlayers.length === 0
                  ? ""
                  : `<p class="panel-copy">Offline: <strong>${disconnectedPlayers.join(", ")}</strong></p>`
              }
              ${
                notReadyPlayers.length === 0
                  ? ""
                  : `<p class="panel-copy">Not ready: <strong>${notReadyPlayers.join(", ")}</strong></p>`
              }
              <p class="panel-copy">Join is only available while the room is idle. The command deck and live board now share the center workspace.</p>
            </div>
          `
      }
    </section>
  `;
}

function getHeroEyebrow(): string {
  return hasActiveOnlineRoom() ? "Online Multiplayer" : "Authenticated Lobby";
}

function getHeroTitle(): string {
  return hasActiveOnlineRoom() ? "Minhwatu Online Table" : "Minhwatu Lobby";
}

function getHeroLede(): string {
  if (hasActiveOnlineRoom()) {
    const room = state.online.syncedRoom;
    return `Server-authoritative room ${room?.roomId ?? ""} is active. The synchronized board is primary and the command deck now sits in the center flow for faster match control.`;
  }

  return "로그인 이후에만 로비와 게임으로 들어갈 수 있습니다. 연결, 방 입장, 준비, 시작 흐름은 중앙 워크스페이스에서 이어집니다.";
}

function getPrimaryPhaseLabel(): string {
  if (state.online.syncedPlayState !== null) {
    return state.online.syncedPlayState.phase;
  }

  if (state.online.syncedSetupState !== null) {
    return state.online.syncedSetupState.phase;
  }

  return getPhaseLabel();
}

function getSecondaryStatLabel(): string {
  return hasActiveOnlineRoom() ? "Room" : "Balance";
}

function getSecondaryStatValue(): string {
  if (hasActiveOnlineRoom()) {
    return state.online.syncedRoom?.roomId ?? "offline";
  }

  return `${state.auth.user?.balance.toLocaleString() ?? "0"} KRW`;
}

function getConnectedOnlineRoomPlayer(): RoomView["players"][number] | null {
  const room = state.online.syncedRoom;
  if (room === null) {
    return null;
  }

  return room.players.find((player) => player.isSelf) ?? null;
}

function getOnlinePlayer(playerId: string | null): RoomView["players"][number] | null {
  const room = state.online.syncedRoom;
  if (room === null || playerId === null) {
    return null;
  }

  return room.players.find((player) => player.playerId === playerId) ?? null;
}

function getOnlinePlayerLabel(playerId: string | null): string {
  const player = getOnlinePlayer(playerId);
  if (player === null) {
    return playerId ?? "hidden";
  }

  return player.displayName;
}

function onlineServerSupportsReadyToggle(): boolean {
  return state.online.serverCapabilities?.setReady === true;
}

function onlineServerSupportsDisplayName(): boolean {
  return state.online.serverCapabilities?.setDisplayName === true;
}

function onlineServerSupportsHostTransfer(): boolean {
  return state.online.serverCapabilities?.transferHost === true;
}

function onlineServerSupportsKickPlayer(): boolean {
  return state.online.serverCapabilities?.kickPlayer === true;
}

function onlineServerSupportsBots(): boolean {
  return state.online.serverCapabilities?.bots === true;
}

function onlineServerSupportsDeleteRoom(): boolean {
  return state.online.serverCapabilities?.deleteRoom === true;
}

function onlineServerSupportsAdminForceStart(): boolean {
  return state.online.serverCapabilities?.forceStart === true;
}

function onlineServerSupportsAdminProxyPlay(): boolean {
  return state.online.serverCapabilities?.proxyPlay === true;
}

function getActiveOnlineRoomId(): string | null {
  return state.online.syncedRoom?.roomId ?? null;
}

function canAdminDriveOnlineRoom(): boolean {
  return (
    state.auth.user?.role === "admin" &&
    state.online.connectionStatus === "connected" &&
    getActiveOnlineRoomId() !== null
  );
}

function getOnlineCurrentChooserId(): string | null {
  if (state.online.syncedSetupState?.phase === "waiting_for_giveups") {
    return state.online.syncedSetupState.currentPlayerId;
  }

  if (state.online.syncedPlayState !== null && state.online.syncedPlayState.phase !== "completed") {
    return state.online.syncedPlayState.currentPlayerId;
  }

  return null;
}

function getOnlineCompatibilityError(message: string): string {
  if (message.includes("Unhandled message type") && message.includes("\"set_ready\"")) {
    return "The running server is outdated. Restart `npm run server` and reconnect.";
  }

  if (message.includes("Unhandled message type") && message.includes("\"set_display_name\"")) {
    return "The running server is outdated. Restart `npm run server` and reconnect.";
  }

  if (message.includes("Unhandled message type") && (message.includes("\"transfer_host\"") || message.includes("\"kick_player\""))) {
    return "The running server is outdated. Restart `npm run server` and reconnect.";
  }

  if (message.includes("Unhandled message type") && message.includes("\"add_test_bot\"")) {
    return "The running server is outdated. Restart `npm run server` and reconnect.";
  }

  if (message.includes("Room is in progress. New players can join only after the current round returns to idle.")) {
    return "This room is in an active round. New players can join after the room returns to idle.";
  }

  if (message.includes("Cannot leave or switch rooms while a synchronized round is active.")) {
    return "Finish the active synchronized round before leaving or switching rooms.";
  }

  return message;
}

function renderOnlineRoomMetaPanel(): string {
  const room = state.online.syncedRoom;
  const connectedPlayer = getConnectedOnlineRoomPlayer();
  const isHost = connectedPlayer !== null && room?.hostPlayerId === connectedPlayer.playerId;
  const isAdmin = state.auth.user?.role === "admin";
  const supportsHostTransfer = onlineServerSupportsHostTransfer();
  const supportsKickPlayer = onlineServerSupportsKickPlayer();
  const supportsDeleteRoom = onlineServerSupportsDeleteRoom();
  const canManageRoster = state.online.connectionStatus === "connected" && isHost && (supportsHostTransfer || supportsKickPlayer);

  if (room === null) {
    return "";
  }

  return `
    <section class="panel workspace-secondary-panel room-meta-panel">
      <div class="section-kicker">
        <span class="eyebrow">Room Rail</span>
        <h2>Players (${room.players.length})</h2>
      </div>
      <div class="room-rail-summary">
        <article class="score-card room-rail-card">
          <h4>Host</h4>
          <p class="score-line"><strong>${getOnlinePlayerLabel(room.hostPlayerId)}</strong></p>
        </article>
        <article class="score-card room-rail-card">
          <h4>Connected</h4>
          <p class="score-line"><strong>${room.players.filter((player) => player.isConnected).length}/${room.players.length}</strong></p>
        </article>
        <article class="score-card room-rail-card">
          <h4>Ready</h4>
          <p class="score-line"><strong>${room.players.filter((player) => player.isReady).length}/${room.players.length}</strong></p>
        </article>
        <article class="score-card room-rail-card">
          <h4>Mode</h4>
          <p class="score-line"><strong>${connectedPlayer === null ? "Spectator" : connectedPlayer.role}</strong></p>
        </article>
      </div>
      ${
        isAdmin && supportsDeleteRoom
          ? `<div class="button-row compact-button-row">
              <button class="secondary-button admin-delete-room-current" data-room-id="${room.roomId}">Delete This Room</button>
            </div>`
          : ""
      }
      <div class="roster-grid">
        ${sortOnlineRoomPlayersBySeat(room.players).map((player) => `
          <article class="hand-panel roster-card ${player.isSelf ? "roster-card-self" : ""}">
            <div class="roster-card-top">
              <h4>${player.displayName}${player.isSelf ? " · You" : ""}</h4>
              <span class="mini-label">Seat ${player.seatIndex}</span>
            </div>
            <div class="roster-pill-row">
              <span class="roster-pill ${player.isHost ? "roster-pill-strong" : ""}">${player.isHost ? "Host" : "Guest"}</span>
              <span class="roster-pill ${player.isReady ? "roster-pill-good" : "roster-pill-muted"}">${player.isReady ? "Ready" : "Not Ready"}</span>
              <span class="roster-pill ${player.isConnected ? "roster-pill-good" : "roster-pill-danger"}">${player.isConnected ? "Connected" : "Offline"}</span>
              <span class="roster-pill roster-pill-role">${player.role}</span>
            </div>
            <p class="panel-copy">Public profile only. Hidden account values and balance stay private.</p>
            ${
              canManageRoster && player.playerId !== null && player.playerId !== connectedPlayer?.playerId
                ? `<div class="button-row">
                    <button class="secondary-button online-transfer-host-button" data-target-player-id="${player.playerId}" ${supportsHostTransfer ? "" : "disabled"}>Make Host</button>
                    <button class="secondary-button online-kick-player-button" data-target-player-id="${player.playerId}" ${supportsKickPlayer ? "" : "disabled"}>Kick</button>
                  </div>`
                : ""
            }
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderPublicRoomList(canChangeRooms: boolean): string {
  if (state.online.availableRooms.length === 0) {
    return `<p class="panel-copy">No rooms are open right now.</p>`;
  }

  return `
    <div class="admin-room-list public-room-list">
      ${state.online.availableRooms.map((room) => `
        <div class="admin-room-item public-room-item">
          <div>
            <strong>${room.roomId}</strong>
            <p class="panel-copy">${room.hostName ?? "no host"} · ${room.playerCount} players · ${room.readyCount} ready · ${room.connectedCount} connected</p>
            <p class="panel-copy muted">${room.inProgress ? "in progress" : "idle"}</p>
          </div>
          <button class="secondary-button online-room-list-join" data-room-id="${room.roomId}" ${(canChangeRooms && !room.inProgress) ? "" : "disabled"}>Join</button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRoundResultModal(): string {
  const entry = state.online.resultModalEntry;
  if (entry === null) {
    return "";
  }

  return `
    <div class="result-modal-backdrop" id="round-result-modal-backdrop">
      <section class="panel result-modal-card" role="dialog" aria-modal="true" aria-labelledby="round-result-modal-title">
        <div class="zone-header">
          <div>
            <h3 id="round-result-modal-title">${entry.status === "reset" ? "Round Reset" : "Round Result"}</h3>
            <p class="panel-copy">${entry.summaryText}</p>
          </div>
          <button id="close-round-result-modal" class="secondary-button">Close</button>
        </div>
        <p class="panel-copy muted">Completed: ${new Date(entry.completedAt).toLocaleString()} · Next dealer: ${entry.nextDealerId === null ? "same" : getOnlinePlayerLabel(entry.nextDealerId)}</p>
        ${
          entry.players.length === 0
            ? `<p class="panel-copy">No per-player settlement exists for this round.</p>`
            : `<div class="score-grid history-score-grid">
                ${entry.players.map((player) => renderScoreDetailCard(getOnlinePlayerLabel(player.playerId), player, player.capturedCards)).join("")}
              </div>`
        }
      </section>
    </div>
  `;
}

function renderOnlineSetupSummary(setupState: RoundSetupStateView | null): string {
  if (setupState === null) {
    return `<p class="panel-copy">No synchronized round setup is active for this room.</p>`;
  }

  if (setupState.phase === "selecting_initial_dealer") {
    return `<p class="panel-copy">Dealer draw rounds played: ${setupState.dealerDrawRounds.length}</p>`;
  }

  if (setupState.phase === "waiting_for_giveups") {
    return `
      <p class="panel-copy">Current chooser: <strong>${getOnlinePlayerLabel(setupState.currentPlayerId)}</strong></p>
      <p class="panel-copy">Give-ups needed: <strong>${setupState.giveUpsNeeded}</strong></p>
      ${
        setupState.pendingDeal === null
          ? ""
          : `
            <div class="hands-grid">
              ${setupState.turnOrder.map((playerId) => `
                <article class="hand-panel ${playerId === setupState.currentPlayerId ? "active-turn" : ""}">
                  <h4>${getOnlinePlayerLabel(playerId)}</h4>
                  <div class="card-row small">
                    ${(setupState.pendingDeal?.hands[playerId] ?? []).map(renderVisibleCard).join("")}
                  </div>
                </article>
              `).join("")}
            </div>
            <p class="panel-copy">Hidden floor: <strong>${setupState.pendingDeal.hiddenFloorCards.length}</strong> cards</p>
            ${
              setupState.viewerMode === "spectator"
                ? `
                  <div class="card-row small">${setupState.pendingDeal.hiddenFloorCards.map(renderVisibleCard).join("")}</div>
                  <p class="panel-copy">Draw pile preview:</p>
                  <div class="card-row small">${setupState.pendingDeal.drawPileCards.map(renderVisibleCard).join("")}</div>
                `
                : ""
            }
          `
      }
    `;
  }

  return `
    <p class="panel-copy">Dealer: <strong>${getOnlinePlayerLabel(setupState.dealerId)}</strong></p>
    <p class="panel-copy">Active players: <strong>${setupState.activePlayerIds.map((playerId) => getOnlinePlayerLabel(playerId)).join(", ")}</strong></p>
    ${
      setupState.predealtHand === null
        ? ""
        : `
          <p class="panel-copy">Your locked hand for the next round:</p>
          <div class="card-row small">${setupState.predealtHand.map(renderVisibleCard).join("")}</div>
        `
    }
  `;
}

function renderOnlinePlaySummary(playState: PlayStateView | null): string {
  if (playState === null) {
    return `<p class="panel-copy">No synchronized play state is active for this room.</p>`;
  }

  const isCurrentOnlinePlayer =
    playState.phase !== "completed" && playState.currentPlayerId === state.online.connectedPlayerId;
  const canAdminProxyCurrentTurn =
    state.auth.user?.role === "admin" &&
    onlineServerSupportsAdminProxyPlay() &&
    playState.phase !== "completed";
  const canControlCurrentTurn = isCurrentOnlinePlayer || canAdminProxyCurrentTurn;
  const onlineFloorAction = getOnlineFloorAction(playState, canControlCurrentTurn);
  const onlineDrawPileAction =
    canControlCurrentTurn && playState.phase === "awaiting_draw_flip" ? "flip-draw-pile" : "";
  const scoring =
    playState.phase === "completed"
      ? scoreRound(playState.capturedByPlayer, playState.activePlayerIds)
      : null;
  const orderedPlayerIds = getOrderedOnlinePlayerIds(playState.activePlayerIds);
  const bottomPlayerId = orderedPlayerIds.includes(state.online.connectedPlayerId ?? "")
    ? state.online.connectedPlayerId ?? orderedPlayerIds[orderedPlayerIds.length - 1]
    : orderedPlayerIds[orderedPlayerIds.length - 1];
  const topPlayerIds = orderedPlayerIds.filter((playerId) => playerId !== bottomPlayerId);

  return `
    <div class="online-play-layout">
      <div class="table-opponent-grid">
        ${topPlayerIds.map((playerId) => renderOnlinePlayerPod(playState, playerId, "top", canControlCurrentTurn)).join("")}
      </div>
      <section class="online-table-arena">
        <div class="zone-header online-table-arena-header">
          <h3>Synced Play</h3>
          <span>${playState.phase === "completed" ? "round complete" : `Current: ${getOnlinePlayerLabel(playState.currentPlayerId)}`}</span>
        </div>
        <p class="panel-copy">${
          playState.phase === "completed"
            ? "The server-authoritative round is complete."
            : isCurrentOnlinePlayer
              ? "It is your synchronized turn."
              : canAdminProxyCurrentTurn
                ? `Admin control is acting for ${getOnlinePlayerLabel(playState.currentPlayerId)}.`
              : "Waiting for the active synchronized player."
        }</p>
        ${renderOnlineActionHint(playState, isCurrentOnlinePlayer, canAdminProxyCurrentTurn)}
        <div class="online-center-grid">
          <section class="zone online-floor-cluster ${onlineFloorAction === "" ? "" : "clickable-zone"}" ${onlineFloorAction === "" ? "" : `data-online-action="${onlineFloorAction}"`}>
            <div class="zone-header">
              <h3>Floor</h3>
              <span>${playState.floorCards.length} cards</span>
            </div>
            <div class="card-row online-floor-row">
              ${playState.floorCards.map((cardId) => renderOnlineFloorCard(playState, cardId, canControlCurrentTurn)).join("")}
            </div>
          </section>
          <section class="zone online-draw-cluster ${onlineDrawPileAction === "" ? "" : "clickable-zone"}" ${onlineDrawPileAction === "" ? "" : `data-online-action="${onlineDrawPileAction}"`}>
            <div class="zone-header">
              <h3>Draw Pile</h3>
              <span>${playState.drawPileCards.length} remain</span>
            </div>
            <div class="pile-stack online-pile-stack">
              <div class="pile-card">${playState.drawPileCards.length}</div>
              ${
                playState.phase === "awaiting_draw_choice"
                  ? `
                    <div class="revealed-card">
                      <span class="mini-label">Revealed</span>
                      ${renderVisibleCard(playState.revealedDrawCard)}
                    </div>
                  `
                  : ""
              }
            </div>
            ${
              playState.viewerMode === "spectator"
                ? `<div class="card-row small online-draw-preview">${playState.drawPileCards.map(renderVisibleCard).join("")}</div>`
                : ""
            }
          </section>
        </div>
      </section>
      ${
        bottomPlayerId === undefined
          ? ""
          : `<div class="online-self-band">${renderOnlinePlayerPod(playState, bottomPlayerId, "bottom", canControlCurrentTurn)}</div>`
      }
      ${
        scoring === null
          ? ""
          : `
            <section class="zone stage-result-zone">
              <div class="zone-header">
                <h3>Synced Result</h3>
                <span>${scoring.status === "reset" ? "Reset" : "Scored"}</span>
              </div>
              ${
                scoring.status === "reset"
                  ? `<p class="panel-copy">Three or more players completed Yak. The synchronized round resets with no settlement.</p>`
                  : `<div class="score-grid">
                    ${scoring.players.map((player) =>
                      renderScoreDetailCard(
                        getOnlinePlayerLabel(player.playerId),
                        player,
                        playState.capturedByPlayer[player.playerId] ?? []
                      )
                    ).join("")}
                    </div>`
              }
            </section>
          `
      }
    </div>
  `;
}

function renderOnlinePlayerPod(
  playState: PlayStateView,
  playerId: string,
  position: "top" | "bottom",
  isCurrentOnlinePlayer: boolean
): string {
  const handCards = playState.hands[playerId] ?? [];
  const capturedCards = playState.capturedByPlayer[playerId] ?? [];
  const isSelf = playerId === state.online.connectedPlayerId;
  const isActiveTurn = playState.phase !== "completed" && playState.currentPlayerId === playerId;
  const isDealer = getOnlineDealerLabel() === playerId;

  return `
    <article class="online-player-pod ${position === "bottom" ? "online-player-pod-self" : "online-player-pod-top"} ${isActiveTurn ? "active-turn" : ""}">
      <div class="online-player-head">
        <div>
          <h4>${getOnlinePlayerLabel(playerId)}${isSelf ? " (You)" : ""}</h4>
          <div class="online-player-badges">
            ${isDealer ? `<span class="roster-pill roster-pill-strong">Dealer</span>` : ""}
            ${isActiveTurn ? `<span class="roster-pill roster-pill-good">Turn</span>` : ""}
            <span class="roster-pill roster-pill-muted">${capturedCards.length} captured</span>
          </div>
        </div>
      </div>
      <div class="card-row ${position === "bottom" ? "online-hand-row-self" : "small online-hand-row-top"}">
        ${handCards.map((cardId) => renderOnlineHandCard(playState, playerId, cardId, isCurrentOnlinePlayer)).join("")}
      </div>
      ${renderCapturedCardStack(capturedCards, position === "bottom" ? "online-captured-preview online-captured-preview-self" : "online-captured-preview")}
    </article>
  `;
}

function renderCapturedCardStack(cards: readonly string[], extraClassName = ""): string {
  if (cards.length === 0) {
    return "";
  }

  const className = extraClassName === "" ? "captured-stack-row" : `captured-stack-row ${extraClassName}`;
  return `
    <div class="${className}">
      ${cards.map((cardId) => `<div class="captured-stack-card">${renderCard(cardId)}</div>`).join("")}
    </div>
  `;
}

function renderScoreDetailCard(
  playerLabel: string,
  player: RoundHistoryEntry["players"][number] | ReturnType<typeof scoreRound>["players"][number],
  capturedCards: readonly string[]
): string {
  return `
    <article class="score-card score-card-detailed">
      <h4>${playerLabel}</h4>
      <p class="score-line">Base: <strong>${player.baseCardScore}</strong></p>
      <p class="score-line">Entry: <strong>${player.entryFee}</strong></p>
      <p class="score-line">Yak Net: <strong>${player.yakNetScore}</strong></p>
      <p class="score-line">Final: <strong>${player.finalScore}</strong></p>
      <p class="score-line">Money: <strong>${player.amountWon >= 0 ? "+" : ""}${player.amountWon.toLocaleString()} KRW</strong></p>
      <p class="score-line muted">Counts: gwang ${player.counts.gwang}, yeolkkeut ${player.counts.yeolkkeut}, tti ${player.counts.tti}, pi ${player.counts.pi}</p>
      <p class="score-line muted">Yak Months: ${player.yakMonths.length === 0 ? "none" : player.yakMonths.join(", ")}</p>
      ${
        player.yakAdjustments.length === 0
          ? `<p class="score-line muted">Yak Detail: none</p>`
          : `<p class="score-line muted">Yak Detail: ${player.yakAdjustments
              .map((adjustment) => `${adjustment.month}월 ${adjustment.kind === "bonus" ? "+" : ""}${adjustment.points} (${getOnlinePlayerLabel(adjustment.sourcePlayerId)})`)
              .join(", ")}</p>`
      }
      ${renderCapturedCardStack(capturedCards, "history-captured-row")}
    </article>
  `;
}

function renderOnlineActionHint(
  playState: PlayStateView,
  isCurrentOnlinePlayer: boolean,
  canAdminProxyCurrentTurn: boolean
): string {
  if (!isCurrentOnlinePlayer && !canAdminProxyCurrentTurn && playState.phase !== "completed") {
    return `<p class="panel-copy">Only ${getOnlinePlayerLabel(playState.currentPlayerId)} can send the next synchronized action.</p>`;
  }

  switch (playState.phase) {
    case "awaiting_hand_play":
      return `<p class="panel-copy">${
        canAdminProxyCurrentTurn && !isCurrentOnlinePlayer
          ? `Admin can select one card from ${getOnlinePlayerLabel(playState.currentPlayerId)}'s hand.`
          : "Select one card from your hand to start the synchronized turn."
      }</p>`;
    case "awaiting_hand_choice":
      return `
        <p class="panel-copy">${
          playState.matchingFloorCards.length > 0
            ? `Choose one matching floor card for ${playState.pendingHandCard}.`
            : `No floor match exists for ${playState.pendingHandCard}. Discard it to the floor.`
        }</p>
        ${
          playState.matchingFloorCards.length === 0 && isCurrentOnlinePlayer
            ? `<div class="button-row"><button id="online-discard-hand-choice" class="secondary-button">Discard To Floor</button></div>`
            : ""
        }
      `;
    case "awaiting_draw_flip":
      return `<p class="panel-copy">${
        canAdminProxyCurrentTurn && !isCurrentOnlinePlayer
          ? `Admin can flip the draw pile for ${getOnlinePlayerLabel(playState.currentPlayerId)}.`
          : "Flip the top server-authoritative draw card to continue."
      }</p>`;
    case "awaiting_draw_choice":
      return `
        <p class="panel-copy">${
          playState.matchingFloorCards.length > 0
            ? `Choose one matching floor card for ${playState.revealedDrawCard}.`
            : `No floor match exists for ${playState.revealedDrawCard}. Discard it to the floor.`
        }</p>
        ${
          playState.matchingFloorCards.length === 0 && isCurrentOnlinePlayer
            ? `<div class="button-row"><button id="online-discard-draw-choice" class="secondary-button">Discard To Floor</button></div>`
            : ""
        }
      `;
    case "completed":
      return `<p class="panel-copy">Use Prepare Next Round to restore spectators and start the next synchronized setup.</p>`;
    default:
      return "";
  }
}

function renderPhaseControls(): string {
  if (state.playState !== null) {
    return renderTurnControls(state.playState);
  }

  if (state.setupState.phase === "selecting_initial_dealer") {
    return `
      <section class="panel">
        <h2>Dealer Draw</h2>
        <p class="panel-copy">Set or auto-fill the current contenders' month and score, then resolve the draw round.</p>
        <div class="dealer-grid">
          ${getDealerCandidates().map((playerId) => {
            const value = state.dealerInputs[playerId];
            return `
              <article class="dealer-card">
                <h3>${playerId}</h3>
                <label class="field compact">
                  <span>Month</span>
                  <input data-player="${playerId}" data-field="month" type="number" min="1" max="12" value="${value.month}" />
                </label>
                <label class="field compact">
                  <span>Score</span>
                  <select data-player="${playerId}" data-field="score">
                    ${CARD_SCORES.map((score) => `<option value="${score}" ${score === value.score ? "selected" : ""}>${score}</option>`).join("")}
                  </select>
                </label>
              </article>
            `;
          }).join("")}
        </div>
        <div class="button-row">
          <button id="auto-dealer" class="secondary-button">Auto Fill</button>
          <button id="resolve-dealer" class="primary-button">Resolve Draw</button>
        </div>
      </section>
    `;
  }

  if (state.setupState.phase === "waiting_for_giveups") {
    return `
      <section class="panel">
        <h2>Give-Up Decision</h2>
        <p class="panel-copy">Current chooser: <strong>${state.setupState.currentPlayerId}</strong></p>
        <div class="button-row">
          <button id="choose-play" class="secondary-button">Play</button>
          <button id="choose-giveup" class="primary-button">Give Up</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="panel">
      <h2>Deal Cards</h2>
      <label class="field">
        <span>Cut Index</span>
        <input id="cut-index" type="number" min="0" max="47" value="${state.cutIndex}" />
      </label>
      <button id="deal-cards" class="primary-button">${state.setupState.predealtRound === null ? "Shuffle & Deal" : "Reveal Floor & Start"}</button>
    </section>
  `;
}

function renderTurnControls(playState: PlayState): string {
  const currentPlayerLabel = playState.phase === "completed" ? "round complete" : playState.currentPlayerId;

  return `
    <section class="panel">
      <h2>Turn Control</h2>
      <p class="panel-copy">Current player: <strong>${currentPlayerLabel}</strong></p>
      <p class="panel-copy">Step: <strong>${getPlayPhaseLabel(playState)}</strong></p>
      ${renderTurnActionPanel(playState)}
      <label class="field">
        <span>Cut Index</span>
        <input id="cut-index" type="number" min="0" max="47" value="${state.cutIndex}" />
      </label>
      <button id="redeal" class="primary-button">Shuffle &amp; Redeal</button>
    </section>
  `;
}

function renderTurnActionPanel(playState: PlayState): string {
  if (playState.phase === "awaiting_hand_play") {
    return `<p class="panel-copy">Select one card from the active player's hand below to start the turn.</p>`;
  }

  if (playState.phase === "awaiting_hand_choice") {
    const isInitialTriple = isInitialFloorTripleCapture(playState, playState.pendingHandCard);
    return `
      <div class="pending-action">
        <p class="panel-copy">${
          playState.matchingFloorCards.length > 0
            ? isInitialTriple
              ? "This card completes an initial floor triple. Choose any matching floor card to capture all three."
              : "Choose one matching floor card to capture with the played card."
            : "No match is available. Discard the played card to the floor or choose a different hand card."
        }</p>
        <div class="card-row compact-row">${renderCard(playState.pendingHandCard)}</div>
        ${
          playState.matchingFloorCards.length === 0
            ? `
              <div class="button-row">
                <button id="discard-pending-card" class="secondary-button">Discard To Floor</button>
              </div>
            `
            : ""
        }
      </div>
    `;
  }

  if (playState.phase === "awaiting_draw_flip") {
    return `
      <div class="pending-action">
        <p class="panel-copy">The hand step is resolved. Flip the top card of the draw pile to continue.</p>
        <div class="button-row">
          <button id="flip-draw-card" class="primary-button">Flip Draw Card</button>
        </div>
      </div>
    `;
  }

  if (playState.phase === "awaiting_draw_choice") {
    const isInitialTriple = isInitialFloorTripleCapture(playState, playState.revealedDrawCard);
    return `
      <div class="pending-action">
        <p class="panel-copy">${
          playState.matchingFloorCards.length > 0
            ? isInitialTriple
              ? "This revealed card completes an initial floor triple. Choose any matching floor card to capture all three."
              : "Choose one matching floor card to capture with the revealed card."
            : "No match is available. Discard the revealed card to the floor."
        }</p>
        <div class="card-row compact-row">${renderCard(playState.revealedDrawCard)}</div>
        ${
          playState.matchingFloorCards.length === 0
            ? `
              <div class="button-row">
                <button id="discard-pending-card" class="secondary-button">Discard To Floor</button>
              </div>
            `
            : ""
        }
      </div>
    `;
  }

  return `
    <div class="pending-action">
      <p class="panel-copy">The round is complete. Prepare the next round to restore spectators, set the next dealer, and continue the room flow.</p>
      <div class="button-row">
        <button id="prepare-next-round" class="primary-button">Prepare Next Round</button>
      </div>
    </div>
  `;
}

function renderTable(): string {
  if (hasActiveOnlineRoom()) {
    return renderOnlineTable();
  }

  return renderOnlineIdleTable();
}

function renderOnlineIdleTable(): string {
  return `
    <section class="panel board">
      <div class="board-header board-intro-header">
        <div>
          <h2>Online Workspace</h2>
          <p class="panel-copy">Connect to the multiplayer server, enter or create a room, and move the synchronized table into this workspace.</p>
        </div>
        <div class="chips board-header-chips">
          <span class="chip">Status: ${state.online.connectionStatus}</span>
          <span class="chip">Player: ${state.online.playerId}</span>
        </div>
      </div>
      <div class="idle-board-shell">
        <section class="zone online-stage-zone idle-stage-zone">
          <div class="zone-header">
            <h3>Start Online Play</h3>
            <span>${state.online.connectedPlayerId ?? "offline"}</span>
          </div>
          <p class="panel-copy">1. Connect to the WebSocket server.</p>
          <p class="panel-copy">2. Create or join a room from the command deck.</p>
          <p class="panel-copy">3. Mark every seated player ready, then let the host start setup.</p>
        </section>
        <section class="zone idle-stage-zone">
          <div class="zone-header">
            <h3>Workspace Map</h3>
            <span>new layout</span>
          </div>
          <p class="panel-copy">Center top: command deck for connect, room, and match actions.</p>
          <p class="panel-copy">Center bottom: live table and board-side action dock.</p>
          <p class="panel-copy">Left rail: roster and room status.</p>
        </section>
      </div>
    </section>
  `;
}

function renderOnlineTable(): string {
  const room = state.online.syncedRoom;
  if (room === null) {
    return "";
  }

  return `
    <section class="panel board online-board">
      <div class="board-header board-intro-header">
        <div>
          <h2>Online Table</h2>
          <p class="panel-copy">Server-authoritative room ${room.roomId}. The table now keeps opponents above, the live center pile in the middle, and your hand anchored at the bottom.</p>
        </div>
        <div class="chips">
          <span class="chip">Dealer: ${getOnlinePlayerLabel(getOnlineDealerLabel())}</span>
          <span class="chip">Active: ${getOnlineActiveCount()}</span>
          <span class="chip">Viewer: ${state.online.connectedPlayerId === null ? "guest" : getOnlinePlayerLabel(state.online.connectedPlayerId)}</span>
          <span class="chip">Balance: ${(state.auth.user?.balance ?? 0).toLocaleString()} KRW</span>
        </div>
      </div>
      <div class="online-table-shell">
        <section class="zone online-table-banner">
          <div class="table-status-strip">
            <div class="status-pill">
              <span class="mini-label">Phase</span>
              <strong>${state.online.syncedPlayState?.phase ?? state.online.syncedSetupState?.phase ?? "idle"}</strong>
            </div>
            <div class="status-pill">
              <span class="mini-label">Current</span>
              <strong>${
                state.online.syncedPlayState?.phase === "completed"
                  ? "round complete"
                  : state.online.syncedPlayState !== null
                    ? getOnlinePlayerLabel(state.online.syncedPlayState.currentPlayerId)
                    : state.online.syncedSetupState?.phase === "waiting_for_giveups"
                      ? getOnlinePlayerLabel(state.online.syncedSetupState.currentPlayerId)
                      : "waiting"
              }</strong>
            </div>
            <div class="status-pill">
              <span class="mini-label">Presence</span>
              <strong>${room.players.filter((player) => player.isConnected).length}/${room.players.length} connected</strong>
            </div>
            <div class="status-pill">
              <span class="mini-label">Ready</span>
              <strong>${room.players.filter((player) => player.isReady).length}/${room.players.length} ready</strong>
            </div>
            <div class="status-pill status-pill-balance">
              <span class="mini-label">Balance</span>
              <strong>${(state.auth.user?.balance ?? 0).toLocaleString()} KRW</strong>
            </div>
          </div>
        </section>
        <section class="table-surface online-table-surface">
          ${renderOnlineBoardState()}
        </section>
        ${renderOnlineActionDock()}
      </div>
    </section>
  `;
}

function renderSeat(playerId: string, seatIndex: number, role: string): string {
  const isDealer = getDealerLabel() === playerId;
  return `
    <article class="seat-card ${role}">
      <span class="seat-index">Seat ${seatIndex}</span>
      <strong>${playerId}</strong>
      <span class="seat-role">${isDealer ? "Dealer" : role}</span>
    </article>
  `;
}

function renderOnlineSeat(playerId: string | null, seatIndex: number, role: string): string {
  const isDealer = getOnlineDealerLabel() === playerId;
  const isViewer = state.online.connectedPlayerId === playerId;
  return `
    <article class="seat-card ${role} ${isViewer ? "viewer-seat" : ""}">
      <span class="seat-index">Seat ${seatIndex}</span>
      <strong>${getOnlinePlayerLabel(playerId)}${isViewer ? " (You)" : ""}</strong>
      <span class="seat-role">${isDealer ? "Dealer" : role}</span>
    </article>
  `;
}

function sortOnlineRoomPlayersBySeat(players: RoomView["players"]): RoomView["players"] {
  return [...players].sort((left, right) => left.seatIndex - right.seatIndex);
}

function getOrderedOnlinePlayerIds(playerIds: string[]): string[] {
  return [...playerIds].sort((left, right) => {
    const leftSeat = getOnlinePlayer(left)?.seatIndex ?? Number.MAX_SAFE_INTEGER;
    const rightSeat = getOnlinePlayer(right)?.seatIndex ?? Number.MAX_SAFE_INTEGER;
    return leftSeat - rightSeat;
  });
}

function renderBoardState(): string {
  if (state.playState !== null) {
    return renderPlayBoard(state.playState);
  }

  if (state.setupState.phase === "waiting_for_giveups") {
    const hiddenFloorCount = state.setupState.pendingDeal?.hiddenFloorCards.length ?? 0;
    return `
      <div class="deal-layout">
        <section class="zone">
          <div class="zone-header">
            <h3>Give-Up Order</h3>
            <span>${state.setupState.giveUpsNeeded} spectator slot(s)</span>
          </div>
          <ol class="decision-list">
            ${state.setupState.turnOrder.map((playerId) => `
              <li class="${playerId === state.setupState.currentPlayerId ? "current" : ""}">
                <span>${playerId}</span>
                <strong>${state.setupState.decisions[playerId]}</strong>
              </li>
            `).join("")}
          </ol>
        </section>
        <section class="zone">
          <div class="zone-header">
            <h3>Hidden Floor</h3>
            <span>${hiddenFloorCount} cards face down</span>
          </div>
          <p class="panel-copy">${
            state.setupState.pendingDeal === null
              ? "Hands are being prepared for the give-up phase."
              : "The floor remains hidden until the final five active players are confirmed."
          }</p>
          <div class="pile-card">8</div>
        </section>
        <section class="zone">
          <div class="zone-header">
            <h3>Hands Before Give-Up</h3>
            <span>${state.setupState.turnOrder.join(" -> ")}</span>
          </div>
          <div class="hands-grid">
            ${state.setupState.turnOrder.map((playerId) => `
              <article class="hand-panel ${playerId === state.setupState.currentPlayerId ? "active-turn" : ""}">
                <h4>${playerId}</h4>
                <div class="card-row small">
                  ${(state.setupState.pendingDeal?.hands[playerId] ?? []).map(renderCard).join("")}
                </div>
              </article>
            `).join("")}
          </div>
        </section>
      </div>
    `;
  }

  if (state.setupState.phase === "ready_to_play") {
    return `
      <section class="zone">
        <div class="zone-header">
          <h3>Ready Table</h3>
          <span>${state.setupState.activePlayerIds.join(" | ")}</span>
        </div>
        <p class="panel-copy">${
          state.setupState.predealtRound === null
            ? "The active five are locked. Shuffle the 48-card deck, apply the cut, and deal the round."
            : "The active five are locked. Reveal the hidden floor cards and continue with the already dealt hands."
        }</p>
      </section>
    `;
  }

  return `
    <section class="zone">
      <div class="zone-header">
        <h3>Dealer Contenders</h3>
        <span>${getDealerCandidates().join(" | ")}</span>
      </div>
      <p class="panel-copy">Resolve the current draw round to determine the first dealer. If tied on lowest month and score, only tied players draw again.</p>
    </section>
  `;
}

function renderOnlineBoardState(): string {
  const playState = state.online.syncedPlayState;
  if (playState !== null) {
    return renderOnlinePlaySummary(playState);
  }

  const setupState = state.online.syncedSetupState;
  if (setupState !== null) {
    return `
      <section class="zone online-stage-zone">
        <div class="zone-header">
          <h3>Online Stage</h3>
          <span>${setupState.phase}</span>
        </div>
        ${renderOnlineSetupSummary(setupState)}
      </section>
    `;
  }

  return `
    <section class="zone online-stage-zone">
      <div class="zone-header">
        <h3>Online Stage</h3>
        <span>idle</span>
      </div>
      <p class="panel-copy">Create or join a room, then start synchronized setup from the lobby controls.</p>
    </section>
  `;
}

function renderOnlineActionDock(): string {
  const controls = getOnlineControlState();
  const {
    canStartRoundSetup,
    canAdminForceStartRoundSetup,
    canAutoResolveDealer,
    canAdminAutoResolveDealer,
    canDeclareGiveUp,
    canAdminDeclareGiveUp,
    canDealCards,
    canAdminDealCards,
    canFlipDrawCard,
    canAdminFlipDrawCard,
    canPrepareNextRound,
    canAdminPrepareNextRound,
    canLeaveRoom,
    canDeleteCurrentRoom,
    syncedPlayState,
    syncedSetupState,
    phaseHint
  } = controls;

  const hasActions =
    canStartRoundSetup ||
    canAdminForceStartRoundSetup ||
    canAutoResolveDealer ||
    canAdminAutoResolveDealer ||
    canDeclareGiveUp ||
    canAdminDeclareGiveUp ||
    canDealCards ||
    canAdminDealCards ||
    canFlipDrawCard ||
    canAdminFlipDrawCard ||
    canPrepareNextRound ||
    canAdminPrepareNextRound ||
    canDeleteCurrentRoom ||
    canLeaveRoom;

  return `
    <section class="zone board-action-dock">
      <div class="zone-header">
        <h3>Action Dock</h3>
        <span>${syncedPlayState !== null ? "game" : syncedSetupState !== null ? "setup" : "room"}</span>
      </div>
      <p class="panel-copy">${phaseHint}</p>
      <div class="board-action-row">
        ${canStartRoundSetup ? `<button id="online-start-round-setup" class="primary-button">Start Setup</button>` : ""}
        ${canAdminForceStartRoundSetup ? `<button id="online-admin-start-round-setup" class="primary-button">Admin Force Start</button>` : ""}
        ${canAutoResolveDealer ? `<button id="online-auto-resolve-dealer" class="primary-button">Resolve Dealer</button>` : ""}
        ${canAdminAutoResolveDealer ? `<button id="online-admin-auto-resolve-dealer" class="primary-button">Admin Resolve Dealer</button>` : ""}
        ${canDeclareGiveUp ? `<button id="online-play-decision" class="secondary-button">Play</button>` : ""}
        ${canDeclareGiveUp ? `<button id="online-giveup-decision" class="secondary-button">Give Up</button>` : ""}
        ${canAdminDeclareGiveUp ? `<button id="online-admin-play-decision" class="secondary-button">Admin Play</button>` : ""}
        ${canAdminDeclareGiveUp ? `<button id="online-admin-giveup-decision" class="secondary-button">Admin Give Up</button>` : ""}
        ${canDealCards ? `<button id="online-deal-cards" class="primary-button">Deal Cards</button>` : ""}
        ${canAdminDealCards ? `<button id="online-admin-deal-cards" class="primary-button">Admin Deal Cards</button>` : ""}
        ${canFlipDrawCard ? `<button id="online-flip-draw-card" class="primary-button">Flip Draw Card</button>` : ""}
        ${canAdminFlipDrawCard ? `<button id="online-admin-flip-draw-card" class="primary-button">Admin Flip Draw</button>` : ""}
        ${canPrepareNextRound ? `<button id="online-prepare-next-round" class="primary-button">Prepare Next Round</button>` : ""}
        ${canAdminPrepareNextRound ? `<button id="online-admin-prepare-next-round" class="primary-button">Admin Prepare Next Round</button>` : ""}
        ${canDeleteCurrentRoom ? `<button id="online-admin-delete-room" class="secondary-button">Delete Room</button>` : ""}
        ${canLeaveRoom ? `<button id="online-leave-room-dock" class="secondary-button">Leave Room</button>` : ""}
        ${
          hasActions
            ? ""
            : `<span class="board-action-empty">No live action is available yet. Use Room Flow to create, join, or ready the roster.</span>`
        }
      </div>
    </section>
  `;
}

function renderRoundHistoryList(limit = 5): string {
  const history = state.online.roundHistory.slice(0, limit);
  if (history.length === 0) {
    return `<p class="panel-copy">No completed rounds yet.</p>`;
  }

  return `
    <div class="admin-ledger-list">
      ${history.map((entry) => {
        const scoreCards =
          entry.players.length === 0
            ? ""
            : `<div class="score-grid history-score-grid">
                ${entry.players
                  .map((player) => renderScoreDetailCard(getOnlinePlayerLabel(player.playerId), player, player.capturedCards))
                  .join("")}
              </div>`;
        const resultList =
          entry.players.length === 0
            ? `<strong>-</strong>`
            : entry.players
                .map(
                  (player) =>
                    `<div class="panel-copy"><strong>${getOnlinePlayerLabel(player.playerId)}</strong> ${player.amountWon >= 0 ? "+" : ""}${player.amountWon.toLocaleString()} KRW</div>`
                )
                .join("");

        return `
          <div class="history-entry">
            <div class="admin-room-item">
              <div>
                <strong>${entry.status === "reset" ? "Reset Round" : "Scored Round"}</strong>
                <p class="panel-copy">${entry.summaryText}</p>
                <p class="panel-copy muted">${new Date(entry.completedAt).toLocaleString()} · next dealer ${entry.nextDealerId === null ? "same" : getOnlinePlayerLabel(entry.nextDealerId)}</p>
              </div>
              <div class="history-result-list">
                ${resultList}
              </div>
            </div>
            ${scoreCards}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderPlayBoard(playState: PlayState): string {
  const activePlayerId = playState.phase === "completed" ? null : playState.currentPlayerId;
  const scoring = playState.phase === "completed"
    ? scoreRound(playState.capturedByPlayer, playState.activePlayerIds)
    : null;
  const nextDealer =
    scoring !== null && scoring.status === "scored"
      ? determineNextDealer(
          scoring.players.map((player) => ({
            playerId: player.playerId,
            finalScore: player.finalScore,
            orderIndex: playState.activePlayerIds.indexOf(player.playerId)
          }))
        )
      : null;
  const revealedDrawCard = playState.phase === "awaiting_draw_choice" ? playState.revealedDrawCard : null;
  const pendingInitialTriple =
    playState.phase === "awaiting_hand_choice"
      ? isInitialFloorTripleCapture(playState, playState.pendingHandCard)
      : playState.phase === "awaiting_draw_choice"
        ? isInitialFloorTripleCapture(playState, playState.revealedDrawCard)
        : false;
  const floorAction = getFloorAction(playState);
  const drawPileAction = playState.phase === "awaiting_draw_flip" ? "flip-draw-pile" : "";

  return `
    <div class="deal-layout table-stage-grid">
      <section class="zone stage-floor-zone ${floorAction === "" ? "" : "clickable-zone"}" ${floorAction === "" ? "" : `data-action="${floorAction}"`}>
        <div class="zone-header">
          <h3>Floor</h3>
          <span>${playState.floorCards.length} cards</span>
        </div>
        <p class="panel-copy">
          ${
            playState.phase === "awaiting_hand_choice"
              ? playState.matchingFloorCards.length > 0
                ? pendingInitialTriple
                  ? `Choose any month-matching floor card for ${playState.pendingHandCard}. All three initial floor cards of that month will be captured.`
                  : `Choose a floor card for ${playState.pendingHandCard}.`
                : `No match exists for ${playState.pendingHandCard}. Discard it from the control panel.`
              : playState.phase === "awaiting_draw_choice"
                ? playState.matchingFloorCards.length > 0
                  ? pendingInitialTriple
                    ? `Choose any month-matching floor card for ${playState.revealedDrawCard}. All three initial floor cards of that month will be captured.`
                    : `Choose a floor card for ${playState.revealedDrawCard}.`
                  : `No match exists for ${playState.revealedDrawCard}. Discard it from the control panel.`
                : "Matching floor cards become selectable during choice steps."
          }
        </p>
        <div class="card-row">
          ${playState.floorCards.map((cardId) => renderFloorCard(playState, cardId)).join("")}
        </div>
      </section>
      <section class="zone stage-pile-zone ${drawPileAction === "" ? "" : "clickable-zone"}" ${drawPileAction === "" ? "" : `data-action="${drawPileAction}"`}>
        <div class="zone-header">
          <h3>Draw Pile</h3>
          <span>${playState.drawPile.length} cards remain</span>
        </div>
        <div class="pile-stack">
          <div class="pile-card">${playState.drawPile.length}</div>
          ${
            revealedDrawCard === null
              ? ""
              : `
                <div class="revealed-card">
                  <span class="mini-label">Revealed</span>
                  ${renderCard(revealedDrawCard)}
                </div>
              `
          }
        </div>
      </section>
      <section class="zone stage-hands-zone">
        <div class="zone-header">
          <h3>Hands</h3>
          <span>Turn order: ${playState.turnOrder.join(" -> ")}</span>
        </div>
        <div class="hands-grid">
          ${playState.activePlayerIds.map((playerId) => `
            <article class="hand-panel ${playerId === activePlayerId ? "active-turn" : ""}">
              <h4>${playerId}</h4>
              <div class="card-row small">
                ${(playState.hands[playerId] ?? []).map((cardId) => renderHandCard(playState, playerId, cardId)).join("")}
              </div>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="zone stage-captured-zone">
        <div class="zone-header">
          <h3>Captured Cards</h3>
          <span>${playState.lastTurn === null ? "No turns yet" : `Last turn: ${playState.lastTurn.playerId}`}</span>
        </div>
        <div class="hands-grid">
          ${playState.activePlayerIds.map((playerId) => `
            <article class="hand-panel">
              <h4>${playerId}</h4>
              <div class="card-row small">
                ${(playState.capturedByPlayer[playerId] ?? []).map(renderCard).join("")}
              </div>
            </article>
          `).join("")}
        </div>
      </section>
      ${
        scoring === null
          ? ""
          : `
            <section class="zone stage-result-zone">
              <div class="zone-header">
                <h3>Round Result</h3>
                <span>${scoring.status === "reset" ? "Reset" : `Next dealer: ${nextDealer?.playerId ?? "pending"}`}</span>
              </div>
              ${
                scoring.status === "reset"
                  ? `<p class="panel-copy">Three or more players completed Yak. This round resets with no gains or losses.</p>`
                  : `<div class="score-grid">
                      ${scoring.players.map((player) => `
                        <article class="score-card">
                          <h4>${player.playerId}</h4>
                          <p class="score-line">Base: <strong>${player.baseCardScore}</strong></p>
                          <p class="score-line">Entry: <strong>${player.entryFee}</strong></p>
                          <p class="score-line">Yak: <strong>${player.yakNetScore}</strong></p>
                          <p class="score-line">Final: <strong>${player.finalScore}</strong></p>
                          <p class="score-line">Money: <strong>${player.amountWon.toLocaleString()} KRW</strong></p>
                          <p class="score-line muted">Counts: gwang ${player.counts.gwang}, yeolkkeut ${player.counts.yeolkkeut}, tti ${player.counts.tti}, pi ${player.counts.pi}</p>
                          <p class="score-line muted">Yak: ${player.yakMonths.length === 0 ? "none" : player.yakMonths.join(", ")}</p>
                       </article>
                      `).join("")}
                    </div>`
              }
              <div class="zone-header">
                <h3>Recent Rounds</h3>
                <span>${state.online.roundHistory.length} saved</span>
              </div>
              ${renderRoundHistoryList(3)}
            </section>
          `
      }
    </div>
  `;
}

function renderFloorCard(playState: PlayState, cardId: string): string {
  if (isSelectableFloorCard(playState, cardId)) {
    return `<button class="choice-card-button floor-choice-button" data-floor-card-id="${cardId}" title="Choose ${cardId}">${renderCard(cardId)}</button>`;
  }

  return renderCard(cardId);
}

function renderHandCard(playState: PlayState, playerId: string, cardId: string): string {
  if (
    (playState.phase === "awaiting_hand_play" || playState.phase === "awaiting_hand_choice") &&
    playState.currentPlayerId === playerId
  ) {
    return `<button class="play-card-button" data-card-id="${cardId}" title="Play ${cardId}">${renderCard(cardId)}</button>`;
  }

  return renderCard(cardId);
}

function renderOnlineFloorCard(playState: PlayStateView, cardId: string, isCurrentOnlinePlayer: boolean): string {
  if (
    isCurrentOnlinePlayer &&
    (playState.phase === "awaiting_hand_choice" || playState.phase === "awaiting_draw_choice") &&
    playState.matchingFloorCards.includes(cardId)
  ) {
    return `<button class="online-floor-choice-button" data-online-floor-card-id="${cardId}" title="Choose ${cardId}">${renderVisibleCard(cardId)}</button>`;
  }

  return renderVisibleCard(cardId);
}

function renderOnlineHandCard(
  playState: PlayStateView,
  playerId: string,
  cardId: VisibleCard,
  isCurrentOnlinePlayer: boolean
): string {
  if (
    isCurrentOnlinePlayer &&
    (playState.phase === "awaiting_hand_play" || playState.phase === "awaiting_hand_choice") &&
    playState.currentPlayerId === playerId &&
    cardId !== "hidden"
  ) {
    return `<button class="online-play-card-button" data-online-card-id="${cardId}" title="Play ${cardId}">${renderVisibleCard(cardId)}</button>`;
  }

  return renderVisibleCard(cardId);
}

function isSelectableFloorCard(playState: PlayState, cardId: string): boolean {
  if (playState.phase === "awaiting_hand_choice" || playState.phase === "awaiting_draw_choice") {
    return playState.matchingFloorCards.includes(cardId);
  }

  return false;
}

function renderCard(cardId: string): string {
  return `<img class="card-art" src="${getCardImage(cardId)}" alt="${cardId}" title="${cardId}" />`;
}

function renderVisibleCard(cardId: VisibleCard): string {
  if (cardId === "hidden") {
    return `<div class="card-back" title="Hidden card"><span>Hidden</span></div>`;
  }

  return renderCard(cardId);
}

function bindEvents(): void {
  if (state.auth.status !== "authenticated" || state.auth.user === null) {
    document.querySelector<HTMLButtonElement>("#auth-show-login")?.addEventListener("click", () => {
      state = {
        ...state,
        auth: {
          ...state.auth,
          activeForm: "login",
          error: null
        }
      };
      render();
    });

    document.querySelector<HTMLButtonElement>("#auth-show-signup")?.addEventListener("click", () => {
      state = {
        ...state,
        auth: {
          ...state.auth,
          activeForm: "signup",
          error: null
        }
      };
      render();
    });

    document.querySelector<HTMLInputElement>("#auth-login-user-id")?.addEventListener("input", (event) => {
      updateAuthField("loginUserId", (event.currentTarget as HTMLInputElement).value);
    });
    document.querySelector<HTMLInputElement>("#auth-login-password")?.addEventListener("input", (event) => {
      updateAuthField("loginPassword", (event.currentTarget as HTMLInputElement).value);
    });
    document.querySelector<HTMLInputElement>("#auth-signup-user-id")?.addEventListener("input", (event) => {
      updateAuthField("signupUserId", (event.currentTarget as HTMLInputElement).value);
    });
    document.querySelector<HTMLInputElement>("#auth-signup-name")?.addEventListener("input", (event) => {
      updateAuthField("signupName", (event.currentTarget as HTMLInputElement).value);
    });
    document.querySelector<HTMLInputElement>("#auth-signup-password")?.addEventListener("input", (event) => {
      updateAuthField("signupPassword", (event.currentTarget as HTMLInputElement).value);
    });
    document.querySelector<HTMLButtonElement>("#auth-login-submit")?.addEventListener("click", () => {
      void submitLogin();
    });
    document.querySelector<HTMLButtonElement>("#auth-signup-submit")?.addEventListener("click", () => {
      void submitSignup();
    });
    return;
  }

  document.querySelectorAll<HTMLButtonElement>(".home-menu-button").forEach((button) => {
    button.addEventListener("click", () => {
      const section = button.dataset.homeMenuSection as HomeMenuSection | undefined;
      if (section === undefined) {
        return;
      }

      state = {
        ...state,
        homeMenuSection: section
      };
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#home-back-button")?.addEventListener("click", () => {
    state = {
      ...state,
      homeMenuSection: "home"
    };
    render();
  });

  document.querySelector<HTMLInputElement>("#settings-server-url")?.addEventListener("change", (event) => {
    updateOnlineField("serverUrl", (event.currentTarget as HTMLInputElement).value);
  });

  document.querySelector<HTMLInputElement>("#settings-display-name")?.addEventListener("change", (event) => {
    updateOnlineField("displayNameInput", (event.currentTarget as HTMLInputElement).value);
  });

  document.querySelector<HTMLInputElement>("#online-room-id")?.addEventListener("change", (event) => {
    updateOnlineField("roomIdInput", (event.currentTarget as HTMLInputElement).value);
  });

  document.querySelector<HTMLButtonElement>("#auth-logout")?.addEventListener("click", () => {
    void logoutAuthenticatedUser();
  });
  document.querySelector<HTMLButtonElement>("#auth-logout-settings")?.addEventListener("click", () => {
    void logoutAuthenticatedUser();
  });
  document.querySelector<HTMLButtonElement>("#settings-reconnect-server")?.addEventListener("click", () => {
    reconnectOnlineServer();
  });

  document.querySelector<HTMLButtonElement>("#online-create-room")?.addEventListener("click", () => {
    sendOnlineRoomAction("create_room");
  });

  document.querySelector<HTMLButtonElement>("#online-join-room")?.addEventListener("click", () => {
    sendOnlineRoomAction("join_room");
  });

  document.querySelector<HTMLButtonElement>("#online-refresh-room-list")?.addEventListener("click", () => {
    void fetchPublicRooms();
  });

  document.querySelectorAll<HTMLButtonElement>(".online-room-list-join").forEach((button) => {
    button.addEventListener("click", () => {
      const roomId = button.dataset.roomId;
      if (roomId === undefined) {
        return;
      }

      updateOnlineField("roomIdInput", roomId);
      sendOnlineMessage({
        type: "join_room",
        roomId
      });
    });
  });

  document.querySelector<HTMLButtonElement>("#online-leave-room")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "leave_room" });
  });
  document.querySelector<HTMLButtonElement>("#online-leave-room-dock")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "leave_room" });
  });

  document.querySelector<HTMLButtonElement>("#online-toggle-ready")?.addEventListener("click", () => {
    const connectedPlayer = getConnectedOnlineRoomPlayer();
    if (connectedPlayer === null) {
      return;
    }

    if (!onlineServerSupportsReadyToggle()) {
      state = {
        ...state,
        online: {
          ...state.online,
          error: "The running server is outdated. Restart `npm run server` and reconnect."
        }
      };
      render();
      return;
    }

    sendOnlineMessage({
      type: "set_ready",
      isReady: !connectedPlayer.isReady
    });
  });

  document.querySelector<HTMLButtonElement>("#online-add-test-bot")?.addEventListener("click", () => {
    if (!onlineServerSupportsBots()) {
      state = {
        ...state,
        online: {
          ...state.online,
          error: "This server does not support test bots. Restart the multiplayer server."
        }
      };
      render();
      return;
    }

    sendOnlineMessage({
      type: "add_test_bot"
    });
  });

  document.querySelector<HTMLButtonElement>("#settings-set-display-name")?.addEventListener("click", () => {
    if (!onlineServerSupportsDisplayName()) {
      state = {
        ...state,
        online: {
          ...state.online,
          error: "This server does not support display names. Restart the multiplayer server."
        }
      };
      render();
      return;
    }

    sendOnlineMessage({
      type: "set_display_name",
      displayName: state.online.displayNameInput
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".online-transfer-host-button").forEach((button) => {
    button.addEventListener("click", () => {
      const targetPlayerId = button.dataset.targetPlayerId;
      if (targetPlayerId === undefined) {
        return;
      }

      sendOnlineMessage({
        type: "transfer_host",
        targetPlayerId
      });
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".online-kick-player-button").forEach((button) => {
    button.addEventListener("click", () => {
      const targetPlayerId = button.dataset.targetPlayerId;
      if (targetPlayerId === undefined) {
        return;
      }

      sendOnlineMessage({
        type: "kick_player",
        targetPlayerId
      });
    });
  });

  document.querySelector<HTMLInputElement>("#admin-watch-room-id")?.addEventListener("input", (event) => {
    updateAuthField("watchRoomIdInput", (event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLButtonElement>("#admin-watch-room")?.addEventListener("click", () => {
    sendOnlineMessage({
      type: "watch_room",
      roomId: state.auth.watchRoomIdInput
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".admin-watch-room-quick").forEach((button) => {
    button.addEventListener("click", () => {
      const roomId = button.dataset.roomId;
      if (roomId === undefined) {
        return;
      }

      updateAuthField("watchRoomIdInput", roomId);
      sendOnlineMessage({
        type: "watch_room",
        roomId
      });
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".admin-delete-room-quick, .admin-delete-room-current").forEach((button) => {
    button.addEventListener("click", () => {
      const roomId = button.dataset.roomId;
      if (roomId === undefined) {
        return;
      }

      if (!window.confirm(`Delete room ${roomId}?`)) {
        return;
      }

      sendOnlineMessage({
        type: "delete_room",
        roomId
      });
    });
  });
  document.querySelector<HTMLButtonElement>("#admin-stop-watch-room")?.addEventListener("click", () => {
    sendOnlineMessage({
      type: "stop_watching_room"
    });
  });
  document.querySelector<HTMLInputElement>("#admin-balance-user-id")?.addEventListener("input", (event) => {
    updateAuthField("adminBalanceUserId", (event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLInputElement>("#admin-balance-amount")?.addEventListener("input", (event) => {
    updateAuthField("adminBalanceAmount", (event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLButtonElement>("#admin-refresh-overview")?.addEventListener("click", () => {
    void fetchAdminOverview();
  });
  document.querySelector<HTMLButtonElement>("#admin-adjust-balance")?.addEventListener("click", () => {
    void adjustAdminBalance();
  });

  document.querySelector<HTMLButtonElement>("#online-start-round-setup")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "start_round_setup" });
  });
  document.querySelector<HTMLButtonElement>("#online-admin-start-round-setup")?.addEventListener("click", () => {
    const roomId = getActiveOnlineRoomId();
    if (roomId === null) {
      return;
    }

    sendOnlineMessage({ type: "admin_start_round_setup", roomId });
  });

  document.querySelector<HTMLButtonElement>("#online-auto-resolve-dealer")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "auto_resolve_dealer" });
  });
  document.querySelector<HTMLButtonElement>("#online-admin-auto-resolve-dealer")?.addEventListener("click", () => {
    const roomId = getActiveOnlineRoomId();
    if (roomId === null) {
      return;
    }

    sendOnlineMessage({ type: "admin_auto_resolve_dealer", roomId });
  });

  document.querySelector<HTMLButtonElement>("#online-play-decision")?.addEventListener("click", () => {
    sendOnlineMessage({
      type: "declare_give_up",
      giveUp: false
    });
  });

  document.querySelector<HTMLButtonElement>("#online-giveup-decision")?.addEventListener("click", () => {
    sendOnlineMessage({
      type: "declare_give_up",
      giveUp: true
    });
  });
  document.querySelector<HTMLButtonElement>("#online-admin-play-decision")?.addEventListener("click", () => {
    const playerId = getOnlineCurrentChooserId();
    if (playerId === null) {
      return;
    }

    sendOnlineMessage({
      type: "admin_declare_give_up",
      playerId,
      giveUp: false
    });
  });
  document.querySelector<HTMLButtonElement>("#online-admin-giveup-decision")?.addEventListener("click", () => {
    const playerId = getOnlineCurrentChooserId();
    if (playerId === null) {
      return;
    }

    sendOnlineMessage({
      type: "admin_declare_give_up",
      playerId,
      giveUp: true
    });
  });

  document.querySelector<HTMLButtonElement>("#online-deal-cards")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "deal_cards" });
  });
  document.querySelector<HTMLButtonElement>("#online-admin-deal-cards")?.addEventListener("click", () => {
    const roomId = getActiveOnlineRoomId();
    if (roomId === null) {
      return;
    }

    sendOnlineMessage({ type: "admin_deal_cards", roomId });
  });

  document.querySelector<HTMLButtonElement>("#online-prepare-next-round")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "prepare_next_round" });
  });
  document.querySelector<HTMLButtonElement>("#online-admin-prepare-next-round")?.addEventListener("click", () => {
    const roomId = getActiveOnlineRoomId();
    if (roomId === null) {
      return;
    }

    sendOnlineMessage({ type: "admin_prepare_next_round", roomId });
  });
  document.querySelector<HTMLButtonElement>("#online-admin-delete-room")?.addEventListener("click", () => {
    const roomId = getActiveOnlineRoomId();
    if (roomId === null || !window.confirm(`Delete room ${roomId}?`)) {
      return;
    }

    sendOnlineMessage({ type: "delete_room", roomId });
  });

  document.querySelector<HTMLButtonElement>("#close-round-result-modal")?.addEventListener("click", () => {
    state = {
      ...state,
      online: {
        ...state.online,
        resultModalEntry: null
      }
    };
    render();
  });

  document.querySelector<HTMLDivElement>("#round-result-modal-backdrop")?.addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    state = {
      ...state,
      online: {
        ...state.online,
        resultModalEntry: null
      }
    };
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-online-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const cardId = button.dataset.onlineCardId;
      if (cardId === undefined) {
        return;
      }

      if (canAdminDriveOnlineRoom() && state.online.connectedPlayerId !== state.online.syncedPlayState?.currentPlayerId) {
        const playerId = state.online.syncedPlayState?.currentPlayerId;
        if (playerId === undefined) {
          return;
        }

        sendOnlineMessage({
          type: "admin_select_hand_card",
          playerId,
          cardId
        });
        return;
      }

      sendOnlineMessage({
        type: "select_hand_card",
        cardId
      });
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-online-floor-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const floorCardId = button.dataset.onlineFloorCardId;
      const playState = state.online.syncedPlayState;
      if (floorCardId === undefined || playState === null) {
        return;
      }

      if (playState.phase === "awaiting_hand_choice") {
        if (canAdminDriveOnlineRoom() && state.online.connectedPlayerId !== playState.currentPlayerId) {
          sendOnlineMessage({
            type: "admin_resolve_hand_choice",
            playerId: playState.currentPlayerId,
            floorCardId
          });
        } else {
          sendOnlineMessage({
            type: "resolve_hand_choice",
            floorCardId
          });
        }
        return;
      }

      if (playState.phase === "awaiting_draw_choice") {
        if (canAdminDriveOnlineRoom() && state.online.connectedPlayerId !== playState.currentPlayerId) {
          sendOnlineMessage({
            type: "admin_resolve_draw_choice",
            playerId: playState.currentPlayerId,
            floorCardId
          });
        } else {
          sendOnlineMessage({
            type: "resolve_draw_choice",
            floorCardId
          });
        }
      }
    });
  });

  document.querySelector<HTMLSelectElement>("#player-count")?.addEventListener("change", (event) => {
    const value = Number.parseInt((event.currentTarget as HTMLSelectElement).value, 10);
    state = createInitialState(value);
    render();
  });

  document.querySelector<HTMLButtonElement>("#reset-room")?.addEventListener("click", () => {
    state = createInitialState(state.playerCount);
    render();
  });

  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-player]").forEach((field) => {
    field.addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLInputElement | HTMLSelectElement;
      const playerId = input.dataset.player;
      const targetField = input.dataset.field;

      if (playerId === undefined || targetField === undefined) {
        return;
      }

      const current = state.dealerInputs[playerId];
      if (current === undefined) {
        return;
      }

      state = {
        ...state,
        dealerInputs: {
          ...state.dealerInputs,
          [playerId]: {
            ...current,
            [targetField]: Number.parseInt(input.value, 10)
          }
        }
      };
    });
  });

  document.querySelector<HTMLButtonElement>("#auto-dealer")?.addEventListener("click", () => {
    const nextInputs = { ...state.dealerInputs };
    for (const playerId of getDealerCandidates()) {
      nextInputs[playerId] = {
        month: randomBetween(1, 12),
        score: CARD_SCORES[randomBetween(0, CARD_SCORES.length - 1)]
      };
    }

    state = {
      ...state,
      dealerInputs: nextInputs
    };

    render();
  });

  document.querySelector<HTMLButtonElement>("#resolve-dealer")?.addEventListener("click", () => {
    if (state.setupState.phase !== "selecting_initial_dealer") {
      return;
    }

    const contenders = getDealerCandidates();
    const draws = contenders.map((playerId) => {
      const value = state.dealerInputs[playerId];
      return createDealerDraw(playerId, value.month, value.score);
    });

    const nextState = recordDealerDrawRound(state.setupState, { draws });
    const preparedSetupState =
      nextState.phase === "waiting_for_giveups"
        ? prepareGiveUpDealWithRedeal(
            nextState,
            () => shuffleDeck(createStandardDeck()),
            state.cutIndex
          )
        : nextState;
    const nextInputs = createDealerInputs(getCandidatesFromState(preparedSetupState));
    const nextLog = [...state.log];

    if (preparedSetupState.phase === "selecting_initial_dealer") {
      nextLog.unshift(`Dealer draw tied. Next contenders: ${getCandidatesFromState(preparedSetupState).join(", ")}`);
    } else if (preparedSetupState.phase === "waiting_for_giveups") {
      nextLog.unshift(`Dealer resolved: ${preparedSetupState.dealerId}. Hands dealt for give-up decisions.`);
    } else {
      nextLog.unshift(`Dealer resolved: ${preparedSetupState.dealerId}`);
    }

    state = {
      ...state,
      room: preparedSetupState.room,
      setupState: preparedSetupState,
      dealtState: null,
      playState: null,
      dealerInputs: nextInputs,
      log: nextLog.slice(0, 10)
    };

    render();
  });

  document.querySelector<HTMLButtonElement>("#choose-play")?.addEventListener("click", () => {
    resolveGiveUp(false);
  });

  document.querySelector<HTMLButtonElement>("#choose-giveup")?.addEventListener("click", () => {
    resolveGiveUp(true);
  });

  document.querySelector<HTMLInputElement>("#cut-index")?.addEventListener("change", (event) => {
    const value = Number.parseInt((event.currentTarget as HTMLInputElement).value, 10);
    state = {
      ...state,
      cutIndex: Number.isNaN(value) ? 0 : Math.max(0, Math.min(47, value))
    };
  });

  document.querySelector<HTMLButtonElement>("#deal-cards")?.addEventListener("click", () => {
    dealCards();
  });

  document.querySelector<HTMLButtonElement>("#redeal")?.addEventListener("click", () => {
    dealCards();
  });

  document.querySelector<HTMLButtonElement>("#prepare-next-round")?.addEventListener("click", () => {
    prepareNextRound();
  });

}

function updateOnlineField(field: "serverUrl" | "playerId" | "displayNameInput" | "roomIdInput", value: string): void {
  state = {
    ...state,
    online: {
      ...state.online,
      [field]: value
    }
  };
}

function updateAuthField(
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
): void {
  state = {
    ...state,
    auth: {
      ...state.auth,
      [field]: value
    }
  };
}

async function submitLogin(): Promise<void> {
  await submitAuthRequest("/api/auth/login", {
    userId: state.auth.loginUserId,
    password: state.auth.loginPassword
  });
}

async function submitSignup(): Promise<void> {
  await submitAuthRequest("/api/auth/signup", {
    userId: state.auth.signupUserId,
    name: state.auth.signupName,
    password: state.auth.signupPassword
  });
}

async function submitAuthRequest(path: string, payload: Record<string, string>): Promise<void> {
  state = {
    ...state,
    auth: {
      ...state.auth,
      busy: true,
      error: null
    }
  };
  render();

  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as
      | { token: string; user: AuthenticatedUserView; message?: undefined }
      | { message: string };

    if (!response.ok || "message" in data) {
      throw new Error("message" in data ? data.message : "Authentication failed.");
    }

    applyAuthenticatedUser(data.user, data.token);
    maybeAutoReconnectOnlineServer();
  } catch (error) {
    state = {
      ...state,
      auth: {
        ...state.auth,
        busy: false,
        error: error instanceof Error ? error.message : "Authentication failed."
      }
    };
    render();
  }
}

async function logoutAuthenticatedUser(reason: string | null = null): Promise<void> {
  const token = state.auth.sessionToken;
  clearAuthIdleTimer();
  disconnectOnlineServer("Logged out.");
  if (token !== null) {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ token })
    });
  }

  state = {
    ...state,
    auth: {
      status: "anonymous",
      sessionToken: null,
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
      error: reason,
      busy: false
    },
    online: {
      ...state.online,
      availableRooms: []
    }
  };
  render();
}

async function fetchAdminOverview(): Promise<void> {
  if (state.auth.user?.role !== "admin" || state.auth.sessionToken === null) {
    return;
  }

  const response = await fetch(`/api/admin/overview?token=${encodeURIComponent(state.auth.sessionToken)}`);
  const data = (await response.json()) as { viewer?: AuthenticatedUserView; overview?: AdminOverview; message?: string };
  if (!response.ok || data.overview === undefined || data.viewer === undefined) {
    throw new Error(data.message ?? "Failed to load admin overview.");
  }

  state = {
    ...state,
    auth: {
      ...state.auth,
      user: data.viewer,
      adminOverview: data.overview
    }
  };
  render();
}

async function adjustAdminBalance(): Promise<void> {
  if (state.auth.user?.role !== "admin" || state.auth.sessionToken === null) {
    return;
  }

  const response = await fetch("/api/admin/adjust-balance", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      token: state.auth.sessionToken,
      targetUserId: state.auth.adminBalanceUserId,
      amount: state.auth.adminBalanceAmount
    })
  });
  const data = (await response.json()) as { viewer?: AuthenticatedUserView; overview?: AdminOverview; message?: string };
  if (!response.ok || data.overview === undefined || data.viewer === undefined) {
    throw new Error(data.message ?? "Failed to adjust balance.");
  }

  state = {
    ...state,
    auth: {
      ...state.auth,
      user: data.viewer,
      adminOverview: data.overview,
      adminBalanceAmount: ""
    }
  };
  render();
}

function maybeAutoReconnectOnlineServer(): void {
  if (!state.online.shouldReconnect) {
    return;
  }

  connectOnlineServer();
}

function scheduleOnlineReconnect(): void {
  if (!state.online.shouldReconnect || state.online.connectionStatus !== "disconnected") {
    return;
  }

  if (pendingOnlineReconnectTimer !== null) {
    return;
  }

  pendingOnlineReconnectTimer = window.setTimeout(() => {
    pendingOnlineReconnectTimer = null;
    if (state.online.shouldReconnect && state.online.connectionStatus === "disconnected") {
      connectOnlineServer();
    }
  }, ONLINE_RECONNECT_DELAY_MS);
}

function clearPendingOnlineReconnect(): void {
  if (pendingOnlineReconnectTimer === null) {
    return;
  }

  window.clearTimeout(pendingOnlineReconnectTimer);
  pendingOnlineReconnectTimer = null;
}

function connectOnlineServer(): void {
  if (state.auth.status !== "authenticated" || state.auth.user === null || state.auth.sessionToken === null) {
    state = {
      ...state,
      auth: {
        ...state.auth,
        error: "먼저 로그인해야 합니다."
      }
    };
    render();
    return;
  }

  if (state.online.connectionStatus !== "disconnected") {
    return;
  }

  clearPendingOnlineReconnect();

  const socket = new WebSocket(state.online.serverUrl);

  state = {
    ...state,
    online: {
      ...state.online,
      socket,
      shouldReconnect: true,
      connectionStatus: "connecting",
      error: null
    },
    log: [`Connecting to ${state.online.serverUrl}...`, ...state.log].slice(0, 10)
  };

  socket.addEventListener("open", () => {
    sendSocketMessage(socket, {
      type: "identify",
      playerId: state.online.playerId,
      sessionToken: state.auth.sessionToken ?? ""
    });
  });

  socket.addEventListener("message", (event) => {
    handleOnlineServerMessage(socket, event.data.toString());
  });

  socket.addEventListener("close", () => {
    if (state.online.socket !== socket) {
      return;
    }

    const shouldReconnect = state.online.shouldReconnect;
    state = {
      ...state,
      online: {
        ...state.online,
        socket: null,
        connectionStatus: "disconnected",
        connectedPlayerId: null,
        syncedRoom: null,
        syncedSetupState: null,
        syncedPlayState: null,
        syncedActionLog: [],
        serverCapabilities: null,
        protocolVersion: null
      },
      log: [
        shouldReconnect
          ? `Multiplayer server connection closed. Reconnecting in ${Math.floor(ONLINE_RECONNECT_DELAY_MS / 1000)}s...`
          : "Multiplayer server connection closed.",
        ...state.log
      ].slice(0, 10)
    };
    render();
    if (shouldReconnect) {
      scheduleOnlineReconnect();
    }
  });

  socket.addEventListener("error", () => {
    state = {
      ...state,
      online: {
        ...state.online,
        error: "Failed to reach multiplayer server."
      },
      log: ["Multiplayer server connection failed.", ...state.log].slice(0, 10)
    };
    render();
  });

  render();
}

function disconnectOnlineServer(logMessage: string): void {
  clearPendingOnlineReconnect();
  const socket = state.online.socket;

  state = {
    ...state,
    online: {
      ...state.online,
      shouldReconnect: false,
      socket: null,
      connectionStatus: "disconnected",
      connectedPlayerId: null,
      syncedRoom: null,
      syncedSetupState: null,
      syncedPlayState: null,
      syncedActionLog: [],
      serverCapabilities: null,
      protocolVersion: null
    },
    log: [logMessage, ...state.log].slice(0, 10)
  };

  if (socket !== null) {
    socket.close();
  }

  render();
}

function reconnectOnlineServer(): void {
  if (state.auth.status !== "authenticated" || state.auth.user === null) {
    return;
  }

  if (state.online.connectionStatus === "disconnected") {
    connectOnlineServer();
    return;
  }

  clearPendingOnlineReconnect();
  const socket = state.online.socket;

  state = {
    ...state,
    online: {
      ...state.online,
      shouldReconnect: true,
      error: null
    },
    log: ["Reconnecting to multiplayer server...", ...state.log].slice(0, 10)
  };

  if (socket !== null) {
    socket.close();
  }

  render();
}

function sendOnlineRoomAction(type: "create_room" | "join_room"): void {
  const roomId = state.online.roomIdInput.trim();
  if (roomId === "") {
    state = {
      ...state,
      online: {
        ...state.online,
        error: "roomId is required."
      }
    };
    render();
    return;
  }

  sendOnlineMessage({
    type,
    roomId
  });
}

function sendOnlineMessage(message: ClientMessage): void {
  const socket = state.online.socket;
  if (socket === null || socket.readyState !== WebSocket.OPEN) {
    state = {
      ...state,
      online: {
        ...state.online,
        error: "Connect to the multiplayer server first."
      }
    };
    render();
    return;
  }

  sendSocketMessage(socket, message);
}

function sendSocketMessage(socket: WebSocket, message: ClientMessage): void {
  socket.send(JSON.stringify(message));
}

function handleOnlineServerMessage(socket: WebSocket, rawMessage: string): void {
  if (state.online.socket !== socket) {
    return;
  }

  let message: ServerMessage;

  try {
    message = JSON.parse(rawMessage) as ServerMessage;
  } catch {
    state = {
      ...state,
      online: {
        ...state.online,
        error: "Received invalid server payload."
      },
      log: ["Received invalid multiplayer payload.", ...state.log].slice(0, 10)
    };
    render();
    return;
  }

  let shouldRefreshPublicRooms = false;
  switch (message.type) {
    case "connected":
      state = {
        ...state,
        auth: {
          ...state.auth,
          user: message.viewer
        },
        online: {
          ...state.online,
          connectionStatus: "connected",
          connectedPlayerId: message.playerId,
          serverCapabilities: message.capabilities ?? null,
          protocolVersion: message.protocolVersion ?? null,
          error: null
        },
        log: [`Connected to multiplayer server as ${message.playerId}.`, ...state.log].slice(0, 10)
      };
      shouldRefreshPublicRooms = true;
      break;
    case "room_snapshot":
      const latestHistoryEntry = message.roundHistory[0] ?? null;
      const shouldRefreshFromSnapshot = shouldRefreshPublicRoomsFromSnapshot(
        state.online.syncedRoom,
        message.room,
        state.online.syncedSetupState,
        state.online.syncedPlayState,
        message.setupState,
        message.playState
      );
      const shouldOpenResultModal =
        latestHistoryEntry !== null &&
        latestHistoryEntry.id !== state.online.lastOpenedResultId;
      const connectedPlayer =
        message.room.players.find((player) => player.isSelf) ?? null;
      state = {
        ...state,
        auth: {
          ...state.auth,
          user: message.viewer
        },
        online: {
          ...state.online,
          syncedRoom: message.room,
          syncedSetupState: message.setupState,
          syncedPlayState: message.playState,
          syncedActionLog: message.actionLog,
          roundHistory: message.roundHistory,
          resultModalEntry: shouldOpenResultModal ? latestHistoryEntry : state.online.resultModalEntry,
          lastOpenedResultId: shouldOpenResultModal ? latestHistoryEntry.id : state.online.lastOpenedResultId,
          displayNameInput: connectedPlayer?.displayName ?? state.online.displayNameInput,
          roomIdInput: message.room.roomId,
          error: null
        }
      };
      shouldRefreshPublicRooms = shouldRefreshFromSnapshot;
      break;
    case "left_room":
      state = {
        ...state,
        online: {
          ...state.online,
          syncedRoom: null,
          syncedSetupState: null,
          syncedPlayState: null,
          syncedActionLog: [],
          roundHistory: [],
          resultModalEntry: null,
          error: null
        },
        log: [`Left room ${message.roomId ?? "(none)"}.`, ...state.log].slice(0, 10)
      };
      shouldRefreshPublicRooms = true;
      break;
    case "error":
      state = {
        ...state,
        online: {
          ...state.online,
          error: getOnlineCompatibilityError(message.message)
        },
        log: [`Server error: ${getOnlineCompatibilityError(message.message)}`, ...state.log].slice(0, 10)
      };
      break;
    default:
      assertNever(message);
  }

  render();
  if (shouldRefreshPublicRooms) {
    void fetchPublicRooms();
    if (state.auth.user?.role === "admin") {
      void fetchAdminOverview();
    }
  }
}

function resolveGiveUp(giveUp: boolean): void {
  if (state.setupState.phase !== "waiting_for_giveups") {
    return;
  }

  if (state.setupState.pendingDeal === null) {
    return;
  }

  const currentPlayerId = state.setupState.currentPlayerId;
  const nextState = declareGiveUp(state.setupState, currentPlayerId, giveUp);
  const verb = giveUp ? "gave up and moved to spectator mode" : "stayed in the round";

  state = {
    ...state,
    room: nextState.room,
    setupState: nextState,
    dealtState: null,
    playState: null,
    log: [`${currentPlayerId} ${verb}.`, ...state.log].slice(0, 10)
  };

  render();
}

function dealCards(): void {
  if (state.setupState.phase !== "ready_to_play") {
    return;
  }

  const usedPredealtRound = state.setupState.predealtRound !== null;
  const dealtState = prepareFinalFiveDealWithRedeal(
    state.setupState,
    () => shuffleDeck(createStandardDeck()),
    state.cutIndex
  );
  const playState = createPlayState(dealtState);
  const redealText =
    dealtState.redealCount > 0 ? ` Redealt ${dealtState.redealCount} extra time(s) due to 4-card month resets.` : "";

  state = {
    ...state,
    dealtState,
    playState,
    log: [
      usedPredealtRound
        ? `Hidden floor revealed. ${playState.currentPlayerId} opens the round with the locked final five.`
        : `Final five dealt with cut index ${state.cutIndex}.${redealText} ${playState.currentPlayerId} opens the round.`,
      ...state.log
    ].slice(0, 10)
  };

  render();
}

function resolveSelectedHandCard(cardId: string): void {
  if (
    state.playState === null ||
    (state.playState.phase !== "awaiting_hand_play" && state.playState.phase !== "awaiting_hand_choice")
  ) {
    return;
  }

  const currentPlayerId = state.playState.currentPlayerId;
  const nextPlayState = selectHandCard(state.playState, cardId);

  state = {
    ...state,
    playState: nextPlayState,
    log: [`${currentPlayerId} selected ${cardId} for the hand step.`, ...state.log].slice(0, 10)
  };

  render();
}

function resolveDiscardChoice(): void {
  if (state.playState === null) {
    return;
  }

  if (state.playState.phase === "awaiting_hand_choice") {
    if (state.playState.matchingFloorCards.length > 0) {
      return;
    }

    const currentPlayerId = state.playState.currentPlayerId;
    const pendingHandCard = state.playState.pendingHandCard;
    const nextPlayState = resolveHandChoice(state.playState, null);

    state = {
      ...state,
      playState: nextPlayState,
      log: [`${currentPlayerId} discarded ${pendingHandCard} to the floor.`, ...state.log].slice(0, 10)
    };

    render();
    return;
  }

  if (state.playState.phase === "awaiting_draw_choice") {
    if (state.playState.matchingFloorCards.length > 0) {
      return;
    }

    const currentPlayerId = state.playState.currentPlayerId;
    const revealedDrawCard = state.playState.revealedDrawCard;
    const nextPlayState = resolveDrawChoice(state.playState, null);
    const summary =
      nextPlayState.phase === "completed"
        ? `${currentPlayerId} discarded ${revealedDrawCard} and finished the round.`
        : `${currentPlayerId} discarded ${revealedDrawCard}. Turn passes to ${nextPlayState.currentPlayerId}.`;

    state = {
      ...state,
      playState: nextPlayState,
      log: [summary, ...state.log].slice(0, 10)
    };

    render();
  }
}

function resolveDrawFlip(): void {
  if (state.playState === null || state.playState.phase !== "awaiting_draw_flip") {
    return;
  }

  const currentPlayerId = state.playState.currentPlayerId;
  const nextPlayState = flipDrawCard(state.playState);

  state = {
    ...state,
    playState: nextPlayState,
    log: [`${currentPlayerId} revealed ${nextPlayState.revealedDrawCard}.`, ...state.log].slice(0, 10)
  };

  render();
}

function prepareNextRound(): void {
  if (state.playState === null || state.playState.phase !== "completed") {
    return;
  }

  const scoring = scoreRound(state.playState.capturedByPlayer, state.playState.activePlayerIds);
  const nextDealerId =
    scoring.status === "scored"
      ? determineNextDealer(
          scoring.players.map((player) => ({
            playerId: player.playerId,
            finalScore: player.finalScore,
            orderIndex: state.playState!.activePlayerIds.indexOf(player.playerId)
          }))
        ).playerId
      : state.playState.dealerId;
  const nextSetupState = createNextRoundSetup(state.playState.room, nextDealerId);
  const preparedNextSetupState =
    nextSetupState.phase === "waiting_for_giveups"
      ? prepareGiveUpDealWithRedeal(
          nextSetupState,
          () => shuffleDeck(createStandardDeck()),
          state.cutIndex
        )
      : nextSetupState;
  const resetText =
    scoring.status === "reset"
      ? ` Round reset kept dealer ${nextDealerId} for the next local round.`
      : "";

  state = {
    ...state,
    room: preparedNextSetupState.room,
    setupState: preparedNextSetupState,
    dealtState: null,
    playState: null,
    log: [`Prepared next round with dealer ${nextDealerId}.${resetText}`, ...state.log].slice(0, 10)
  };

  render();
}

function resolveFloorChoice(floorCardId: string): void {
  if (state.playState === null) {
    return;
  }

  if (state.playState.phase === "awaiting_hand_choice") {
    const currentPlayerId = state.playState.currentPlayerId;
    const pendingHandCard = state.playState.pendingHandCard;
    const isInitialTriple = isInitialFloorTripleCapture(state.playState, pendingHandCard);
    const nextPlayState = resolveHandChoice(state.playState, floorCardId);

    state = {
      ...state,
      playState: nextPlayState,
      log: [
        isInitialTriple
          ? `${currentPlayerId} completed the initial floor triple with ${pendingHandCard} and captured all three matching floor cards.`
          : `${currentPlayerId} captured ${floorCardId} with ${pendingHandCard}.`,
        ...state.log
      ].slice(0, 10)
    };

    render();
    return;
  }

  if (state.playState.phase === "awaiting_draw_choice") {
    const currentPlayerId = state.playState.currentPlayerId;
    const revealedDrawCard = state.playState.revealedDrawCard;
    const isInitialTriple = isInitialFloorTripleCapture(state.playState, revealedDrawCard);
    const nextPlayState = resolveDrawChoice(state.playState, floorCardId);
    const summary =
      isInitialTriple
        ? nextPlayState.phase === "completed"
          ? `${currentPlayerId} completed the initial floor triple with ${revealedDrawCard}, captured all three matching floor cards, and finished the round.`
          : `${currentPlayerId} completed the initial floor triple with ${revealedDrawCard} and captured all three matching floor cards. Turn passes to ${nextPlayState.currentPlayerId}.`
        : nextPlayState.phase === "completed"
          ? `${currentPlayerId} captured ${floorCardId} with ${revealedDrawCard} and finished the round.`
          : `${currentPlayerId} captured ${floorCardId} with ${revealedDrawCard}. Turn passes to ${nextPlayState.currentPlayerId}.`;

    state = {
      ...state,
      playState: nextPlayState,
      log: [summary, ...state.log].slice(0, 10)
    };

    render();
  }
}

function getDealerCandidates(): string[] {
  return getCandidatesFromState(state.setupState);
}

function getCandidatesFromState(setupState: RoundSetupState): string[] {
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

function getPhaseLabel(): string {
  if (state.playState !== null) {
    return getPlayPhaseLabel(state.playState);
  }

  if (state.dealtState !== null) {
    return "cards dealt";
  }

  return state.setupState.phase.replaceAll("_", " ");
}

function getPlayPhaseLabel(playState: PlayState): string {
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

function getDealerLabel(): string {
  if (state.playState !== null) {
    return state.playState.dealerId;
  }

  if (state.dealtState !== null) {
    return state.dealtState.dealerId;
  }

  if (state.setupState.phase === "selecting_initial_dealer") {
    return "pending";
  }

  return state.setupState.dealerId;
}

function getOnlineDealerLabel(): string {
  if (state.online.syncedPlayState !== null) {
    return state.online.syncedPlayState.dealerId;
  }

  if (state.online.syncedSetupState === null) {
    return "pending";
  }

  if (state.online.syncedSetupState.phase === "selecting_initial_dealer") {
    return "pending";
  }

  return state.online.syncedSetupState.dealerId;
}

function getActiveCount(): number {
  if (state.playState !== null) {
    return state.playState.activePlayerIds.length;
  }

  if (state.dealtState !== null) {
    return state.dealtState.activePlayerIds.length;
  }

  if (state.setupState.phase === "selecting_initial_dealer") {
    return state.room.players.length;
  }

  if (state.setupState.phase === "waiting_for_giveups") {
    return state.setupState.turnOrder.filter((playerId) => state.setupState.decisions[playerId] !== "give_up").length;
  }

  return state.setupState.activePlayerIds.length;
}

function getOnlineActiveCount(): number {
  if (state.online.syncedPlayState !== null) {
    return state.online.syncedPlayState.activePlayerIds.length;
  }

  if (state.online.syncedSetupState === null) {
    return state.online.syncedRoom?.players.length ?? 0;
  }

  if (state.online.syncedSetupState.phase === "selecting_initial_dealer") {
    return state.online.syncedRoom?.players.length ?? 0;
  }

  if (state.online.syncedSetupState.phase === "waiting_for_giveups") {
    return state.online.syncedSetupState.turnOrder.filter(
      (playerId) => state.online.syncedSetupState?.decisions[playerId] !== "give_up"
    ).length;
  }

  return state.online.syncedSetupState.activePlayerIds.length;
}

function getCardImage(cardId: string): string {
  return `/cards/minhwatu/exported/${cardId}.png`;
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getFloorAction(playState: PlayState): "discard-to-floor" | "" {
  if (playState.phase === "awaiting_hand_choice" || playState.phase === "awaiting_draw_choice") {
    return playState.matchingFloorCards.length === 0 ? "discard-to-floor" : "";
  }

  return "";
}

function getOnlineFloorAction(
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

function isInitialFloorTripleCapture(
  playState: Extract<PlayState, { phase: "awaiting_hand_choice" | "awaiting_draw_choice" }>,
  cardId: string
): boolean {
  return playState.matchingFloorCards.length === 3 && playState.initialFloorTripleMonths.includes(Number.parseInt(cardId.slice(0, 2), 10));
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const floorChoiceButton = target.closest<HTMLButtonElement>(".floor-choice-button");
  if (floorChoiceButton !== null) {
    const floorCardId = floorChoiceButton.dataset.floorCardId;
    if (floorCardId !== undefined) {
      resolveFloorChoice(floorCardId);
    }
    return;
  }

  const discardTrigger = target.closest<HTMLElement>("#discard-pending-card, [data-action='discard-to-floor']");
  if (discardTrigger !== null) {
    resolveDiscardChoice();
    return;
  }

  const onlineDiscardTrigger = target.closest<HTMLElement>("#online-discard-hand-choice, #online-discard-draw-choice, [data-online-action='discard-to-floor']");
  if (onlineDiscardTrigger !== null) {
    const playState = state.online.syncedPlayState;
    if (playState?.phase === "awaiting_hand_choice") {
      if (canAdminDriveOnlineRoom() && state.online.connectedPlayerId !== playState.currentPlayerId) {
        sendOnlineMessage({
          type: "admin_resolve_hand_choice",
          playerId: playState.currentPlayerId,
          floorCardId: null
        });
      } else {
        sendOnlineMessage({
          type: "resolve_hand_choice",
          floorCardId: null
        });
      }
      return;
    }

    if (playState?.phase === "awaiting_draw_choice") {
      if (canAdminDriveOnlineRoom() && state.online.connectedPlayerId !== playState.currentPlayerId) {
        sendOnlineMessage({
          type: "admin_resolve_draw_choice",
          playerId: playState.currentPlayerId,
          floorCardId: null
        });
      } else {
        sendOnlineMessage({
          type: "resolve_draw_choice",
          floorCardId: null
        });
      }
      return;
    }
  }

  const onlineDrawPileTrigger = target.closest<HTMLElement>("#online-flip-draw-card, [data-online-action='flip-draw-pile']");
  if (onlineDrawPileTrigger !== null) {
    const playState = state.online.syncedPlayState;
    if (playState?.phase === "awaiting_draw_flip") {
      if (canAdminDriveOnlineRoom() && state.online.connectedPlayerId !== playState.currentPlayerId) {
        sendOnlineMessage({
          type: "admin_flip_draw_card",
          playerId: playState.currentPlayerId
        });
      } else {
        sendOnlineMessage({ type: "flip_draw_card" });
      }
      return;
    }
  }

  const drawPileTrigger = target.closest<HTMLElement>("#flip-draw-card, [data-action='flip-draw-pile']");
  if (drawPileTrigger !== null) {
    resolveDrawFlip();
    return;
  }

  const playButton = target.closest<HTMLButtonElement>(".play-card-button");
  if (playButton === null) {
    return;
  }

  const cardId = playButton.dataset.cardId;
  if (cardId === undefined) {
    return;
  }

  resolveSelectedHandCard(cardId);
});

function assertNever(value: never): never {
  throw new Error(`Unhandled client-side branch: ${JSON.stringify(value)}`);
}
