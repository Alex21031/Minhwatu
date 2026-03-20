import "./calculator.css";

import {
  applyExclusiveYakSelection,
  CALCULATOR_YAK_PRESETS,
  calculateRoundSettlement,
  createHistoryEntry,
  summarizeHistory,
  type CalculatorYakSelectionState,
  type HistoryRoundEntry
} from "./calculator-logic.js";

interface CalculatorState {
  baseCardScoreInput: string;
  payoutRatePerFivePoints: 500 | 100;
  myPresetSelections: CalculatorYakSelectionState[];
  opponentPresetSelections: CalculatorYakSelectionState[];
  latestRound: HistoryRoundEntry | null;
  history: HistoryRoundEntry[];
}

const HISTORY_STORAGE_KEY = "minhwatu.settlement-calculator.history.v1";
const HISTORY_BACKUP_STORAGE_KEY = "minhwatu.settlement-calculator.history.backup.v1";
const appRoot = document.querySelector<HTMLDivElement>("#calculator-app");

if (appRoot === null) {
  throw new Error("Calculator app root was not found.");
}

let state = createInitialState();

bindEvents();
render();

function createInitialState(): CalculatorState {
  return {
    baseCardScoreInput: "",
    payoutRatePerFivePoints: 500,
    myPresetSelections: createPresetSelectionState(),
    opponentPresetSelections: createPresetSelectionState(),
    latestRound: null,
    history: loadHistory()
  };
}

function createPresetSelectionState(): CalculatorYakSelectionState[] {
  return CALCULATOR_YAK_PRESETS.map((preset) => ({
    month: preset.month,
    checked: false
  }));
}

function loadHistory(): HistoryRoundEntry[] {
  try {
    const primaryHistory = parseHistory(window.localStorage.getItem(HISTORY_STORAGE_KEY));
    if (primaryHistory !== null) {
      return primaryHistory;
    }

    const backupHistory = parseHistory(window.localStorage.getItem(HISTORY_BACKUP_STORAGE_KEY));
    return backupHistory ?? [];
  } catch {
    return [];
  }
}

function saveHistory(): void {
  const serializedHistory = JSON.stringify(state.history);
  window.localStorage.setItem(HISTORY_STORAGE_KEY, serializedHistory);
  window.localStorage.setItem(HISTORY_BACKUP_STORAGE_KEY, serializedHistory);
}

function parseHistory(raw: string | null): HistoryRoundEntry[] | null {
  if (raw === null) {
    return null;
  }

  const parsed = JSON.parse(raw) as HistoryRoundEntry[];
  if (!Array.isArray(parsed)) {
    return null;
  }

  return parsed.filter(isHistoryRoundEntry);
}

function isHistoryRoundEntry(value: unknown): value is HistoryRoundEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<HistoryRoundEntry>;
  return typeof candidate.id === "string"
    && typeof candidate.roundNumber === "number"
    && typeof candidate.createdAt === "string"
    && typeof candidate.finalScore === "number";
}

function bindEvents(): void {
  document.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-action]");
    if (button === null) {
      return;
    }

    const action = button.dataset.action;
    if (action === undefined) {
      return;
    }

    switch (action) {
      case "calculate":
        runCalculation();
        return;
      case "reset-inputs":
        resetInputs();
        return;
      case "clear-history":
        clearHistory();
        return;
      case "delete-history-entry": {
        const entryId = button.dataset.entryId;
        if (entryId !== undefined) {
          deleteHistoryEntry(entryId);
        }
        return;
      }
      default:
        return;
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (target === null) {
      return;
    }

    if (target.id === "base-card-score-input") {
      state = {
        ...state,
        baseCardScoreInput: target.value
      };
      return;
    }

    if (target.name === "payout-rate-per-five") {
      const nextRate = target.value === "100" ? 100 : 500;
      state = {
        ...state,
        payoutRatePerFivePoints: nextRate
      };
      render();
      return;
    }

    if (target.dataset.selectionOwner !== undefined && target.dataset.selectionMonth !== undefined) {
      updatePresetSelection(
        target.dataset.selectionOwner === "mine" ? "mine" : "opponent",
        Number.parseInt(target.dataset.selectionMonth, 10),
        target.checked
      );
    }
  });
}

