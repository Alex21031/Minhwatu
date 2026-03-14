// Browser app runtime entry and orchestrator.
import "./styles.css";
import type {
  PlayStateView,
  RoundHistoryEntry,
  RoomView,
  RoundSetupStateView,
  VisibleCard
} from "../server/protocol.js";

import {
  scoreRound,
  type PlayState,
  type RoundSetupState
} from "../index.js";
import {
  renderCapturedCardStack as renderCapturedCardStackView,
  renderDetailedRoundHistoryList as renderDetailedRoundHistoryListView
} from "./online-render.js";
import {
  renderOnlineLobby as renderOnlineLobbyView,
  renderOnlineRoomMetaPanel as renderOnlineRoomMetaPanelView
} from "./online-room-render.js";
import {
  renderOnlineActionDockView,
  renderOnlineBoardStateView,
  renderOnlineIdleTableView,
  renderOnlineSetupSummaryView,
  renderOnlineTableView,
  renderPlayBoardView
} from "./table-render.js";
import {
  renderBoardStateView,
  renderPhaseControlsView
} from "./local-table-render.js";
import {
  getOnlineCompatibilityError,
  onlineServerSupportsDisplayName,
  onlineServerSupportsHostTransfer,
  onlineServerSupportsKickPlayer,
} from "./online-capabilities.js";
import {
  getDefaultServerUrl as getDefaultServerUrlView,
  loadPersistedAuthSession as loadPersistedAuthSessionView,
  loadPersistedOnlineSession as loadPersistedOnlineSessionView,
  persistOnlineSession as persistOnlineSessionView
} from "./online-session.js";
import {
  AUTH_SESSION_STORAGE_KEY,
  CARD_SCORES,
  ONLINE_RECONNECT_DELAY_MS,
  ONLINE_SESSION_STORAGE_KEY,
  createDealerInputs,
  createInitialAuthState,
  createInitialOnlineState,
  createInitialState,
  type AppState,
  type HomeMenuSection
} from "./app-state.js";
import { getOnlineControlState as getOnlineControlStateView } from "./online-control.js";
import {
  getActiveCount as getActiveCountView,
  getCandidatesFromState as getCandidatesFromStateView,
  getConnectedOnlineRoomPlayer as getConnectedOnlineRoomPlayerView,
  getDealerCandidates as getDealerCandidatesView,
  getDealerLabel as getDealerLabelView,
  getFloorAction as getFloorActionView,
  getOnlineActiveCount as getOnlineActiveCountView,
  getOnlineDealerLabel as getOnlineDealerLabelView,
  getOnlineFloorAction as getOnlineFloorActionView,
  getOnlinePlayer as getOnlinePlayerView,
  getOrderedOnlinePlayerIds as getOrderedOnlinePlayerIdsView,
  getPhaseLabel as getPhaseLabelView,
  getPlayPhaseLabel as getPlayPhaseLabelView,
  isInitialFloorTripleCapture as isInitialFloorTripleCaptureView,
  randomBetween as randomBetweenView,
  sortOnlineRoomPlayersBySeat as sortOnlineRoomPlayersBySeatView
} from "./app-helpers.js";
import {
  renderAuthLandingView,
  renderHomeMenuRootView,
  renderHomeMenuSectionPageView
} from "./home-render.js";
import {
  renderActiveRoomWorkspaceView,
  renderMainColumnView,
  renderRightRailView
} from "./app-layout-render.js";
import {
  renderSettingsMenuPanelView,
  renderSpectateMenuPanelView
} from "./account-menu-render.js";
import {
  getHeroEyebrowText,
  getHeroLedeText,
  getHeroTitleText,
  getHomeSectionMeta as getHomeSectionMetaView,
  getSecondaryStatLabelText,
  getSecondaryStatValueText
} from "./app-copy.js";
import { bindBoardClickRouting } from "./board-click-bindings.js";
import { createOnlineClient } from "./online-client.js";
import { createLocalRoundActions } from "./local-round-actions.js";
import { createAuthSessionRuntime } from "./auth-session-runtime.js";
import { bindAppEvents, updateAuthFieldValue, updateOnlineFieldValue } from "./event-runtime.js";
const appRoot = document.querySelector<HTMLDivElement>("#app");
let pendingOnlineReconnectTimer: number | null = null;

if (appRoot === null) {
  throw new Error("App root element was not found.");
}

