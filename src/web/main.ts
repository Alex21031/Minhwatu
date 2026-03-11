import "../web/styles.css";

import {
  createDealerDraw,
  createPlayState,
  createRoundSetup,
  createStandardDeck,
  declareGiveUp,
  determineNextDealer,
  evaluateInitialDealerRounds,
  joinRoom,
  playTurn,
  prepareFinalFiveDeal,
  prepareFinalFiveDealWithRedeal,
  recordDealerDrawRound,
  scoreRound,
  shuffleDeck,
  sortPlayersBySeat,
  type CardScore,
  type DealerSelectionState,
  type DealtRoundState,
  type GiveUpState,
  type PlayState,
  type ReadyToPlayState,
  type RoomState,
  type RoundSetupState,
  createRoom
} from "../index.js";

interface DealerInput {
  month: number;
  score: CardScore;
}

interface AppState {
  playerCount: number;
  room: RoomState;
  setupState: RoundSetupState;
  dealtState: DealtRoundState | null;
  playState: PlayState | null;
  dealerInputs: Record<string, DealerInput>;
  cutIndex: number;
  log: string[];
}

const CARD_SCORES: CardScore[] = [0, 5, 10, 20];
const appRoot = document.querySelector<HTMLDivElement>("#app");

if (appRoot === null) {
  throw new Error("App root element was not found.");
}

let state = createInitialState(7);
render();

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
    dealerInputs: createDealerInputs(sortPlayersBySeat(room.players).map((player) => player.playerId)),
    cutIndex: 0,
    log: [`Room initialized with ${playerCount} seated players.`]
  };
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
  appRoot.innerHTML = `
    <div class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">Local Prototype</p>
          <h1>Minhwatu Table</h1>
          <p class="lede">Room seating, first dealer selection, give-up flow, final-five dealing, and local turn resolution are wired to the current domain engine.</p>
        </div>
        <div class="hero-stats">
          <div class="stat-card">
            <span class="stat-label">Phase</span>
            <strong>${getPhaseLabel()}</strong>
          </div>
          <div class="stat-card">
            <span class="stat-label">Players</span>
            <strong>${state.playerCount}</strong>
          </div>
        </div>
      </header>

      <main class="layout">
        <aside class="control-panel">
          ${renderControls()}
          ${renderLog()}
        </aside>
        <section class="table-panel">
          ${renderTable()}
        </section>
      </main>
    </div>
  `;

  bindEvents();
}

function renderControls(): string {
  return `
    <section class="panel">
      <h2>Room Control</h2>
      <label class="field">
        <span>Entrants</span>
        <select id="player-count">
          ${[5, 6, 7].map((value) => `<option value="${value}" ${value === state.playerCount ? "selected" : ""}>${value}</option>`).join("")}
        </select>
      </label>
      <button id="reset-room" class="primary-button">Reset Table</button>
    </section>
    ${renderPhaseControls()}
  `;
}