function updatePresetSelection(owner: "mine" | "opponent", month: number, checked: boolean): void {
  const nextSelections = applyExclusiveYakSelection(
    state.myPresetSelections,
    state.opponentPresetSelections,
    owner,
    month,
    checked
  );
  state = {
    ...state,
    myPresetSelections: nextSelections.mineSelections,
    opponentPresetSelections: nextSelections.opponentSelections
  };
  render();
}

function runCalculation(): void {
  const result = calculateRoundSettlement({
    baseCardScore: parseInteger(state.baseCardScoreInput),
    myYakMonths: collectSelectedYakMonths("mine"),
    opponentYakMonths: collectSelectedYakMonths("opponent"),
    moneyPerFivePoints: state.payoutRatePerFivePoints
  });

  const entry = createHistoryEntry(
    result,
    state.history.length + 1,
    new Date().toISOString(),
    createId()
  );

  state = {
    ...state,
    latestRound: entry,
    history: [...state.history, entry]
  };
  saveHistory();
  render();
}

function collectSelectedYakMonths(owner: "mine" | "opponent"): number[] {
  const selections = owner === "mine" ? state.myPresetSelections : state.opponentPresetSelections;
  return selections
    .filter((selection) => selection.checked)
    .map((selection) => selection.month);
}

function resetInputs(): void {
  state = {
    ...state,
    baseCardScoreInput: "",
    payoutRatePerFivePoints: 500,
    myPresetSelections: createPresetSelectionState(),
    opponentPresetSelections: createPresetSelectionState()
  };
  render();
}

function deleteHistoryEntry(entryId: string): void {
  const nextHistory = state.history
    .filter((entry) => entry.id !== entryId)
    .map((entry, index) => ({
      ...entry,
      roundNumber: index + 1
    }));

  state = {
    ...state,
    history: nextHistory,
    latestRound: state.latestRound?.id === entryId
      ? nextHistory.at(-1) ?? null
      : state.latestRound
  };
  saveHistory();
  render();
}

function clearHistory(): void {
  state = {
    ...state,
    history: [],
    latestRound: null
  };
  saveHistory();
  render();
}

function render(): void {
  const latestRound = state.latestRound ?? state.history.at(-1) ?? null;
  const historySummary = summarizeHistory(state.history);
  const totalAmountToneClass =
    historySummary.totalAmountWon > 0
      ? "positive"
      : historySummary.totalAmountWon < 0
        ? "negative"
        : "";
  const latestAmountToneClass =
    latestRound === null
      ? ""
      : latestRound.amountWon > 0
        ? "positive"
        : latestRound.amountWon < 0
          ? "negative"
          : "";

  appRoot.innerHTML = `
    <main class="calc-shell">
      <section class="calc-hero">
        <div>
          <p class="calc-eyebrow">Settlement Tool</p>
          <h1>Калькулятор очков и “Yak”</h1>
          <p class="calc-lede">
            Использует те же правила расчёта, что и основной проект. Введите базовые очки по картам, отметьте месячные “Yak” у себя и у соперника,
            и калькулятор посчитает вступительный взнос, бонусы и штрафы за “Yak”, итоговые очки и денежный результат.
          </p>
        </div>
        <div class="calc-hero-stats">
          <article class="calc-stat">
            <span class="calc-stat-label">Сыграно раундов</span>
            <strong>${historySummary.roundCount}</strong>
          </article>
          <article class="calc-stat">
            <span class="calc-stat-label">Текущий итог</span>
            <strong class="${totalAmountToneClass}">${formatCurrency(historySummary.totalAmountWon)}</strong>
          </article>
          <article class="calc-stat">
            <span class="calc-stat-label">Последний результат</span>
            <strong class="${latestAmountToneClass}">${latestRound === null ? "Нет расчёта" : formatCurrency(latestRound.amountWon)}</strong>
          </article>
          <article class="calc-stat">
            <span class="calc-stat-label">Переход</span>
            <strong><a href="/" style="color: inherit;">Вернуться в игру</a></strong>
          </article>
        </div>
      </section>

      <section class="calc-grid">
        <div class="calc-stack">
          <section class="calc-panel">
            <div class="calc-panel-header">
              <div>
                <h2>Ввод</h2>
                <p class="calc-hint">Введите базовые очки карт, выберите месячные “Yak” у обеих сторон и укажите тариф денежного расчёта.</p>
              </div>
              <span class="calc-badge">Round Input</span>
            </div>

            <div class="calc-input-grid">
              <div class="calc-field">
                <label for="base-card-score-input">Базовые очки карт</label>
                <input
                  id="base-card-score-input"
                  class="calc-input"
                  type="number"
                  inputmode="numeric"
                  placeholder="например: 70"
                  value="${escapeAttribute(state.baseCardScoreInput)}"
                />
                <p class="calc-hint">Введите сумму очков по собранным картам до вычета вступительного взноса.</p>
              </div>

              <div class="calc-field">
                <label>Денежный тариф</label>
                <div class="rate-selector">
                  ${renderPayoutRateOption(500, "5 очков = 500 вон")}
                  ${renderPayoutRateOption(100, "5 очков = 100 вон")}
                </div>
              </div>

              <div class="yak-panels">
                ${renderYakPanel("mine", "Мои Yak", "Отметьте все месячные Yak, которые собрали вы.")}
                ${renderYakPanel("opponent", "Yak соперника", "Отметьте все месячные Yak, которые собрал соперник.")}
              </div>

              <div class="calc-actions">
                <button class="primary-button" data-action="calculate">Рассчитать</button>
                <button class="secondary-button" data-action="reset-inputs">Сбросить ввод</button>
                <button class="danger-button" data-action="clear-history">Очистить историю</button>
              </div>
            </div>
          </section>

          ${renderLatestResult(latestRound)}
        </div>

        <aside class="calc-stack">
          <section class="calc-panel">
            <div class="calc-panel-header">
              <div>
                <h2>История</h2>
                <p class="calc-hint">Сохраняйте результаты по раундам и смотрите общий накопленный итог.</p>
              </div>
              <span class="calc-badge">History</span>
            </div>
            <div class="history-summary">
              <div>
                <strong>Раундов: ${historySummary.roundCount}</strong>
                <div class="history-meta ${totalAmountToneClass}">Суммарно по деньгам: ${formatCurrency(historySummary.totalAmountWon)}</div>
              </div>
            </div>
            ${renderHistoryList()}
          </section>
        </aside>
      </section>
    </main>
  `;
}

