import { type CardId } from "./cards.js";
import { getCardMeta } from "./card-meta.js";

export interface CategoryCounts {
  gwang: number;
  yeolkkeut: number;
  tti: number;
  pi: number;
}

export interface YakAdjustment {
  month: number;
  kind: "bonus" | "penalty";
  points: number;
  sourcePlayerId: string;
}

export interface YakRuleDefinition {
  month: number;
  label: string;
  bonus: number;
  penalty: number;
}

export interface SelectedYakSettlementLineItem {
  side: "mine" | "opponent";
  month: number;
  label: string;
  points: number;
  impact: number;
}

export interface SelectedYakSettlementResult {
  baseCardScore: number;
  entryFee: number;
  myYakMonths: number[];
  opponentYakMonths: number[];
  myYakTotal: number;
  opponentYakPenaltyTotal: number;
  yakNetScore: number;
  finalScore: number;
  amountWon: number;
  moneyPerFivePoints: number;
  lineItems: SelectedYakSettlementLineItem[];
}

export interface PlayerRoundScore {
  playerId: string;
  counts: CategoryCounts;
  baseCardScore: number;
  entryFee: number;
  yakMonths: number[];
  yakAdjustments: YakAdjustment[];
  yakNetScore: number;
  finalScore: number;
  amountWon: number;
}

export interface RoundScoreResult {
  status: "scored" | "reset";
  players: PlayerRoundScore[];
  yakOwnerIds: string[];
}

export const YAK_RULES: readonly YakRuleDefinition[] = [
  { month: 1, label: "1월 송학", bonus: 400, penalty: -100 },
  { month: 2, label: "2월 매조", bonus: 480, penalty: -120 },
  { month: 3, label: "3월 벚꽃", bonus: 320, penalty: -80 },
  { month: 8, label: "8월 공산", bonus: 240, penalty: -60 },
  { month: 11, label: "11월 오동", bonus: 160, penalty: -40 },
  { month: 12, label: "12월 비", bonus: 80, penalty: -20 }
] as const;

const YAK_VALUES: Record<number, YakRuleDefinition> = Object.fromEntries(
  YAK_RULES.map((rule) => [rule.month, rule])
) as Record<number, YakRuleDefinition>;

export const ENTRY_FEE = -50;
export const MONEY_PER_FIVE_POINTS = 500;

export function summarizeCapturedCards(cards: readonly CardId[]): { counts: CategoryCounts; baseCardScore: number; yakMonths: number[] } {
  const counts: CategoryCounts = {
    gwang: 0,
    yeolkkeut: 0,
    tti: 0,
    pi: 0
  };
  const monthCounts = new Map<number, number>();
  let baseCardScore = 0;

  for (const cardId of cards) {
    const meta = getCardMeta(cardId);
    counts[meta.category] += 1;
    monthCounts.set(meta.month, (monthCounts.get(meta.month) ?? 0) + 1);
    baseCardScore += meta.pointValue;
  }

  const yakMonths = Object.keys(YAK_VALUES)
    .map((value) => Number.parseInt(value, 10))
    .filter((month) => monthCounts.get(month) === 4);

  return { counts, baseCardScore, yakMonths };
}

