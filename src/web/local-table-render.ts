import type { CardScore, PlayState, RoundSetupState } from "../index.js";

interface DealerInputValue {
  month: number;
  score: CardScore;
}

interface RenderBoardStateArgs {
  playState: PlayState | null;
  setupState: RoundSetupState;
  renderPlayBoard: (playState: PlayState) => string;
  renderCard: (cardId: string) => string;
  getDealerCandidates: () => string[];
}

interface RenderPhaseControlsArgs {
  playState: PlayState | null;
  setupState: RoundSetupState;
  cutIndex: number;
  dealerInputs: Record<string, DealerInputValue>;
  cardScores: readonly CardScore[];
  getDealerCandidates: () => string[];
  getPlayPhaseLabel: (playState: PlayState) => string;
  isInitialFloorTripleCapture: (playState: PlayState, cardId: string) => boolean;
  renderCard: (cardId: string) => string;
}

export function renderBoardStateView(args: RenderBoardStateArgs): string {
  if (args.playState !== null) {
    return args.renderPlayBoard(args.playState);
  }

  if (args.setupState.phase === "waiting_for_giveups") {
    const hiddenFloorCount = args.setupState.pendingDeal?.hiddenFloorCards.length ?? 0;
    return `
      <div class="deal-layout">
        <section class="zone">
          <div class="zone-header">
            <h3>Give-Up Order</h3>
            <span>${args.setupState.giveUpsNeeded} spectator slot(s)</span>
          </div>
          <ol class="decision-list">
            ${args.setupState.turnOrder.map((playerId) => `
              <li class="${playerId === args.setupState.currentPlayerId ? "current" : ""}">
                <span>${playerId}</span>
                <strong>${args.setupState.decisions[playerId]}</strong>
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
            args.setupState.pendingDeal === null
              ? "Hands are being prepared for the give-up phase."
              : "The floor remains hidden until the final five active players are confirmed."
          }</p>
          <div class="pile-card">8</div>
        </section>
        <section class="zone">
          <div class="zone-header">
            <h3>Hands Before Give-Up</h3>
            <span>${args.setupState.turnOrder.join(" -> ")}</span>
          </div>
          <div class="hands-grid">
            ${args.setupState.turnOrder.map((playerId) => `
              <article class="hand-panel ${playerId === args.setupState.currentPlayerId ? "active-turn" : ""}">
                <h4>${playerId}</h4>
                <div class="card-row small">
                  ${(args.setupState.pendingDeal?.hands[playerId] ?? []).map(args.renderCard).join("")}
                </div>
              </article>
            `).join("")}
          </div>
        </section>
      </div>
    `;
  }

  if (args.setupState.phase === "ready_to_play") {
    return `
      <section class="zone">
        <div class="zone-header">
          <h3>Ready Table</h3>
          <span>${args.setupState.activePlayerIds.join(" | ")}</span>
        </div>
        <p class="panel-copy">${
          args.setupState.predealtRound === null
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
        <span>${args.getDealerCandidates().join(" | ")}</span>
      </div>
      <p class="panel-copy">Resolve the current draw round to determine the first dealer. If tied on lowest month and score, only tied players draw again.</p>
    </section>
  `;
}

export function renderPhaseControlsView(args: RenderPhaseControlsArgs): string {
  if (args.playState !== null) {
    return renderTurnControlsView(args.playState, args.cutIndex, args.getPlayPhaseLabel, (playState) =>
      renderTurnActionPanelView(playState, args.isInitialFloorTripleCapture, args.renderCard)
    );
  }

  if (args.setupState.phase === "selecting_initial_dealer") {
    return `
      <section class="panel">
        <h2>Dealer Draw</h2>
        <p class="panel-copy">Set or auto-fill the current contenders' month and score, then resolve the draw round.</p>
        <div class="dealer-grid">
          ${args.getDealerCandidates().map((playerId) => {
            const value = args.dealerInputs[playerId];
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
                    ${args.cardScores.map((score) => `<option value="${score}" ${score === value.score ? "selected" : ""}>${score}</option>`).join("")}
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

  if (args.setupState.phase === "waiting_for_giveups") {
    return `
      <section class="panel">
        <h2>Give-Up Decision</h2>
        <p class="panel-copy">Current chooser: <strong>${args.setupState.currentPlayerId}</strong></p>
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
        <input id="cut-index" type="number" min="0" max="47" value="${args.cutIndex}" />
      </label>
      <button id="deal-cards" class="primary-button">${args.setupState.predealtRound === null ? "Shuffle & Deal" : "Reveal Floor & Start"}</button>
    </section>
  `;
}

function renderTurnControlsView(
  playState: PlayState,
  cutIndex: number,
  getPlayPhaseLabel: (playState: PlayState) => string,
  renderTurnActionPanel: (playState: PlayState) => string
): string {
  const currentPlayerLabel = playState.phase === "completed" ? "round complete" : playState.currentPlayerId;

  return `
    <section class="panel">
      <h2>Turn Control</h2>
      <p class="panel-copy">Current player: <strong>${currentPlayerLabel}</strong></p>
      <p class="panel-copy">Step: <strong>${getPlayPhaseLabel(playState)}</strong></p>
      ${renderTurnActionPanel(playState)}
      <label class="field">
        <span>Cut Index</span>
        <input id="cut-index" type="number" min="0" max="47" value="${cutIndex}" />
      </label>
      <button id="redeal" class="primary-button">Shuffle &amp; Redeal</button>
    </section>
  `;
}

function renderTurnActionPanelView(
  playState: PlayState,
  isInitialFloorTripleCapture: (playState: PlayState, cardId: string) => boolean,
  renderCard: (cardId: string) => string
): string {
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