function renderYakPanel(owner: "mine" | "opponent", title: string, hint: string): string {
  const selections = owner === "mine" ? state.myPresetSelections : state.opponentPresetSelections;
  const oppositeSelections = owner === "mine" ? state.opponentPresetSelections : state.myPresetSelections;

  return `
    <section class="yak-panel">
      <div>
        <h3>${title}</h3>
        <p class="calc-hint">${hint}</p>
      </div>
      <div class="yak-group">
        <h3>Yak из основного проекта</h3>
        <div class="yak-list">
          ${CALCULATOR_YAK_PRESETS.map((preset) => {
            const selection = selections.find((entry) => entry.month === preset.month);
            const oppositeSelection = oppositeSelections.find((entry) => entry.month === preset.month);
            const isLocked = oppositeSelection?.checked === true && selection?.checked !== true;
            return `
              <label class="yak-row ${isLocked ? "yak-row-disabled" : ""}">
                <input
                  class="yak-checkbox"
                  type="checkbox"
                  data-selection-owner="${owner}"
                  data-selection-month="${preset.month}"
                  ${selection?.checked === true ? "checked" : ""}
                  ${isLocked ? "disabled" : ""}
                />
                <span class="yak-copy">
                  <strong>${preset.penalty}</strong>
                  <span>Бонус +${preset.bonus} / штраф соперникам -${preset.penalty}</span>
                </span>
                <span class="yak-value-chip">${preset.penalty} очк.</span>
              </label>
            `;
          }).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderLatestResult(latestRound: HistoryRoundEntry | null): string {
  if (latestRound === null) {
    return `
      <section class="calc-panel">
        <div class="calc-panel-header">
          <div>
            <h2>Результат</h2>
            <p class="calc-hint">После расчёта здесь появятся итог за раунд и подробная расшифровка.</p>
          </div>
          <span class="calc-badge">Result</span>
        </div>
        <div class="empty-state">Пока нет рассчитанного результата.</div>
      </section>
    `;
  }

  return `
    <section class="calc-panel">
      <div class="calc-panel-header">
        <div>
          <h2>Последний расчёт</h2>
          <p class="calc-hint">Результат ${latestRound.roundNumber}-го раунда по тем же формулам, что и в основном проекте.</p>
        </div>
        <span class="calc-badge">Раунд ${latestRound.roundNumber}</span>
      </div>

      <div class="result-grid">
        <article class="result-total">
          <span class="calc-stat-label">Итоговые очки</span>
          <div class="result-score ${latestRound.finalScore >= 0 ? "positive" : "negative"}">${formatSignedScore(latestRound.finalScore)}</div>
          <div class="history-meta">${formatDateTime(latestRound.createdAt)}</div>
        </article>
        <article class="result-detail">
          <div class="result-metrics">
            <div class="metric-card">
              <span>Базовые очки</span>
              <strong>${formatSignedScore(latestRound.baseCardScore)}</strong>
            </div>
            <div class="metric-card">
              <span>Вступительный взнос</span>
              <strong>${formatSignedScore(latestRound.entryFee)}</strong>
            </div>
            <div class="metric-card">
              <span>Чистый эффект Yak</span>
              <strong>${formatSignedScore(latestRound.yakNetScore)}</strong>
            </div>
            <div class="metric-card">
              <span>Бонус моих Yak</span>
              <strong>${formatSignedScore(latestRound.myYakTotal)}</strong>
            </div>
            <div class="metric-card">
              <span>Штраф от Yak соперника</span>
              <strong>${formatSignedScore(-latestRound.opponentYakPenaltyTotal)}</strong>
            </div>
            <div class="metric-card">
              <span>Денежный итог</span>
              <strong>${formatCurrency(latestRound.amountWon)}</strong>
            </div>
            <div class="metric-card">
              <span>Тариф</span>
              <strong>5 очков = ${latestRound.moneyPerFivePoints} вон</strong>
            </div>
          </div>
        </article>
      </div>

      <div class="line-item-list">
        ${latestRound.lineItems.length === 0
          ? `<div class="empty-state">В этом раунде Yak не выбраны.</div>`
          : latestRound.lineItems.map((item) => `
            <div class="line-item ${item.side}">
              <div>
                <strong>${item.side === "mine" ? "Мой Yak" : "Yak соперника"} · ${item.label}</strong>
                <small>${item.side === "mine" ? "добавляется к моим очкам" : "вычитается из моих очков"}</small>
              </div>
              <strong>${formatSignedScore(item.impact)}</strong>
            </div>
          `).join("")}
      </div>
    </section>
  `;
}

function renderHistoryList(): string {
  if (state.history.length === 0) {
    return `<div class="empty-state">История пока пуста.</div>`;
  }

  return `
    <div class="history-list">
      ${[...state.history].reverse().map((entry) => `
        <article class="history-card">
          <div class="history-header">
            <div>
              <strong>Раунд ${entry.roundNumber}</strong>
              <div class="history-meta">${formatDateTime(entry.createdAt)}</div>
            </div>
            <div class="history-round-money ${entry.amountWon >= 0 ? "positive" : "negative"}">${formatCurrency(entry.amountWon)}</div>
          </div>
          <div class="history-summary">
            <div class="history-tags">
              <span class="history-tag history-tag-strong">Деньги ${formatCurrency(entry.amountWon)}</span>
              <span class="history-tag">Очки ${formatSignedScore(entry.finalScore)}</span>
              <span class="history-tag">База ${formatSignedScore(entry.baseCardScore)}</span>
              <span class="history-tag">Yak ${formatSignedScore(entry.yakNetScore)}</span>
              <span class="history-tag">Тариф ${entry.moneyPerFivePoints}</span>
            </div>
            <button class="ghost-button" data-action="delete-history-entry" data-entry-id="${entry.id}">Удалить</button>
          </div>
          <div class="line-item-list">
            ${entry.lineItems.length === 0
              ? `<div class="empty-state">Yak не выбраны</div>`
              : entry.lineItems.map((item) => `
                <div class="line-item ${item.side}">
                  <div>
                    <strong>${item.label}</strong>
                    <small>${item.side === "mine" ? "мой Yak" : "Yak соперника"}</small>
                  </div>
                  <strong>${formatSignedScore(item.impact)}</strong>
                </div>
              `).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderPayoutRateOption(rate: 500 | 100, label: string): string {
  return `
    <label class="rate-option">
      <input
        type="radio"
        name="payout-rate-per-five"
        value="${rate}"
        ${state.payoutRatePerFivePoints === rate ? "checked" : ""}
      />
      <span>${label}</span>
    </label>
  `;
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSignedScore(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
}

function formatCurrency(value: number): string {
  const absoluteValue = Math.abs(value).toLocaleString("ru-RU");
  return value >= 0 ? `+${absoluteValue} вон` : `-${absoluteValue} вон`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function createId(): string {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
