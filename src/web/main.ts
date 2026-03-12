import "../web/styles.css";
import type {
  ClientMessage,
  PlayStateView,
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

interface OnlineLobbyState {
  serverUrl: string;
  playerId: string;
  displayNameInput: string;
  roomIdInput: string;
  shouldReconnect: boolean;
  connectionStatus: OnlineConnectionStatus;
  connectedPlayerId: string | null;
  syncedRoom: RoomState | null;
  syncedSetupState: RoundSetupStateView | null;
  syncedPlayState: PlayStateView | null;
  syncedActionLog: string[];
  serverCapabilities: ServerCapabilities | null;
  protocolVersion: number | null;
  socket: WebSocket | null;
  error: string | null;
}

interface AppState {
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

const CARD_SCORES: CardScore[] = [0, 5, 10, 20];
const ONLINE_SESSION_STORAGE_KEY = "minhwatu.online-session.v1";
const ONLINE_RECONNECT_DELAY_MS = 1_500;
const appRoot = document.querySelector<HTMLDivElement>("#app");
let pendingOnlineReconnectTimer: number | null = null;

if (appRoot === null) {
  throw new Error("App root element was not found.");
}

let state = createInitialState(7);
render();
maybeAutoReconnectOnlineServer();

function createInitialState(playerCount: number): AppState {
  let room = createRoom(`room-${playerCount}`);

  for (let index = 1; index <= playerCount; index += 1) {
    room = joinRoom(room, `p${index}`);
  }

  return {
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
    serverCapabilities: null,
    protocolVersion: null,
    socket: null,
    error: null
  };
}

function getDefaultServerUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const hostname = window.location.hostname === "" ? "localhost" : window.location.hostname;
  return `${protocol}://${hostname}:8080`;
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

      <main class="workspace ${hasActiveOnlineRoom() ? "workspace-live" : "workspace-home"}">
        <section class="workspace-main">
          ${renderMainColumn()}
        </section>
        ${
          hasActiveOnlineRoom()
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

function renderMainColumn(): string {
  if (!hasActiveOnlineRoom()) {
    return renderHomeMenu();
  }

  return renderActiveRoomWorkspace();
}

function renderActiveRoomWorkspace(): string {
  return `
    <section class="live-workspace">
      <div class="live-command-column">
        ${renderOnlineLobby()}
      </div>
      <div class="live-table-column">
        ${renderTable()}
      </div>
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
  return `
    <section class="home-mode-stack">
      ${renderOnlineLobby()}
    </section>
  `;
}

function renderSpectateMenuPanel(): string {
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
        <p class="panel-copy">${state.online.connectedPlayerId === null ? "서버 연결 전입니다." : `${state.online.connectedPlayerId} 로 연결되었습니다.`}</p>
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
  const isConnected = state.online.connectionStatus === "connected";
  const isConnecting = state.online.connectionStatus === "connecting";
  const syncedSetupState = state.online.syncedSetupState;
  const syncedPlayState = state.online.syncedPlayState;
  const connectedPlayer = getConnectedOnlineRoomPlayer();
  const isHost = connectedPlayer !== null && state.online.syncedRoom?.hostPlayerId === connectedPlayer.playerId;
  const supportsReadyToggle = onlineServerSupportsReadyToggle();
  const supportsDisplayName = onlineServerSupportsDisplayName();
  const supportsHostTransfer = onlineServerSupportsHostTransfer();
  const supportsKickPlayer = onlineServerSupportsKickPlayer();
  const hasActiveSyncedRound = syncedSetupState !== null || syncedPlayState !== null;
  const canToggleReady =
    isConnected &&
    supportsReadyToggle &&
    connectedPlayer !== null &&
    syncedSetupState === null &&
    syncedPlayState === null;
  const canUpdateDisplayName = isConnected && connectedPlayer !== null && supportsDisplayName;
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
  const canAutoResolveDealer = syncedSetupState?.phase === "selecting_initial_dealer";
  const canDeclareGiveUp =
    syncedSetupState?.phase === "waiting_for_giveups" &&
    syncedSetupState.currentPlayerId === state.online.connectedPlayerId;
  const canDealCards = syncedSetupState?.phase === "ready_to_play";
  const canFlipDrawCard =
    syncedPlayState?.phase === "awaiting_draw_flip" &&
    syncedPlayState.currentPlayerId === state.online.connectedPlayerId;
  const canPrepareNextRound = syncedPlayState?.phase === "completed";
  const canChangeRooms = isConnected && !hasActiveSyncedRound;
  const canLeaveRoom = state.online.syncedRoom !== null && !hasActiveSyncedRound;

  return `
    <section class="panel command-panel workspace-primary-panel">
      <div class="section-kicker">
        <span class="eyebrow">Command Deck</span>
        <h2>Online Command</h2>
      </div>
      <p class="panel-copy">Status: <strong>${state.online.connectionStatus}</strong>${state.online.connectedPlayerId === null ? "" : ` as ${state.online.connectedPlayerId}`}</p>
      ${
        state.online.error === null
          ? ""
          : `<p class="panel-copy"><strong>Server error:</strong> ${state.online.error}</p>`
      }
      ${
        isConnected && (!supportsReadyToggle || !supportsDisplayName || !supportsHostTransfer || !supportsKickPlayer)
          ? `<p class="panel-copy"><strong>Compatibility:</strong> The running server is outdated. Restart \`npm run server\` to use ready, display-name, host-transfer, and kick actions.</p>`
          : ""
      }
      <div class="menu-stack">
        <details class="menu-panel" open>
          <summary>
            <div>
              <strong>Connection</strong>
              <p class="panel-copy">Server and player identity.</p>
            </div>
          </summary>
          <div class="menu-panel-body">
            <label class="field">
              <span>Server URL</span>
              <input id="online-server-url" type="text" value="${state.online.serverUrl}" />
            </label>
            <label class="field">
              <span>Player ID</span>
              <input id="online-player-id" type="text" value="${state.online.playerId}" />
            </label>
            <label class="field">
              <span>Display Name</span>
              <input id="online-display-name" type="text" value="${state.online.displayNameInput}" />
            </label>
            <div class="button-row compact-button-row">
              <button id="online-connect" class="primary-button" ${isConnected || isConnecting ? "disabled" : ""}>Connect</button>
              <button id="online-disconnect" class="secondary-button" ${isConnected ? "" : "disabled"}>Disconnect</button>
              <button id="online-set-display-name" class="secondary-button" ${canUpdateDisplayName ? "" : "disabled"}>Set Name</button>
            </div>
          </div>
        </details>
        <details class="menu-panel" open>
          <summary>
            <div>
              <strong>Room</strong>
              <p class="panel-copy">Join, create, refresh, and ready.</p>
            </div>
          </summary>
          <div class="menu-panel-body">
            <label class="field">
              <span>Room ID</span>
              <input id="online-room-id" type="text" value="${state.online.roomIdInput}" />
            </label>
            <div class="button-row compact-button-row">
              <button id="online-create-room" class="primary-button" ${canChangeRooms ? "" : "disabled"}>Create</button>
              <button id="online-join-room" class="secondary-button" ${canChangeRooms ? "" : "disabled"}>Join</button>
              <button id="online-leave-room" class="secondary-button" ${canLeaveRoom ? "" : "disabled"}>Leave</button>
              <button id="online-refresh-room" class="secondary-button" ${state.online.syncedRoom === null ? "disabled" : ""}>Refresh</button>
            </div>
            <div class="button-row compact-button-row">
              <button id="online-toggle-ready" class="secondary-button" ${canToggleReady ? "" : "disabled"}>
                ${connectedPlayer?.isReady ? "Set Not Ready" : "Set Ready"}
              </button>
            </div>
          </div>
        </details>
        <details class="menu-panel" open>
          <summary>
            <div>
              <strong>Match</strong>
              <p class="panel-copy">Setup and active round controls.</p>
            </div>
          </summary>
          <div class="menu-panel-body">
            <div class="button-row compact-button-row">
              <button id="online-start-round-setup" class="primary-button" ${canStartRoundSetup ? "" : "disabled"}>Start Setup</button>
              <button id="online-auto-resolve-dealer" class="secondary-button" ${canAutoResolveDealer ? "" : "disabled"}>Auto Resolve Dealer</button>
            </div>
            <div class="button-row compact-button-row">
              <button id="online-play-decision" class="secondary-button" ${canDeclareGiveUp ? "" : "disabled"}>Play</button>
              <button id="online-giveup-decision" class="secondary-button" ${canDeclareGiveUp ? "" : "disabled"}>Give Up</button>
            </div>
            <div class="button-row compact-button-row">
              <button id="online-deal-cards" class="primary-button" ${canDealCards ? "" : "disabled"}>Deal Cards</button>
              <button id="online-flip-draw-card" class="secondary-button" ${canFlipDrawCard ? "" : "disabled"}>Flip Draw Card</button>
              <button id="online-prepare-next-round" class="secondary-button" ${canPrepareNextRound ? "" : "disabled"}>Prepare Next Round</button>
            </div>
          </div>
        </details>
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
  return hasActiveOnlineRoom() ? "Online Multiplayer" : "Online-First Workspace";
}

function getHeroTitle(): string {
  return hasActiveOnlineRoom() ? "Minhwatu Online Table" : "Minhwatu Control Room";
}

function getHeroLede(): string {
  if (hasActiveOnlineRoom()) {
    const room = state.online.syncedRoom;
    return `Server-authoritative room ${room?.roomId ?? ""} is active. The synchronized board is primary and the command deck now sits in the center flow for faster match control.`;
  }

  return "Connect players into a synchronized room first. The command deck and online board now share the center flow so room entry and match start feel like one path.";
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
  return hasActiveOnlineRoom() ? "Room" : "Players";
}

function getSecondaryStatValue(): string {
  if (hasActiveOnlineRoom()) {
    return state.online.syncedRoom?.roomId ?? "offline";
  }

  return `${state.playerCount}`;
}

function getConnectedOnlineRoomPlayer(): RoomState["players"][number] | null {
  const connectedPlayerId = state.online.connectedPlayerId;
  const room = state.online.syncedRoom;
  if (connectedPlayerId === null || room === null) {
    return null;
  }

  return room.players.find((player) => player.playerId === connectedPlayerId) ?? null;
}

function getOnlinePlayer(playerId: string): RoomState["players"][number] | null {
  const room = state.online.syncedRoom;
  if (room === null) {
    return null;
  }

  return room.players.find((player) => player.playerId === playerId) ?? null;
}

function getOnlinePlayerLabel(playerId: string): string {
  const player = getOnlinePlayer(playerId);
  if (player === null) {
    return playerId;
  }

  return player.displayName === player.playerId ? player.playerId : `${player.displayName} (${player.playerId})`;
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
  const supportsHostTransfer = onlineServerSupportsHostTransfer();
  const supportsKickPlayer = onlineServerSupportsKickPlayer();
  const canManageRoster = state.online.connectionStatus === "connected" && isHost && (supportsHostTransfer || supportsKickPlayer);

  if (room === null) {
    return "";
  }

  return `
    <section class="panel workspace-secondary-panel room-meta-panel">
      <div class="section-kicker">
        <span class="eyebrow">Room Rail</span>
        <h2>Roster</h2>
      </div>
      <div class="roster-grid">
        ${sortPlayersBySeat(room.players).map((player) => `
          <article class="hand-panel roster-card">
            <h4>${player.displayName}</h4>
            <p class="panel-copy">${player.playerId}</p>
            <p class="panel-copy">Seat ${player.seatIndex} · ${player.role}</p>
            <p class="panel-copy">${
              player.playerId === room.hostPlayerId ? "Host" : "Guest"
            } · ${player.isReady ? "Ready" : "Not Ready"} · ${player.isConnected ? "Connected" : "Disconnected"}</p>
            ${
              canManageRoster && player.playerId !== connectedPlayer?.playerId
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
  const onlineFloorAction = getOnlineFloorAction(playState, isCurrentOnlinePlayer);
  const onlineDrawPileAction =
    isCurrentOnlinePlayer && playState.phase === "awaiting_draw_flip" ? "flip-draw-pile" : "";
  const scoring =
    playState.phase === "completed"
      ? scoreRound(playState.capturedByPlayer, playState.activePlayerIds)
      : null;

  return `
    <div class="zone">
      <div class="zone-header">
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
      <div class="deal-layout table-stage-grid">
        <section class="zone stage-floor-zone ${onlineFloorAction === "" ? "" : "clickable-zone"}" ${onlineFloorAction === "" ? "" : `data-online-action="${onlineFloorAction}"`}>
          <div class="zone-header">
            <h3>Floor</h3>
            <span>${playState.floorCards.length} cards</span>
          </div>
          <div class="card-row">
            ${playState.floorCards.map((cardId) => renderOnlineFloorCard(playState, cardId, isCurrentOnlinePlayer)).join("")}
          </div>
        </section>
        <section class="zone stage-pile-zone ${onlineDrawPileAction === "" ? "" : "clickable-zone"}" ${onlineDrawPileAction === "" ? "" : `data-online-action="${onlineDrawPileAction}"`}>
          <div class="zone-header">
            <h3>Draw Pile</h3>
            <span>${playState.drawPileCards.length} remain</span>
          </div>
          <div class="pile-stack">
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
              ? `<div class="card-row small">${playState.drawPileCards.map(renderVisibleCard).join("")}</div>`
              : ""
          }
        </section>
        <section class="zone stage-hands-zone">
          <div class="zone-header">
            <h3>Hands</h3>
            <span>${playState.turnOrder.map((playerId) => getOnlinePlayerLabel(playerId)).join(" -> ")}</span>
          </div>
          <div class="hands-grid">
            ${playState.activePlayerIds.map((playerId) => `
              <article class="hand-panel ${playState.phase !== "completed" && playerId === playState.currentPlayerId ? "active-turn" : ""}">
                <h4>${getOnlinePlayerLabel(playerId)}</h4>
                <div class="card-row small">
                  ${(playState.hands[playerId] ?? []).map((cardId) =>
                    renderOnlineHandCard(playState, playerId, cardId, isCurrentOnlinePlayer)
                  ).join("")}
                </div>
              </article>
            `).join("")}
          </div>
        </section>
        <section class="zone stage-captured-zone">
          <div class="zone-header">
            <h3>Captured</h3>
            <span>${playState.lastTurn === null ? "No turns yet" : `Last: ${getOnlinePlayerLabel(playState.lastTurn.playerId)}`}</span>
          </div>
          <div class="hands-grid">
            ${playState.activePlayerIds.map((playerId) => `
              <article class="hand-panel">
                <h4>${getOnlinePlayerLabel(playerId)}</h4>
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
                  <h3>Synced Result</h3>
                  <span>${scoring.status === "reset" ? "Reset" : "Scored"}</span>
                </div>
                ${
                  scoring.status === "reset"
                    ? `<p class="panel-copy">Three or more players completed Yak. The synchronized round resets with no settlement.</p>`
                    : `<div class="score-grid">
                      ${scoring.players.map((player) => `
                          <article class="score-card">
                            <h4>${getOnlinePlayerLabel(player.playerId)}</h4>
                            <p class="score-line">Final: <strong>${player.finalScore}</strong></p>
                            <p class="score-line">Money: <strong>${player.amountWon.toLocaleString()} KRW</strong></p>
                            <p class="score-line muted">Yak: ${player.yakMonths.length === 0 ? "none" : player.yakMonths.join(", ")}</p>
                          </article>
                        `).join("")}
                      </div>`
                }
              </section>
            `
        }
      </div>
    </div>
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
        <div class="chips">
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
          <p class="panel-copy">Center bottom: live table and turn flow.</p>
          <p class="panel-copy">Right rail: roster and room status.</p>
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
          <p class="panel-copy">Server-authoritative room ${room.roomId}. The command deck and table now stay together in the center flow, while roster details remain on the right.</p>
        </div>
        <div class="chips">
          <span class="chip">Dealer: ${getOnlinePlayerLabel(getOnlineDealerLabel())}</span>
          <span class="chip">Active: ${getOnlineActiveCount()}</span>
          <span class="chip">Viewer: ${state.online.connectedPlayerId === null ? "guest" : getOnlinePlayerLabel(state.online.connectedPlayerId)}</span>
        </div>
      </div>
      <div class="table-orbit">
        <section class="seat-ribbon">
          <div class="seat-grid">
            ${sortPlayersBySeat(room.players).map((player) => renderOnlineSeat(player.playerId, player.seatIndex, player.role)).join("")}
          </div>
        </section>
        <section class="table-surface">
          <section class="zone table-status-strip">
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
          </section>
          ${renderOnlineBoardState()}
        </section>
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

function renderOnlineSeat(playerId: string, seatIndex: number, role: string): string {
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

  document.querySelector<HTMLInputElement>("#online-server-url")?.addEventListener("change", (event) => {
    updateOnlineField("serverUrl", (event.currentTarget as HTMLInputElement).value);
  });

  document.querySelector<HTMLInputElement>("#online-player-id")?.addEventListener("change", (event) => {
    updateOnlineField("playerId", (event.currentTarget as HTMLInputElement).value);
  });

  document.querySelector<HTMLInputElement>("#online-display-name")?.addEventListener("change", (event) => {
    updateOnlineField("displayNameInput", (event.currentTarget as HTMLInputElement).value);
  });

  document.querySelector<HTMLInputElement>("#online-room-id")?.addEventListener("change", (event) => {
    updateOnlineField("roomIdInput", (event.currentTarget as HTMLInputElement).value);
  });

  document.querySelector<HTMLButtonElement>("#online-connect")?.addEventListener("click", () => {
    connectOnlineServer();
  });

  document.querySelector<HTMLButtonElement>("#online-disconnect")?.addEventListener("click", () => {
    disconnectOnlineServer("Disconnected from multiplayer server.");
  });

  document.querySelector<HTMLButtonElement>("#online-create-room")?.addEventListener("click", () => {
    sendOnlineRoomAction("create_room");
  });

  document.querySelector<HTMLButtonElement>("#online-join-room")?.addEventListener("click", () => {
    sendOnlineRoomAction("join_room");
  });

  document.querySelector<HTMLButtonElement>("#online-leave-room")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "leave_room" });
  });

  document.querySelector<HTMLButtonElement>("#online-refresh-room")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "request_room_snapshot" });
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

  document.querySelector<HTMLButtonElement>("#online-set-display-name")?.addEventListener("click", () => {
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

  document.querySelector<HTMLButtonElement>("#online-start-round-setup")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "start_round_setup" });
  });

  document.querySelector<HTMLButtonElement>("#online-auto-resolve-dealer")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "auto_resolve_dealer" });
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

  document.querySelector<HTMLButtonElement>("#online-deal-cards")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "deal_cards" });
  });

  document.querySelector<HTMLButtonElement>("#online-prepare-next-round")?.addEventListener("click", () => {
    sendOnlineMessage({ type: "prepare_next_round" });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-online-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const cardId = button.dataset.onlineCardId;
      if (cardId === undefined) {
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
        sendOnlineMessage({
          type: "resolve_hand_choice",
          floorCardId
        });
        return;
      }

      if (playState.phase === "awaiting_draw_choice") {
        sendOnlineMessage({
          type: "resolve_draw_choice",
          floorCardId
        });
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
      playerId: state.online.playerId
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

  switch (message.type) {
    case "connected":
      state = {
        ...state,
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
      break;
    case "room_snapshot":
      const connectedPlayer =
        message.room.players.find((player) => player.playerId === state.online.connectedPlayerId) ?? null;
      state = {
        ...state,
        online: {
          ...state.online,
          syncedRoom: message.room,
          syncedSetupState: message.setupState,
          syncedPlayState: message.playState,
          syncedActionLog: message.actionLog,
          displayNameInput: connectedPlayer?.displayName ?? state.online.displayNameInput,
          roomIdInput: message.room.roomId,
          error: null
        }
      };
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
          error: null
        },
        log: [`Left room ${message.roomId ?? "(none)"}.`, ...state.log].slice(0, 10)
      };
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
      sendOnlineMessage({
        type: "resolve_hand_choice",
        floorCardId: null
      });
      return;
    }

    if (playState?.phase === "awaiting_draw_choice") {
      sendOnlineMessage({
        type: "resolve_draw_choice",
        floorCardId: null
      });
      return;
    }
  }

  const onlineDrawPileTrigger = target.closest<HTMLElement>("#online-flip-draw-card, [data-online-action='flip-draw-pile']");
  if (onlineDrawPileTrigger !== null) {
    const playState = state.online.syncedPlayState;
    if (playState?.phase === "awaiting_draw_flip") {
      sendOnlineMessage({ type: "flip_draw_card" });
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
