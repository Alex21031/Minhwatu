import type { PlayState } from "../index.js";
import { determineNextDealer, scoreRound } from "../index.js";
import type { PlayStateView, RoundSetupStateView, VisibleCard } from "../server/protocol.js";
import type { OnlineControlState } from "./online-control.js";
import {
  renderDetailedRoundHistoryList as renderDetailedRoundHistoryListView,
  renderDetailedScoreCard as renderDetailedScoreCardView,
  renderOnlinePlaySummary as renderOnlinePlaySummaryView
} from "./online-render.js";

interface OnlineSetupSummaryContext {
  getPlayerLabel: (playerId: string | null) => string;
  renderVisibleCard: (cardId: VisibleCard) => string;
}

interface OnlineIdleTableArgs {
  connectionStatus: string;
  playerId: string;
  connectedPlayerId: string | null;
}

interface OnlineBoardStateArgs {
  syncedPlayState: PlayStateView | null;
  syncedSetupState: RoundSetupStateView | null;
  roundHistoryHtml: string;
  connectedPlayerId: string | null;
  dealerId: string;
  getPlayerLabel: (playerId: string | null) => string;
  getSeatIndex: (playerId: string) => number | null;
  getOrderedPlayerIds: (playerIds: string[]) => string[];
  getFloorAction: (playState: PlayStateView, isCurrentOnlinePlayer: boolean) => string;
  renderActionHint: (playState: PlayStateView, isCurrentOnlinePlayer: boolean) => string;
  renderVisibleCard: (cardId: VisibleCard) => string;
  renderCard: (cardId: string) => string;
  renderOnlineFloorCard: (playState: PlayStateView, cardId: string, isCurrentOnlinePlayer: boolean) => string;
  renderOnlineHandCard: (
    playState: PlayStateView,
    playerId: string,
    cardId: VisibleCard,
    isCurrentOnlinePlayer: boolean
  ) => string;
}

interface OnlineTableArgs {
  roomId: string;
  dealerLabel: string;
  activeCount: number;
  viewerLabel: string;
  balanceLabel: string;
  phaseLabel: string;
  currentLabel: string;
  connectedCount: number;
  readyCount: number;
  totalPlayers: number;
  boardHtml: string;
  actionDockHtml: string;
}

interface LocalPlayBoardArgs {
  playState: PlayState;
  roundHistoryHtml: string;
  getPlayerLabel: (playerId: string | null) => string;
  getFloorAction: (playState: PlayState) => string;
  isInitialFloorTripleCapture: (playState: PlayState, cardId: string) => boolean;
  renderFloorCard: (playState: PlayState, cardId: string) => string;
  renderHandCard: (playState: PlayState, playerId: string, cardId: string) => string;
  renderCard: (cardId: string) => string;
  renderCapturedCardStack: (cards: readonly string[], extraClassName?: string) => string;
}

export function renderOnlineSetupSummaryView(
  setupState: RoundSetupStateView | null,
  context: OnlineSetupSummaryContext
): string {
  if (setupState === null) {
    return `<p class="panel-copy">No synchronized round setup is active for this room.</p>`;
  }

  if (setupState.phase === "selecting_initial_dealer") {
    return `<p class="panel-copy">Dealer draw rounds played: ${setupState.dealerDrawRounds.length}</p>`;
  }

  if (setupState.phase === "waiting_for_giveups") {
    return `
      <p class="panel-copy">Current chooser: <strong>${context.getPlayerLabel(setupState.currentPlayerId)}</strong></p>
      <p class="panel-copy">Give-ups needed: <strong>${setupState.giveUpsNeeded}</strong></p>
      ${
        setupState.pendingDeal === null
          ? ""
          : `
            <div class="hands-grid">
              ${setupState.turnOrder.map((playerId) => `
                <article class="hand-panel ${playerId === setupState.currentPlayerId ? "active-turn" : ""}">
                  <h4>${context.getPlayerLabel(playerId)}</h4>
                  <div class="card-row small">
                    ${(setupState.pendingDeal?.hands[playerId] ?? []).map(context.renderVisibleCard).join("")}
                  </div>
                </article>
              `).join("")}
            </div>
            <p class="panel-copy">Hidden floor: <strong>${setupState.pendingDeal.hiddenFloorCards.length}</strong> cards</p>
            ${
              setupState.viewerMode === "spectator"
                ? `
                  <div class="card-row small">${setupState.pendingDeal.hiddenFloorCards.map(context.renderVisibleCard).join("")}</div>
                  <p class="panel-copy">Draw pile preview:</p>
                  <div class="card-row small">${setupState.pendingDeal.drawPileCards.map(context.renderVisibleCard).join("")}</div>
                `
                : ""
            }
          `
      }
    `;
  }

  return `
    <p class="panel-copy">Dealer: <strong>${context.getPlayerLabel(setupState.dealerId)}</strong></p>
    <p class="panel-copy">Active players: <strong>${setupState.activePlayerIds.map((playerId) => context.getPlayerLabel(playerId)).join(", ")}</strong></p>
    ${
      setupState.predealtHand === null
        ? ""
        : `
          <p class="panel-copy">Your locked hand for the next round:</p>
          <div class="card-row small">${setupState.predealtHand.map(context.renderVisibleCard).join("")}</div>
        `
    }
  `;
}

