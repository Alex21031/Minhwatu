import {
  scoreSelectedYakSettlement,
  YAK_RULES,
  type SelectedYakSettlementResult
} from "../domain/scoring.js";

export interface YakPresetDefinition {
  month: number;
  label: string;
  bonus: number;
  penalty: number;
}

export interface CalculatorYakSelectionState {
  month: number;
  checked: boolean;
}

export interface RoundSettlementInput {
  baseCardScore: number;
  myYakMonths: readonly number[];
  opponentYakMonths: readonly number[];
  moneyPerFivePoints: number;
}

export interface HistoryRoundEntry extends SelectedYakSettlementResult {
  id: string;
  createdAt: string;
  roundNumber: number;
}

export interface HistorySummary {
  totalScore: number;
  totalAmountWon: number;
  roundCount: number;
}

export const CALCULATOR_YAK_PRESETS: readonly YakPresetDefinition[] = YAK_RULES.map((rule) => ({
  month: rule.month,
  label: rule.label,
  bonus: rule.bonus,
  penalty: Math.abs(rule.penalty)
})).sort((left, right) => right.bonus - left.bonus);

export function calculateRoundSettlement(input: RoundSettlementInput): SelectedYakSettlementResult {
  return scoreSelectedYakSettlement(
    input.baseCardScore,
    input.myYakMonths,
    input.opponentYakMonths,
    input.moneyPerFivePoints
  );
}

export function applyExclusiveYakSelection(
  mineSelections: readonly CalculatorYakSelectionState[],
  opponentSelections: readonly CalculatorYakSelectionState[],
  owner: "mine" | "opponent",
  month: number,
  checked: boolean
): {
  mineSelections: CalculatorYakSelectionState[];
  opponentSelections: CalculatorYakSelectionState[];
} {
  const updateSelections = (
    selections: readonly CalculatorYakSelectionState[],
    nextChecked: boolean
  ): CalculatorYakSelectionState[] => selections.map((selection) =>
    selection.month === month
      ? { ...selection, checked: nextChecked }
      : selection
  );

  if (owner === "mine") {
    return {
      mineSelections: updateSelections(mineSelections, checked),
      opponentSelections: checked
        ? updateSelections(opponentSelections, false)
        : [...opponentSelections]
    };
  }

  return {
    mineSelections: checked
      ? updateSelections(mineSelections, false)
      : [...mineSelections],
    opponentSelections: updateSelections(opponentSelections, checked)
  };
}

export function createHistoryEntry(
  result: SelectedYakSettlementResult,
  roundNumber: number,
  createdAt: string,
  id: string
): HistoryRoundEntry {
  return {
    ...result,
    roundNumber,
    createdAt,
    id
  };
}

export function summarizeHistory(entries: readonly HistoryRoundEntry[]): HistorySummary {
  return {
    totalAmountWon: entries.reduce((total, entry) => total + entry.amountWon, 0),
    totalScore: entries.reduce((total, entry) => total + entry.finalScore, 0),
    roundCount: entries.length
  };
}