function renderPhaseControls(): string {
  if (state.playState !== null) {
    const currentPlayerLabel = state.playState.phase === "playing" ? state.playState.currentPlayerId : "round complete";
    return `
      <section class="panel">
        <h2>Turn Control</h2>
        <p class="panel-copy">Current player: <strong>${currentPlayerLabel}</strong></p>
        <label class="field">
          <span>Cut Index</span>
          <input id="cut-index" type="number" min="0" max="47" value="${state.cutIndex}" />
        </label>
        <button id="redeal" class="primary-button">Shuffle &amp; Redeal</button>
      </section>
    `;
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
      <button id="deal-cards" class="primary-button">Shuffle &amp; Deal</button>
    </section>
  `;
}

function renderLog(): string {
  return `
    <section class="panel">
      <h2>Table Log</h2>
      <ul class="log-list">
        ${state.log.map((entry) => `<li>${entry}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderTable(): string {
  return `
    <section class="panel board">
      <div class="board-header">
        <div>
          <h2>Seats</h2>
          <p class="panel-copy">Joined players always sit to the right of the most recently seated player.</p>
        </div>
        <div class="chips">
          <span class="chip">Dealer: ${getDealerLabel()}</span>
          <span class="chip">Active: ${getActiveCount()}</span>
        </div>
      </div>
      <div class="seat-grid">
        ${sortPlayersBySeat(state.room.players).map((player) => renderSeat(player.playerId, player.seatIndex, player.role)).join("")}
      </div>
      ${renderBoardState()}
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

function renderBoardState(): string {
  if (state.playState !== null) {
    const activeState = state.playState;
    const activePlayerId = activeState.phase === "playing" ? activeState.currentPlayerId : null;
    const scoring = activeState.phase === "completed"
      ? scoreRound(activeState.capturedByPlayer, activeState.activePlayerIds)
      : null;
    const nextDealer =
      scoring !== null && scoring.status === "scored"
        ? determineNextDealer(
            scoring.players.map((player) => ({
              playerId: player.playerId,
              finalScore: player.finalScore,
              orderIndex: activeState.activePlayerIds.indexOf(player.playerId)
            }))
          )
        : null;
    return `
      <div class="deal-layout">
        <section class="zone">
          <div class="zone-header">
            <h3>Floor</h3>
            <span>${activeState.floorCards.length} cards</span>
          </div>
          <div class="card-row">
            ${activeState.floorCards.map(renderCard).join("")}
          </div>
        </section>
        <section class="zone">
          <div class="zone-header">
            <h3>Draw Pile</h3>
            <span>${activeState.drawPile.length} cards remain</span>
          </div>
          <div class="pile-card">${activeState.drawPile.length}</div>
        </section>
        <section class="zone">
          <div class="zone-header">
            <h3>Hands</h3>
            <span>Turn order: ${activeState.turnOrder.join(" → ")}</span>
          </div>
          <div class="hands-grid">
            ${activeState.activePlayerIds.map((playerId) => `
              <article class="hand-panel ${playerId === activePlayerId ? "active-turn" : ""}">
                <h4>${playerId}</h4>
                <div class="card-row small">
                  ${(activeState.hands[playerId] ?? []).map((cardId) =>
                    activeState.phase === "playing" && playerId === activePlayerId
                      ? `<button class="play-card-button" data-card-id="${cardId}" title="Play ${cardId}">${renderCard(cardId)}</button>`
                      : renderCard(cardId)
                  ).join("")}
                </div>
              </article>
            `).join("")}
          </div>
        </section>
        <section class="zone">
          <div class="zone-header">
            <h3>Captured Cards</h3>
            <span>${activeState.lastTurn === null ? "No turns yet" : `Last turn: ${activeState.lastTurn.playerId}`}</span>
          </div>
          <div class="hands-grid">
            ${activeState.activePlayerIds.map((playerId) => `
              <article class="hand-panel">
                <h4>${playerId}</h4>
                <div class="card-row small">
                  ${(activeState.capturedByPlayer[playerId] ?? []).map(renderCard).join("")}
                </div>
              </article>
            `).join("")}
          </div>
        </section>
        ${
          scoring === null
            ? ""
            : `
              <section class="zone">
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
                            <p class="score-line muted">Counts: 광 ${player.counts.gwang}, 열끗 ${player.counts.yeolkkeut}, 띠 ${player.counts.tti}, 피 ${player.counts.pi}</p>
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

  if (state.setupState.phase === "waiting_for_giveups") {
    return `
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
    `;
  }

  if (state.setupState.phase === "ready_to_play") {
    return `
      <section class="zone">
      <div class="zone-header">
        <h3>Ready Table</h3>
        <span>${state.setupState.activePlayerIds.join(" · ")}</span>
        </div>
        <p class="panel-copy">The active five are locked. Shuffle the 48-card deck, apply the cut, and deal the round.</p>
      </section>
    `;
  }

  return `
    <section class="zone">
      <div class="zone-header">
        <h3>Dealer Contenders</h3>
        <span>${getDealerCandidates().join(" · ")}</span>
      </div>
      <p class="panel-copy">Resolve the current draw round to determine the first dealer. If tied on lowest month and score, only tied players draw again.</p>
    </section>
  `;
}

function renderCard(cardId: string): string {
  return `<img class="card-art" src="${getCardImage(cardId)}" alt="${cardId}" title="${cardId}" />`;
}

function bindEvents(): void {
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
    const nextInputs = createDealerInputs(getCandidatesFromState(nextState));
    const nextLog = [...state.log];

    if (nextState.phase === "selecting_initial_dealer") {
      nextLog.unshift(`Dealer draw tied. Next contenders: ${getCandidatesFromState(nextState).join(", ")}`);
    } else {
      nextLog.unshift(`Dealer resolved: ${nextState.dealerId}`);
    }

    state = {
      ...state,
      setupState: nextState,
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
}

function resolveGiveUp(giveUp: boolean): void {
  if (state.setupState.phase !== "waiting_for_giveups") {
    return;
  }

  const currentPlayerId = state.setupState.currentPlayerId;
  const nextState = declareGiveUp(state.setupState, currentPlayerId, giveUp);
  const verb = giveUp ? "gave up and moved to spectator mode" : "stayed in the round";

  state = {
      ...state,
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
    log: [`Final five dealt with cut index ${state.cutIndex}.${redealText} ${playState.currentPlayerId} opens the round.`, ...state.log].slice(0, 10)
  };

  render();
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
    return state.playState.phase === "playing" ? "playing" : "round complete";
  }

  if (state.dealtState !== null) {
    return "cards dealt";
  }

  return state.setupState.phase.replaceAll("_", " ");
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

  return state.setupState.activePlayerIds.length;
}

function getCardImage(cardId: string): string {
  return `/cards/minhwatu/exported/${cardId}.png`;
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest<HTMLButtonElement>(".play-card-button");
  if (button === null) {
    return;
  }

  const cardId = button.dataset.cardId;
  if (cardId === undefined || state.playState === null || state.playState.phase !== "playing") {
    return;
  }

  const currentPlayerId = state.playState.currentPlayerId;
  const nextPlayState = playTurn(state.playState, cardId);
  const resultText =
    nextPlayState.lastTurn === null
      ? `${currentPlayerId} played ${cardId}.`
      : `${currentPlayerId} played ${cardId}, drew ${nextPlayState.lastTurn.drawStep.playedCard}, and completed turn ${nextPlayState.completedTurns}.`;

  state = {
    ...state,
    playState: nextPlayState,
    log: [resultText, ...state.log].slice(0, 10)
  };

  render();
});