export function scoreSelectedYakSettlement(
  baseCardScore: number,
  myYakMonths: readonly number[],
  opponentYakMonths: readonly number[],
  moneyPerFivePoints = MONEY_PER_FIVE_POINTS
): SelectedYakSettlementResult {
  const normalizedBaseCardScore = normalizeScore(baseCardScore);
  const normalizedMoneyPerFivePoints = normalizePayoutRate(moneyPerFivePoints);
  const uniqueMyYakMonths = normalizeYakMonths(myYakMonths);
  const uniqueOpponentYakMonths = normalizeYakMonths(opponentYakMonths);
  const lineItems: SelectedYakSettlementLineItem[] = [
    ...uniqueMyYakMonths.map((month) => {
      const rule = getYakRule(month);
      if (rule === undefined) {
        throw new Error(`Unsupported Yak month: ${month}.`);
      }

      return {
        side: "mine" as const,
        month,
        label: rule.label,
        points: rule.bonus,
        impact: rule.bonus
      };
    }),
    ...uniqueOpponentYakMonths.map((month) => {
      const rule = getYakRule(month);
      if (rule === undefined) {
        throw new Error(`Unsupported Yak month: ${month}.`);
      }

      return {
        side: "opponent" as const,
        month,
        label: rule.label,
        points: Math.abs(rule.penalty),
        impact: rule.penalty
      };
    })
  ];

  const myYakTotal = lineItems
    .filter((lineItem) => lineItem.side === "mine")
    .reduce((total, lineItem) => total + lineItem.points, 0);
  const opponentYakPenaltyTotal = lineItems
    .filter((lineItem) => lineItem.side === "opponent")
    .reduce((total, lineItem) => total + lineItem.points, 0);
  const yakNetScore = lineItems.reduce((total, lineItem) => total + lineItem.impact, 0);
  const finalScore = normalizedBaseCardScore + ENTRY_FEE + yakNetScore;

  return {
    baseCardScore: normalizedBaseCardScore,
    entryFee: ENTRY_FEE,
    myYakMonths: uniqueMyYakMonths,
    opponentYakMonths: uniqueOpponentYakMonths,
    myYakTotal,
    opponentYakPenaltyTotal,
    yakNetScore,
    finalScore,
    amountWon: (finalScore / 5) * normalizedMoneyPerFivePoints,
    moneyPerFivePoints: normalizedMoneyPerFivePoints,
    lineItems
  };
}

export function scoreRound(
  capturedByPlayer: Record<string, CardId[]>,
  activePlayerIds: readonly string[]
): RoundScoreResult {
  const baseSummaries = activePlayerIds.map((playerId) => {
    const cards = capturedByPlayer[playerId] ?? [];
    const summary = summarizeCapturedCards(cards);
    return {
      playerId,
      ...summary
    };
  });

  const yakOwners = baseSummaries.filter((summary) => summary.yakMonths.length > 0);
  if (yakOwners.length >= 3) {
    return {
      status: "reset",
      yakOwnerIds: yakOwners.map((owner) => owner.playerId),
      players: baseSummaries.map((summary) => ({
        playerId: summary.playerId,
        counts: summary.counts,
        baseCardScore: summary.baseCardScore,
        entryFee: 0,
        yakMonths: summary.yakMonths,
        yakAdjustments: [],
        yakNetScore: 0,
        finalScore: 0,
        amountWon: 0
      }))
    };
  }

  const players = baseSummaries.map((summary) => {
    const yakAdjustments: YakAdjustment[] = [];

    for (const owner of yakOwners) {
      for (const month of owner.yakMonths) {
        const yakValue = YAK_VALUES[month];
        if (yakValue === undefined) {
          continue;
        }

        if (owner.playerId === summary.playerId) {
          yakAdjustments.push({
            month,
            kind: "bonus",
            points: yakValue.bonus,
            sourcePlayerId: owner.playerId
          });
        } else {
          yakAdjustments.push({
            month,
            kind: "penalty",
            points: yakValue.penalty,
            sourcePlayerId: owner.playerId
          });
        }
      }
    }

    const yakNetScore = yakAdjustments.reduce((total, adjustment) => total + adjustment.points, 0);
    const finalScore = summary.baseCardScore + ENTRY_FEE + yakNetScore;

    return {
      playerId: summary.playerId,
      counts: summary.counts,
      baseCardScore: summary.baseCardScore,
      entryFee: ENTRY_FEE,
      yakMonths: summary.yakMonths,
      yakAdjustments,
      yakNetScore,
      finalScore,
      amountWon: (finalScore / 5) * MONEY_PER_FIVE_POINTS
    };
  });

  return {
    status: "scored",
    yakOwnerIds: yakOwners.map((owner) => owner.playerId),
    players
  };
}

export function getYakRule(month: number): YakRuleDefinition | undefined {
  return YAK_VALUES[month];
}

function normalizeYakMonths(months: readonly number[]): number[] {
  return [...new Set(months.filter((month) => Number.isInteger(month) && YAK_VALUES[month] !== undefined))].sort((left, right) => left - right);
}

function normalizeScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.trunc(score);
}

function normalizePayoutRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    return MONEY_PER_FIVE_POINTS;
  }

  return Math.trunc(rate);
}
