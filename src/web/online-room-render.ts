import type { AuthenticatedUserView, PublicRoomSummary, RoomView } from "../server/protocol.js";
import type { OnlineControlState } from "./online-control.js";

interface OnlineLobbyRenderArgs {
  controls: OnlineControlState;
  authUser: AuthenticatedUserView | null;
  connectionStatus: string;
  roomLabel: string;
  roomIdInput: string;
  availableRooms: PublicRoomSummary[];
  seatedCount: number;
  syncedRoom: RoomView | null;
  phaseLabel: string;
  onlineError: string | null;
}

interface OnlineRoomMetaRenderArgs {
  room: RoomView;
  connectedPlayer: RoomView["players"][number] | null;
  canManageRoster: boolean;
  supportsHostTransfer: boolean;
  supportsKickPlayer: boolean;
  sortedPlayers: readonly RoomView["players"][number][];
  getPlayerLabel: (playerId: string | null) => string;
}

export function renderOnlineLobby(args: OnlineLobbyRenderArgs): string {
  const {
    controls,
    authUser,
    connectionStatus,
    roomLabel,
    roomIdInput,
    availableRooms,
    seatedCount,
    syncedRoom,
    phaseLabel,
    onlineError
  } = args;
  const {
    isConnected,
    syncedSetupState,
    syncedPlayState,
    connectedPlayer,
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
    canChangeRooms,
    canLeaveRoom,
    canAddTestBot,
    viewerMode,
    showRoomExitActions
  } = controls;
  const isAdmin = authUser?.role === "admin";

  return `
    <section class="panel command-panel workspace-primary-panel">
      <div class="section-kicker">
        <span class="eyebrow">Command Deck</span>
        <h2>Room Control</h2>
      </div>
      ${
        onlineError === null
          ? ""
          : `<div class="command-alert command-alert-error"><strong>Server error</strong><span>${onlineError}</span></div>`
      }
      ${
        isConnected && (!supportsReadyToggle || !supportsDisplayName || !supportsHostTransfer || !supportsKickPlayer || !supportsBots)
          ? `<div class="command-alert command-alert-warning"><strong>Compatibility</strong><span>The running server is outdated. Restart \`npm run server\` to use ready, display-name, host-transfer, kick, and bot actions.</span></div>`
          : ""
      }
      <article class="command-stage-card command-room-entry-card">
        <span class="mini-label">Room Entry</span>
        <h3>${roomLabel}</h3>
        <p class="panel-copy">Server: <strong>${connectionStatus}</strong> · signed-in players connect automatically.</p>
        <p class="panel-copy">${
          syncedRoom === null
            ? "Enter a room name, then create it or join an idle room."
            : hasActiveSyncedRound
              ? `Live phase: ${phaseLabel}. Room entry is locked until the round returns to idle.`
              : "The room is idle. You can create, join, ready up, or add a bot from here."
        }</p>
        <label class="field">
          <span>Room ID</span>
          <input id="online-room-id" type="text" value="${roomIdInput}" />
        </label>
        <div class="button-row compact-button-row command-room-buttons">
          <button id="online-create-room" class="primary-button" ${canChangeRooms ? "" : "disabled"}>Create Room</button>
          <button id="online-join-room" class="secondary-button" ${canChangeRooms ? "" : "disabled"}>Join Room</button>
          ${canToggleReady ? `<button id="online-toggle-ready" class="secondary-button">${connectedPlayer?.isReady ? "Set Not Ready" : "Set Ready"}</button>` : ""}
          ${canAddTestBot ? `<button id="online-add-test-bot" class="secondary-button">Add Test Bot</button>` : ""}
          ${showRoomExitActions ? `<button id="online-leave-room" class="secondary-button" ${canLeaveRoom ? "" : "disabled"}>Leave</button>` : ""}
        </div>
        <p class="panel-copy">Viewer mode: <strong>${viewerMode}</strong>${syncedRoom === null ? "" : ` · ${seatedCount} seated`}</p>
        ${
          disconnectedPlayers.length === 0
            ? ""
            : `<p class="panel-copy">Offline: <strong>${disconnectedPlayers.join(", ")}</strong></p>`
        }
        ${
          notReadyPlayers.length === 0 || hasActiveSyncedRound
            ? ""
            : `<p class="panel-copy">Not ready: <strong>${notReadyPlayers.join(", ")}</strong></p>`
        }
        ${
          !canStartByRoster && syncedRoom !== null && !hasActiveSyncedRound
            ? `<p class="panel-copy">Start is locked until 5-7 players are seated and everyone is both connected and ready.</p>`
            : ""
        }
      </article>
      <article class="command-stage-card command-room-entry-card">
        <div class="zone-header">
          <h3>Public Rooms</h3>
          <button id="online-refresh-room-list" class="secondary-button">Refresh</button>
        </div>
        ${
          availableRooms.length === 0
            ? `<p class="panel-copy">No public rooms are visible right now.</p>`
            : `
              <div class="admin-room-list">
                ${availableRooms.map((room) => `
                  <div class="admin-room-item">
                    <div>
                      <strong>${room.roomId}</strong>
                      <p class="panel-copy">${room.hostName ?? "no host"} · ${room.playerCount} players · ${room.inProgress ? "in progress" : "idle"}</p>
                      <p class="panel-copy muted">${room.connectedCount} connected · ${room.readyCount} ready</p>
                    </div>
                    <div class="button-row compact-button-row">
                      <button class="secondary-button online-quick-join-room" data-room-id="${room.roomId}" ${isConnected && !room.inProgress ? "" : "disabled"}>Join</button>
                      ${
                        isAdmin
                          ? `<button class="secondary-button admin-start-room-button" data-room-id="${room.roomId}" ${isConnected && !room.inProgress ? "" : "disabled"}>Start</button>
                             <button class="secondary-button admin-delete-room-button" data-room-id="${room.roomId}" ${isConnected ? "" : "disabled"}>Delete</button>`
                          : ""
                      }
                    </div>
                  </div>
                `).join("")}
              </div>
            `
        }
      </article>
    </section>
  `;
}

export function renderOnlineRoomMetaPanel(args: OnlineRoomMetaRenderArgs): string {
  const {
    room,
    connectedPlayer,
    canManageRoster,
    supportsHostTransfer,
    supportsKickPlayer,
    sortedPlayers,
    getPlayerLabel
  } = args;

  return `
    <section class="panel workspace-secondary-panel room-meta-panel">
      <div class="section-kicker">
        <span class="eyebrow">Room Rail</span>
        <h2>Players (${room.players.length})</h2>
      </div>
      <div class="room-rail-summary">
        <article class="score-card room-rail-card">
          <h4>Host</h4>
          <p class="score-line"><strong>${getPlayerLabel(room.hostPlayerId)}</strong></p>
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
      <div class="roster-grid">
        ${sortedPlayers.map((player) => `
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
