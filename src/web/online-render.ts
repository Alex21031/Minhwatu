import type { PlayStateView, RoundHistoryEntry } from "../server/protocol.js";

import { scoreRound } from "../index.js";

type DetailedScorePlayer =
  | RoundHistoryEntry["players"][number]
  | ReturnType<typeof scoreRound>["players"][number];

interface OnlineRenderContext {
  connectedPlayerId: string | null;
  dealerId: string;
  getPlayerLabel: (playerId: string) => string;
  getOrderedPlayerIds: (activePlayerIds: readonly string[]) => string[];
  getFloorAction: (playState: PlayStateView, isCurrentOnlinePlayer: boolean) => string;
  renderActionHint: (playState: PlayStateView, isCurrentOnlinePlayer: boolean) => string;
  renderVisibleCard: (cardId: string) => string;
  renderCard: (cardId: string) => string;
  renderOnlineFloorCard: (playState: PlayStateView, cardId: string, isCurrentOnlinePlayer: boolean) => string;
  renderOnlineHandCard: (
    playState: PlayStateView,
    playerId: string,
    cardId: string,
    isCurrentOnlinePlayer: boolean
  ) => string;
}

export function renderCapturedCardStack(
  cards: readonly string[],
  renderCard: (cardId: string) => string,
  extraClassName = ""
): string {
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

export function renderDetailedScoreCard(
  playerLabel: string,
  player: DetailedScorePlayer,
  capturedCards: readonly string[],
  context: Pick<OnlineRenderContext, "getPlayerLabel" | "renderCard">
): string {
  const yakDetail =
    player.yakAdjustments.length === 0
      ? "none"
      : player.yakAdjustments
          .map((adjustment) => `month ${adjustment.month} ${adjustment.kind === "bonus" ? "+" : ""}${adjustment.points} (${context.getPlayerLabel(adjustment.sourcePlayerId)})`)
          .join(", ");

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
      <p class="score-line muted">Yak Detail: ${yakDetail}</p>
      ${renderCapturedCardStack(capturedCards, context.renderCard, "history-captured-row")}
    </article>
  `;
}

export function renderDetailedRoundHistoryList(
  history: readonly RoundHistoryEntry[],
  limit: number,
  context: Pick<OnlineRenderContext, "getPlayerLabel" | "renderCard">
): string {
  const limitedHistory = history.slice(0, limit);
  if (limitedHistory.length === 0) {
    return `<p class="panel-copy">No completed rounds yet.</p>`;
  }

  return `
    <div class="admin-ledger-list round-history-list">
      ${limitedHistory.map((entry) => `
        <div class="admin-room-item">
          <div>
            <strong>${entry.status === "reset" ? "Reset Round" : "Scored Round"}</strong>
            <p class="panel-copy">${entry.summaryText}</p>
            <p class="panel-copy muted">${new Date(entry.completedAt).toLocaleString()} · next dealer ${entry.nextDealerId ?? "same"}</p>
          </div>
          <div class="score-grid">
            ${
              entry.players.length === 0
                ? `<strong>-</strong>`
                : entry.players.map((player) =>
                    renderDetailedScoreCard(
                      context.getPlayerLabel(player.playerId),
                      player,
                      player.capturedCards,
                      context
                    )
                  ).join("")
            }
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

export function renderOnlinePlaySummary(
  playState: PlayStateView | null,
  context: OnlineRenderContext
): string {
  if (playState === null) {
    return `<p class="panel-copy">No synchronized play state is active for this room.</p>`;
  }

  const isCurrentOnlinePlayer =
    playState.phase !== "completed" && playState.currentPlayerId === context.connectedPlayerId;
  const onlineFloorAction = context.getFloorAction(playState, isCurrentOnlinePlayer);
  const onlineDrawPileAction =
    isCurrentOnlinePlayer && playState.phase === "awaiting_draw_flip" ? "flip-draw-pile" : "";
  const scoring =
    playState.phase === "completed"
      ? scoreRound(playState.capturedByPlayer, playState.activePlayerIds)
      : null;
  const orderedPlayerIds = context.getOrderedPlayerIds(playState.activePlayerIds);
  const bottomPlayerId = orderedPlayerIds.includes(context.connectedPlayerId ?? "")
    ? context.connectedPlayerId ?? orderedPlayerIds[orderedPlayerIds.length - 1]
    : orderedPlayerIds[orderedPlayerIds.length - 1];
  const topPlayerIds = orderedPlayerIds.filter((playerId) => playerId !== bottomPlayerId);

  return `
    <div class="online-play-layout">
      <div class="table-opponent-grid">
        ${topPlayerIds.map((playerId) => renderOnlinePlayerPod(playState, playerId, "top", isCurrentOnlinePlayer, context)).join("")}
      </div>
      <section class="online-table-arena">
        <div class="zone-header online-table-arena-header">
          <h3>Synced Play</h3>
          <span>${playState.phase === "completed" ? "round complete" : `Current: ${context.getPlayerLabel(playState.currentPlayerId)}`}</span>
        </div>
        <p class="panel-copy">${
          playState.phase === "completed"
            ? "The server-authoritative round is complete."
            : isCurrentOnlinePlayer
              ? "It is your synchronized turn."
              : "Waiting for the active synchronized player."
        }</p>
        ${context.renderActionHint(playState, isCurrentOnlinePlayer)}
        <div class="online-center-grid">
          <section class="zone online-floor-cluster ${onlineFloorAction === "" ? "" : "clickable-zone"}" ${onlineFloorAction === "" ? "" : `data-online-action="${onlineFloorAction}"`}>
            <div class="zone-header">
              <h3>Floor</h3>
              <span>${playState.floorCards.length} cards</span>
            </div>
            <div class="card-row online-floor-row">
              ${playState.floorCards.map((cardId) => context.renderOnlineFloorCard(playState, cardId, isCurrentOnlinePlayer)).join("")}
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
                      ${context.renderVisibleCard(playState.revealedDrawCard)}
                    </div>
                  `
                  : ""
              }
            </div>
            ${
              playState.viewerMode === "spectator"
                ? `<div class="card-row small online-draw-preview">${playState.drawPileCards.map(context.renderVisibleCard).join("")}</div>`
                : ""
            }
          </section>
        </div>
      </section>
      ${
        bottomPlayerId === undefined
          ? ""
          : `<div class="online-self-band">${renderOnlinePlayerPod(playState, bottomPlayerId, "bottom", isCurrentOnlinePlayer, context)}</div>`
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
                        context.getPlayerLabel(player.playerId),
                        player,
                        playState.capturedByPlayer[player.playerId] ?? [],
                        context
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
  isCurrentOnlinePlayer: boolean,
  context: OnlineRenderContext
): string {
  const handCards = playState.hands[playerId] ?? [];
  const capturedCards = playState.capturedByPlayer[playerId] ?? [];
  const isSelf = playerId === context.connectedPlayerId;
  const isActiveTurn = playState.phase !== "completed" && playState.currentPlayerId === playerId;
  const isDealer = context.dealerId === playerId;

  return `
    <article class="online-player-pod ${position === "bottom" ? "online-player-pod-self" : "online-player-pod-top"} ${isActiveTurn ? "active-turn" : ""}">
      <div class="online-player-head">
        <div>
          <h4>${context.getPlayerLabel(playerId)}${isSelf ? " (You)" : ""}</h4>
          <div class="online-player-badges">
            ${isDealer ? `<span class="roster-pill roster-pill-strong">Dealer</span>` : ""}
            ${isActiveTurn ? `<span class="roster-pill roster-pill-good">Turn</span>` : ""}
            <span class="roster-pill roster-pill-muted">${capturedCards.length} captured</span>
          </div>
        </div>
      </div>
      <div class="card-row ${position === "bottom" ? "online-hand-row-self" : "small online-hand-row-top"}">
        ${handCards.map((cardId) => context.renderOnlineHandCard(playState, playerId, cardId, isCurrentOnlinePlayer)).join("")}
      </div>
      ${renderCapturedCardStack(
        capturedCards,
        context.renderCard,
        position === "bottom" ? "online-captured-preview online-captured-preview-self" : "online-captured-preview"
      )}
    </article>
  `;
}
