interface RenderActiveRoomWorkspaceArgs {
  titleOwner: string;
  roomId: string | null;
  playerCount: number;
  phaseLabel: string;
  isFocusedPlay: boolean;
  tableHtml: string;
  onlineLobbyHtml: string;
  roomMetaHtml: string;
}

export function renderMainColumnView(hasActiveOnlineRoom: boolean, homeMenuHtml: string, activeRoomWorkspaceHtml: string): string {
  if (!hasActiveOnlineRoom) {
    return homeMenuHtml;
  }

  return activeRoomWorkspaceHtml;
}

export function renderActiveRoomWorkspaceView(args: RenderActiveRoomWorkspaceArgs): string {
  return `
    <section class="room-studio ${args.isFocusedPlay ? "room-studio-focus" : ""}">
      ${args.isFocusedPlay ? "" : `
      <aside class="room-player-column">
        ${args.roomMetaHtml}
      </aside>
      `}
      <section class="room-main-column">
        <section class="panel room-console-shell">
          <div class="room-console-header">
            <div>
              <span class="eyebrow">Private Room</span>
              <h2>${args.titleOwner}'s Room</h2>
              <p class="panel-copy">Authoritative multiplayer room ${args.roomId ?? "idle"} with synchronized setup and live turn control.</p>
            </div>
            <div class="chips board-header-chips">
              <span class="chip">Players ${args.playerCount}</span>
              <span class="chip">Phase ${args.phaseLabel}</span>
            </div>
          </div>
          <div class="room-console-body ${args.isFocusedPlay ? "room-console-body-focus" : ""}">
            <div class="live-table-column">
              ${args.tableHtml}
            </div>
            ${args.isFocusedPlay ? "" : `
            <aside class="live-command-column">
              ${args.onlineLobbyHtml}
            </aside>
            `}
          </div>
        </section>
      </section>
    </section>
  `;
}

export function renderRightRailView(roomMetaHtml: string): string {
  return roomMetaHtml;
}