let state = createAppState(7);
const onlineClient = createOnlineClient({
  getState: () => state,
  setState: (nextState) => {
    state = nextState;
  },
  render,
  clearPendingReconnect: clearPendingOnlineReconnect,
  scheduleReconnect: scheduleOnlineReconnect,
  reconnectDelayMs: ONLINE_RECONNECT_DELAY_MS,
  getCompatibilityError: getOnlineCompatibilityError
});
const localRoundActions = createLocalRoundActions({
  getState: () => state,
  setState: (nextState) => {
    state = nextState;
  },
  render
});
const authSessionRuntime = createAuthSessionRuntime({
  getState: () => state,
  setState: (nextState) => {
    state = nextState;
  },
  render,
  localStorage: window.localStorage,
  authSessionStorageKey: AUTH_SESSION_STORAGE_KEY,
  connectOnlineServer: onlineClient.connectOnlineServer,
  disconnectOnlineServer: onlineClient.disconnectOnlineServer,
  maybeAutoReconnectOnlineServer
});
bindBoardClickRouting({
  document,
  getOnlinePlayState: () => state.online.syncedPlayState,
  resolveLocalFloorChoice: (floorCardId) => {
    localRoundActions.resolveFloorChoice(floorCardId, isInitialFloorTripleCapture);
  },
  resolveLocalDiscardChoice: localRoundActions.resolveDiscardChoice,
  resolveLocalDrawFlip: localRoundActions.resolveDrawFlip,
  resolveLocalSelectedHandCard: localRoundActions.resolveSelectedHandCard,
  sendOnlineMessage: onlineClient.sendOnlineMessage
});
render();
void authSessionRuntime.restoreAuthSession();

function createAppState(playerCount: number): AppState {
  return createInitialState(
    playerCount,
    createInitialAuthState(loadPersistedAuthSessionView(window.localStorage, AUTH_SESSION_STORAGE_KEY)),
    createInitialOnlineState(
      loadPersistedOnlineSessionView(window.localStorage, ONLINE_SESSION_STORAGE_KEY),
      getDefaultServerUrlView(window.location)
    )
  );
}

function persistOnlineSession(): void {
  persistOnlineSessionView(window.localStorage, ONLINE_SESSION_STORAGE_KEY, {
    serverUrl: state.online.serverUrl,
    playerId: state.online.playerId,
    displayNameInput: state.online.displayNameInput,
    roomIdInput: state.online.roomIdInput,
    shouldReconnect: state.online.shouldReconnect
  });
}

function render(): void {
  persistOnlineSession();
  authSessionRuntime.persistAuthSession();

  if (state.auth.status !== "authenticated" || state.auth.user === null) {
    appRoot.innerHTML = renderAuthLanding();
    bindEvents();
    return;
  }

  appRoot.innerHTML = `
    <div class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">${getHeroEyebrowText(hasActiveOnlineRoom())}</p>
          <h1>${getHeroTitleText(hasActiveOnlineRoom())}</h1>
          <p class="lede">${getHeroLedeText(state.online.syncedRoom?.roomId ?? null)}</p>
        </div>
        <div class="hero-stats">
          <div class="stat-card">
            <span class="stat-label">Phase</span>
            <strong>${getPrimaryPhaseLabel()}</strong>
          </div>
          <div class="stat-card">
            <span class="stat-label">${getSecondaryStatLabelText(hasActiveOnlineRoom())}</span>
            <strong>${getSecondaryStatValueText({
              hasActiveRoom: hasActiveOnlineRoom(),
              roomId: state.online.syncedRoom?.roomId ?? null,
              balanceLabel: `${state.auth.user?.balance.toLocaleString() ?? "0"} KRW`
            })}</strong>
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
  `;

  bindEvents();
}

function renderAuthLanding(): string {
  return renderAuthLandingView({
    loginSelected: state.auth.activeForm === "login",
    error: state.auth.error,
    loginUserId: state.auth.loginUserId,
    loginPassword: state.auth.loginPassword,
    signupUserId: state.auth.signupUserId,
    signupName: state.auth.signupName,
    signupPassword: state.auth.signupPassword,
    busy: state.auth.busy
  });

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
            <p class="panel-copy auth-admin-hint">기본 관리자 계정: <strong>admin</strong> / <strong>admin1234</strong></p>
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
  return renderMainColumnView(hasActiveOnlineRoom(), renderHomeMenu(), renderActiveRoomWorkspace());
}

