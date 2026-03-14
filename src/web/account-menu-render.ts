import type { AdminOverview, AuthenticatedUserView, RoomView } from "../server/protocol.js";

interface RenderSpectateMenuPanelArgs {
  canWatch: boolean;
  currentRoomId: string | null;
  activeRooms: AdminOverview["activeRooms"];
  watchRoomIdInput: string;
}

interface RenderSettingsMenuPanelArgs {
  viewer: AuthenticatedUserView | null;
  adminOverview: AdminOverview | null;
  balanceLedger: AuthenticatedUserView["ledger"];
  shouldReconnect: boolean;
  serverUrl: string;
  displayNameInput: string;
  canUpdateDisplayName: boolean;
  adminBalanceUserId: string;
  adminBalanceAmount: string;
}

export function renderSpectateMenuPanelView(args: RenderSpectateMenuPanelArgs): string {
  const {
    canWatch,
    currentRoomId,
    activeRooms,
    watchRoomIdInput
  } = args;

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
          <p class="score-line"><strong>${currentRoomId ?? "no room"}</strong></p>
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
                  <input id="admin-watch-room-id" type="text" value="${watchRoomIdInput}" />
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
}

export function renderSettingsMenuPanelView(args: RenderSettingsMenuPanelArgs): string {
  const {
    viewer,
    adminOverview,
    balanceLedger,
    shouldReconnect,
    serverUrl,
    displayNameInput,
    canUpdateDisplayName,
    adminBalanceUserId,
    adminBalanceAmount
  } = args;
  const users = adminOverview?.users ?? [];
  const activeRooms = adminOverview?.activeRooms ?? [];
  const auditLog = adminOverview?.auditLog ?? [];

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
          <p class="score-line"><strong>${shouldReconnect ? "enabled" : "disabled"}</strong></p>
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
            <input id="settings-server-url" type="text" value="${serverUrl}" />
          </label>
          <div class="button-row compact-button-row">
            <button id="settings-reconnect-server" class="secondary-button">Reconnect</button>
          </div>
        </article>
        <article class="score-card admin-panel-card">
          <h4>Public Profile</h4>
          <label class="field compact">
            <span>Public Name</span>
            <input id="settings-display-name" type="text" value="${displayNameInput}" />
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
                    <input id="admin-balance-user-id" type="text" value="${adminBalanceUserId}" />
                  </label>
                  <label class="field compact">
                    <span>Amount</span>
                    <input id="admin-balance-amount" type="number" value="${adminBalanceAmount}" />
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
}