export function renderOnlineIdleTableView(args: OnlineIdleTableArgs): string {
  return `
    <section class="panel board">
      <div class="board-header board-intro-header">
        <div>
          <h2>Online Workspace</h2>
          <p class="panel-copy">Connect to the multiplayer server, enter or create a room, and move the synchronized table into this workspace.</p>
        </div>
        <div class="chips board-header-chips">
          <span class="chip">Status: ${args.connectionStatus}</span>
          <span class="chip">Player: ${args.playerId}</span>
        </div>
      </div>
      <div class="idle-board-shell">
        <section class="zone online-stage-zone idle-stage-zone">
          <div class="zone-header">
            <h3>Start Online Play</h3>
            <span>${args.connectedPlayerId ?? "offline"}</span>
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

export function renderOnlineBoardStateView(args: OnlineBoardStateArgs): string {
  if (args.syncedPlayState !== null) {
    return renderOnlinePlaySummaryView(args.syncedPlayState, {
      roundHistoryHtml: args.roundHistoryHtml,
      connectedPlayerId: args.connectedPlayerId,
      dealerId: args.dealerId,
      getPlayerLabel: (playerId) => args.getPlayerLabel(playerId),
      getSeatIndex: args.getSeatIndex,
      getOrderedPlayerIds: args.getOrderedPlayerIds,
      getFloorAction: args.getFloorAction,
      renderActionHint: args.renderActionHint,
      renderVisibleCard: args.renderVisibleCard,
      renderCard: args.renderCard,
      renderOnlineFloorCard: args.renderOnlineFloorCard,
      renderOnlineHandCard: args.renderOnlineHandCard
    });
  }

  if (args.syncedSetupState !== null) {
    return `
      <div class="online-board-stack">
        <section class="zone online-stage-zone">
          <div class="zone-header">
            <h3>Online Stage</h3>
            <span>${args.syncedSetupState.phase}</span>
          </div>
          ${renderOnlineSetupSummaryView(args.syncedSetupState, {
            getPlayerLabel: args.getPlayerLabel,
            renderVisibleCard: args.renderVisibleCard
          })}
        </section>
        ${renderRecentRoundsSection(args.roundHistoryHtml)}
      </div>
    `;
  }

  return `
    <div class="online-board-stack">
      <section class="zone online-stage-zone">
        <div class="zone-header">
          <h3>Online Stage</h3>
          <span>idle</span>
        </div>
        <p class="panel-copy">Create or join a room, then start synchronized setup from the lobby controls.</p>
      </section>
      ${renderRecentRoundsSection(args.roundHistoryHtml)}
    </div>
  `;
}

function renderRecentRoundsSection(roundHistoryHtml: string): string {
  if (roundHistoryHtml === "") {
    return "";
  }

  return `
    <section class="zone stage-result-zone">
      <div class="zone-header">
        <h3>Recent Rounds</h3>
        <span>history</span>
      </div>
      ${roundHistoryHtml}
    </section>
  `;
}

export function renderOnlineActionDockView(controls: OnlineControlState): string {
  const {
    canStartRoundSetup,
    canAutoResolveDealer,
    canDeclareGiveUp,
    canDealCards,
    canFlipDrawCard,
    canPrepareNextRound,
    canLeaveRoom,
    syncedPlayState,
    syncedSetupState,
    phaseHint
  } = controls;

  const hasActions =
    canStartRoundSetup ||
    canAutoResolveDealer ||
    canDeclareGiveUp ||
    canDealCards ||
    canFlipDrawCard ||
    canPrepareNextRound ||
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
        ${canAutoResolveDealer ? `<button id="online-auto-resolve-dealer" class="primary-button">Resolve Dealer</button>` : ""}
        ${canDeclareGiveUp ? `<button id="online-play-decision" class="secondary-button">Play</button>` : ""}
        ${canDeclareGiveUp ? `<button id="online-giveup-decision" class="secondary-button">Give Up</button>` : ""}
        ${canDealCards ? `<button id="online-deal-cards" class="primary-button">Deal Cards</button>` : ""}
        ${canFlipDrawCard ? `<button id="online-flip-draw-card" class="primary-button">Flip Draw Card</button>` : ""}
        ${canPrepareNextRound ? `<button id="online-prepare-next-round" class="primary-button">Prepare Next Round</button>` : ""}
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

export function renderOnlineTableView(args: OnlineTableArgs): string {
  return `
    <section class="panel board online-board">
      <div class="board-header board-intro-header">
        <div>
          <h2>Online Table</h2>
          <p class="panel-copy">Server-authoritative room ${args.roomId}. The table now keeps opponents above, the live center pile in the middle, and your hand anchored at the bottom.</p>
        </div>
        <div class="chips">
          <span class="chip">Dealer: ${args.dealerLabel}</span>
          <span class="chip">Active: ${args.activeCount}</span>
          <span class="chip">Viewer: ${args.viewerLabel}</span>
          <span class="chip">Balance: ${args.balanceLabel}</span>
        </div>
      </div>
      <div class="online-table-shell">
        <section class="zone online-table-banner">
          <div class="table-status-strip">
            <div class="status-pill">
              <span class="mini-label">Phase</span>
              <strong>${args.phaseLabel}</strong>
            </div>
            <div class="status-pill">
              <span class="mini-label">Current</span>
              <strong>${args.currentLabel}</strong>
            </div>
            <div class="status-pill">
              <span class="mini-label">Presence</span>
              <strong>${args.connectedCount}/${args.totalPlayers} connected</strong>
            </div>
            <div class="status-pill">
              <span class="mini-label">Ready</span>
              <strong>${args.readyCount}/${args.totalPlayers} ready</strong>
            </div>
            <div class="status-pill status-pill-balance">
              <span class="mini-label">Balance</span>
              <strong>${args.balanceLabel}</strong>
            </div>
          </div>
        </section>
        <section class="table-surface online-table-surface">
          ${args.boardHtml}
        </section>
        ${args.actionDockHtml}
      </div>
    </section>
  `;
}

export function renderPlayBoardView(args: LocalPlayBoardArgs): string {
  const { playState } = args;
  const activePlayerId = playState.phase === "completed" ? null : playState.currentPlayerId;
  const scoring =
    playState.phase === "completed"
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
      ? args.isInitialFloorTripleCapture(playState, playState.pendingHandCard)
      : playState.phase === "awaiting_draw_choice"
        ? args.isInitialFloorTripleCapture(playState, playState.revealedDrawCard)
        : false;
  const floorAction = args.getFloorAction(playState);
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
          ${playState.floorCards.map((cardId) => args.renderFloorCard(playState, cardId)).join("")}
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
                  ${args.renderCard(revealedDrawCard)}
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
                ${(playState.hands[playerId] ?? []).map((cardId) => args.renderHandCard(playState, playerId, cardId)).join("")}
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
              ${args.renderCapturedCardStack(playState.capturedByPlayer[playerId] ?? [], "history-captured-row")}
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
                      ${scoring.players.map((player) =>
                        renderDetailedScoreCardView(player.playerId, player, playState.capturedByPlayer[player.playerId] ?? [], {
                          getPlayerLabel: args.getPlayerLabel,
                          renderCard: args.renderCard
                        })
                      ).join("")}
                    </div>`
              }
              <div class="zone-header">
                <h3>Recent Rounds</h3>
                <span>${args.roundHistoryHtml === "" ? 0 : "saved"}</span>
              </div>
              ${args.roundHistoryHtml}
            </section>
          `
      }
    </div>
  `;
}