function renderActiveRoomWorkspace(): string {
  const room = state.online.syncedRoom;
  const titleOwner = state.auth.user?.name ?? "Player";
  const isFocusedPlay = state.online.syncedPlayState !== null;

  return renderActiveRoomWorkspaceView({
    titleOwner,
    roomId: room?.roomId ?? null,
    playerCount: room?.players.length ?? 0,
    phaseLabel: state.online.syncedPlayState?.phase ?? state.online.syncedSetupState?.phase ?? "idle",
    isFocusedPlay,
    tableHtml: renderTable(),
    onlineLobbyHtml: renderOnlineLobby(),
    roomMetaHtml: renderOnlineRoomMetaPanel()
  });
}

function renderRightRail(): string {
  return renderRightRailView(renderOnlineRoomMetaPanel());
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
  const connectionLabel =
    state.online.connectionStatus === "connected"
      ? "CONNECTED"
      : state.online.connectionStatus === "connecting"
        ? "CONNECTING"
        : "OFFLINE";

  return renderHomeMenuRootView({
    connectionLabel,
    balanceLabel: `${state.auth.user?.balance.toLocaleString() ?? "0"} KRW`,
    identityLabel: state.auth.user?.name ?? "Player",
    phaseLabel: room === null ? "Lobby Idle" : "Room Live",
    serverUrl: state.online.serverUrl,
    roomLabel: room?.roomId ?? "idle",
    playerCount: room?.players.length ?? 0,
    matchButtonHtml: renderHomeMenuButton("match", "VS", "대전", "온라인 방에 들어가 준비를 맞추고 바로 플레이를 시작합니다."),
    spectateButtonHtml: renderHomeMenuButton("spectate", "OBS", "관전", "현재 방 상태와 관전자 동작을 확인합니다."),
    settingsButtonHtml: renderHomeMenuButton("settings", "SYS", "설정", "서버 주소, 플레이어 ID, 저장된 연결 상태를 점검합니다."),
    statusRailHtml: renderHomeStatusRail()
  });

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
            ${renderHomeMenuButton("match", "VS", "대전", "온라인 방에 들어가 준비를 맞추고 바로 플레이를 시작합니다.")}
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
  const meta = getHomeSectionMetaView(state.homeMenuSection);

  return renderHomeMenuSectionPageView({
    eyebrow: meta.eyebrow,
    title: meta.title,
    description: meta.description,
    tag: meta.tag,
    toneClass: meta.toneClass,
    panelHtml: renderHomeMenuPanel(),
    statusRailHtml: renderHomeStatusRail("compact")
  });
}

function renderHomeMenuButton(
  section: HomeMenuSection,
  markOrLabel: string,
  labelOrDescription: string,
  description?: string
): string {
  const meta = getHomeSectionMetaView(section);
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
  return getOnlineControlStateView({
    connectionStatus: state.online.connectionStatus,
    syncedSetupState: state.online.syncedSetupState,
    syncedPlayState: state.online.syncedPlayState,
    syncedRoom: state.online.syncedRoom,
    connectedPlayerId: state.online.connectedPlayerId,
    connectedPlayer: getConnectedOnlineRoomPlayer(),
    serverCapabilities: state.online.serverCapabilities,
    getPlayerLabel: getOnlinePlayerLabel
  });
}


function renderMatchMenuPanel(): string {
  return `
    <section class="home-mode-stack">
      ${renderOnlineLobby()}
    </section>
  `;
}

function renderSpectateMenuPanel(): string {
  const canWatch = state.auth.user?.role === "admin";
  const activeRooms = state.auth.adminOverview?.activeRooms ?? [];

  return renderSpectateMenuPanelView({
    canWatch,
    currentRoomId: state.online.syncedRoom?.roomId ?? null,
    activeRooms,
    watchRoomIdInput: state.auth.watchRoomIdInput
  });

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
                            <button class="secondary-button admin-watch-room-quick" data-room-id="${room.roomId}">Watch</button>
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
    onlineServerSupportsDisplayName(state.online.serverCapabilities);

  return renderSettingsMenuPanelView({
    viewer,
    adminOverview,
    balanceLedger,
    shouldReconnect: state.online.shouldReconnect,
    serverUrl: state.online.serverUrl,
    displayNameInput: state.online.displayNameInput,
    canUpdateDisplayName,
    adminBalanceUserId: state.auth.adminBalanceUserId,
    adminBalanceAmount: state.auth.adminBalanceAmount
  });

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
                              <button class="secondary-button admin-watch-room-quick" data-room-id="${room.roomId}">Watch</button>
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
  return renderOnlineLobbyView({
    controls,
    authUser: state.auth.user,
    connectionStatus: state.online.connectionStatus,
    serverUrl: state.online.serverUrl,
    roomLabel: state.online.syncedRoom?.roomId ?? state.online.roomIdInput,
    roomIdInput: state.online.roomIdInput,
    seatedCount: state.online.syncedRoom?.players.length ?? 0,
    syncedRoom: state.online.syncedRoom,
    phaseLabel: state.online.syncedPlayState?.phase ?? state.online.syncedSetupState?.phase ?? "idle",
    onlineError: state.online.error
  });


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

function getConnectedOnlineRoomPlayer(): RoomView["players"][number] | null {
  return getConnectedOnlineRoomPlayerView(state.online.syncedRoom);
}

function getOnlinePlayer(playerId: string | null): RoomView["players"][number] | null {
  return getOnlinePlayerView(state.online.syncedRoom, playerId);
}

function getOnlinePlayerLabel(playerId: string | null): string {
  const player = getOnlinePlayer(playerId);
  if (player === null) {
    return playerId ?? "hidden";
  }

  return player.displayName;
}

function renderOnlineRoomMetaPanel(): string {
  const room = state.online.syncedRoom;
  const connectedPlayer = getConnectedOnlineRoomPlayer();
  const isHost = connectedPlayer !== null && room?.hostPlayerId === connectedPlayer.playerId;
  const supportsHostTransfer = onlineServerSupportsHostTransfer(state.online.serverCapabilities);
  const supportsKickPlayer = onlineServerSupportsKickPlayer(state.online.serverCapabilities);
  const canManageRoster = state.online.connectionStatus === "connected" && isHost && (supportsHostTransfer || supportsKickPlayer);

  if (room === null) {
    return "";
  }

  return renderOnlineRoomMetaPanelView({
    room,
    connectedPlayer,
    canManageRoster,
    supportsHostTransfer,
    supportsKickPlayer,
    sortedPlayers: sortOnlineRoomPlayersBySeat(room.players),
    getPlayerLabel: getOnlinePlayerLabel
  });

}

function renderOnlineSetupSummary(setupState: RoundSetupStateView | null): string {
  return renderOnlineSetupSummaryView(setupState, {
    getPlayerLabel: getOnlinePlayerLabel,
    renderVisibleCard
  });
}

function renderOnlinePlaySummary(playState: PlayStateView | null): string {
  if (playState === null) {
    return `<p class="panel-copy">No synchronized play state is active for this room.</p>`;
  }

  const isCurrentOnlinePlayer =
    playState.phase !== "completed" && playState.currentPlayerId === state.online.connectedPlayerId;
  const onlineFloorAction = getOnlineFloorAction(playState, isCurrentOnlinePlayer);
  const onlineDrawPileAction =
    isCurrentOnlinePlayer && playState.phase === "awaiting_draw_flip" ? "flip-draw-pile" : "";
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
        ${topPlayerIds.map((playerId) => renderOnlinePlayerPod(playState, playerId, "top", isCurrentOnlinePlayer)).join("")}
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
              : "Waiting for the active synchronized player."
        }</p>
        ${renderOnlineActionHint(playState, isCurrentOnlinePlayer)}
        <div class="online-center-grid">
          <section class="zone online-floor-cluster ${onlineFloorAction === "" ? "" : "clickable-zone"}" ${onlineFloorAction === "" ? "" : `data-online-action="${onlineFloorAction}"`}>
            <div class="zone-header">
              <h3>Floor</h3>
              <span>${playState.floorCards.length} cards</span>
            </div>
            <div class="card-row online-floor-row">
              ${playState.floorCards.map((cardId) => renderOnlineFloorCard(playState, cardId, isCurrentOnlinePlayer)).join("")}
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
          : `<div class="online-self-band">${renderOnlinePlayerPod(playState, bottomPlayerId, "bottom", isCurrentOnlinePlayer)}</div>`
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
                      renderDetailedScoreCard(
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

function renderOnlineActionHint(playState: PlayStateView, isCurrentOnlinePlayer: boolean): string {
  if (!isCurrentOnlinePlayer && playState.phase !== "completed") {
    return `<p class="panel-copy">Only ${getOnlinePlayerLabel(playState.currentPlayerId)} can send the next synchronized action.</p>`;
  }

  switch (playState.phase) {
    case "awaiting_hand_play":
      return `<p class="panel-copy">Select one card from your hand to start the synchronized turn.</p>`;
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
      return `<p class="panel-copy">Flip the top server-authoritative draw card to continue.</p>`;
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
  return renderPhaseControlsView({
    playState: state.playState,
    setupState: state.setupState,
    cutIndex: state.cutIndex,
    dealerInputs: state.dealerInputs,
    cardScores: CARD_SCORES,
    getDealerCandidates,
    getPlayPhaseLabel,
    isInitialFloorTripleCapture,
    renderCard
  });
}

function renderTable(): string {
  if (hasActiveOnlineRoom()) {
    return renderOnlineTable();
  }

  return renderOnlineIdleTable();
}

function renderOnlineIdleTable(): string {
  return renderOnlineIdleTableView({
    connectionStatus: state.online.connectionStatus,
    playerId: state.online.playerId,
    connectedPlayerId: state.online.connectedPlayerId
  });
}

function renderOnlineTable(): string {
  const room = state.online.syncedRoom;
  if (room === null) {
    return "";
  }

  return renderOnlineTableView({
    roomId: room.roomId,
    dealerLabel: getOnlinePlayerLabel(getOnlineDealerLabel()),
    activeCount: getOnlineActiveCount(),
    viewerLabel: state.online.connectedPlayerId === null ? "guest" : getOnlinePlayerLabel(state.online.connectedPlayerId),
    balanceLabel: `${(state.auth.user?.balance ?? 0).toLocaleString()} KRW`,
    phaseLabel: state.online.syncedPlayState?.phase ?? state.online.syncedSetupState?.phase ?? "idle",
    currentLabel:
      state.online.syncedPlayState?.phase === "completed"
        ? "round complete"
        : state.online.syncedPlayState !== null
          ? getOnlinePlayerLabel(state.online.syncedPlayState.currentPlayerId)
          : state.online.syncedSetupState?.phase === "waiting_for_giveups"
            ? getOnlinePlayerLabel(state.online.syncedSetupState.currentPlayerId)
            : "waiting",
    connectedCount: room.players.filter((player) => player.isConnected).length,
    readyCount: room.players.filter((player) => player.isReady).length,
    totalPlayers: room.players.length,
    boardHtml: renderOnlineBoardState(),
    actionDockHtml: renderOnlineActionDock()
  });
}

function sortOnlineRoomPlayersBySeat(players: RoomView["players"]): RoomView["players"] {
  return sortOnlineRoomPlayersBySeatView(players);
}

function getOrderedOnlinePlayerIds(playerIds: string[]): string[] {
  return getOrderedOnlinePlayerIdsView(playerIds, (playerId) => getOnlinePlayer(playerId)?.seatIndex ?? Number.MAX_SAFE_INTEGER);
}

function renderBoardState(): string {
  return renderBoardStateView({
    playState: state.playState,
    setupState: state.setupState,
    renderPlayBoard,
    renderCard,
    getDealerCandidates
  });
}

function renderOnlineBoardState(): string {
  return renderOnlineBoardStateView({
    syncedPlayState: state.online.syncedPlayState,
    syncedSetupState: state.online.syncedSetupState,
    connectedPlayerId: state.online.connectedPlayerId,
    dealerId: getOnlineDealerLabel(),
    getPlayerLabel: getOnlinePlayerLabel,
    getOrderedPlayerIds: getOrderedOnlinePlayerIds,
    getFloorAction: getOnlineFloorAction,
    renderActionHint: renderOnlineActionHint,
    renderVisibleCard,
    renderCard,
    renderOnlineFloorCard,
    renderOnlineHandCard
  });
}

function renderOnlineActionDock(): string {
  return renderOnlineActionDockView(getOnlineControlState());
}

function renderRoundHistoryList(limit = 5): string {
  const history = state.online.roundHistory.slice(0, limit);
  if (history.length === 0) {
    return `<p class="panel-copy">No completed rounds yet.</p>`;
  }

  return `
    <div class="admin-ledger-list">
      ${history.map((entry) => `
        <div class="admin-room-item">
          <div>
            <strong>${entry.status === "reset" ? "Reset Round" : "Scored Round"}</strong>
            <p class="panel-copy">${entry.summaryText}</p>
            <p class="panel-copy muted">${new Date(entry.completedAt).toLocaleString()} · next dealer ${entry.nextDealerId ?? "same"}</p>
          </div>
          <div>
            ${entry.players.length === 0 ? `<strong>-</strong>` : entry.players.map((player) => `<div class="panel-copy"><strong>${player.playerId}</strong> ${player.amountWon >= 0 ? "+" : ""}${player.amountWon.toLocaleString()} KRW</div>`).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDetailedScoreCard(
  playerLabel: string,
  player: RoundHistoryEntry["players"][number] | ReturnType<typeof scoreRound>["players"][number],
  capturedCards: readonly string[]
): string {
  return renderDetailedScoreCardView(playerLabel, player, capturedCards, {
    renderCapturedCardStack: (cards, extraClassName) => renderCapturedCardStackView(cards, renderCard, extraClassName),
    getPlayerLabel: getOnlinePlayerLabel
  });
}

function renderDetailedRoundHistoryList(limit = 5): string {
  return renderDetailedRoundHistoryListView(state.online.roundHistory, limit, {
    getPlayerLabel: getOnlinePlayerLabel,
    renderDetailedScoreCard
  });
}

function renderPlayBoard(playState: PlayState): string {
  return renderPlayBoardView({
    playState,
    roundHistoryHtml: renderDetailedRoundHistoryListView(state.online.roundHistory, 3, {
      getPlayerLabel: getOnlinePlayerLabel,
      renderCard
    }),
    getPlayerLabel: getOnlinePlayerLabel,
    getFloorAction,
    isInitialFloorTripleCapture,
    renderFloorCard,
    renderHandCard,
    renderCard,
    renderCapturedCardStack: (cards, extraClassName) =>
      renderCapturedCardStackView(cards, renderCard, extraClassName)
  });
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
  bindAppEvents({
    getState: () => state,
    setState: (nextState) => {
      state = nextState;
    },
    render,
    createAppState,
    authSessionRuntime,
    onlineClient,
    localRoundActions,
    getConnectedOnlineRoomPlayer,
    getDealerCandidates,
    getCandidatesFromState,
    randomBetween
  });
}

function updateOnlineField(field: "serverUrl" | "playerId" | "displayNameInput" | "roomIdInput", value: string): void {
  state = updateOnlineFieldValue(state, field, value);
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
  state = updateAuthFieldValue(state, field, value);
}

function maybeAutoReconnectOnlineServer(): void {
  if (!state.online.shouldReconnect) {
    return;
  }

  onlineClient.connectOnlineServer();
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
      onlineClient.connectOnlineServer();
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

function getDealerCandidates(): string[] {
  return getDealerCandidatesView(state.setupState);
}

function getCandidatesFromState(setupState: RoundSetupState): string[] {
  return getCandidatesFromStateView(setupState);
}

function getPhaseLabel(): string {
  return getPhaseLabelView(state.playState, state.dealtState, state.setupState);
}

function getPlayPhaseLabel(playState: PlayState): string {
  return getPlayPhaseLabelView(playState);
}

function getDealerLabel(): string {
  return getDealerLabelView(state.playState, state.dealtState, state.setupState);
}

function getOnlineDealerLabel(): string {
  return getOnlineDealerLabelView(state.online.syncedPlayState, state.online.syncedSetupState);
}

function getActiveCount(): number {
  return getActiveCountView(state.playState, state.dealtState, state.setupState, state.room.players.length);
}

function getOnlineActiveCount(): number {
  return getOnlineActiveCountView(
    state.online.syncedRoom,
    state.online.syncedSetupState,
    state.online.syncedPlayState
  );
}

function getCardImage(cardId: string): string {
  return `/cards/minhwatu/exported/${cardId}.png`;
}

function randomBetween(min: number, max: number): number {
  return randomBetweenView(min, max);
}

function getFloorAction(playState: PlayState): "discard-to-floor" | "" {
  return getFloorActionView(playState);
}

function getOnlineFloorAction(
  playState: PlayStateView,
  isCurrentOnlinePlayer: boolean
): "discard-to-floor" | "" {
  return getOnlineFloorActionView(playState, isCurrentOnlinePlayer);
}

function isInitialFloorTripleCapture(
  playState: Extract<PlayState, { phase: "awaiting_hand_choice" | "awaiting_draw_choice" }>,
  cardId: string
): boolean {
  return isInitialFloorTripleCaptureView(playState, cardId);
}

