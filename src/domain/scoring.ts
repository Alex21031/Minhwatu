import { type CardId } from "./cards.js";
import { type CardCategory, getCardMeta } from "./card-meta.js";

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

const CATEGORY_POINTS: Record<CardCategory, number> = {
  gwang: 20,
  yeolkkeut: 10,
  tti: 5,
  pi: 0
};

const YAK_VALUES: Record<number, { bonus: number; penalty: number }> = {
  1: { bonus: 400, penalty: -100 },
  2: { bonus: 480, penalty: -120 },
  3: { bonus: 320, penalty: -80 },
  8: { bonus: 240, penalty: -60 },
  11: { bonus: 160, penalty: -40 },
  12: { bonus: 80, penalty: -20 }
};

const ENTRY_FEE = -50;
const MONEY_PER_FIVE_POINTS = 500;

export function summarizeCapturedCards(cards: readonly CardId[]): { counts: CategoryCounts; baseCardScore: number; yakMonths: number[] } {
  const counts: CategoryCounts = {
    gwang: 0,
    yeolkkeut: 0,
    tti: 0,
    pi: 0
  };
  const monthCounts = new Map<number, number>();

  for (const cardId of cards) {
    const meta = getCardMeta(cardId);
    counts[meta.category] += 1;
    monthCounts.set(meta.month, (monthCounts.get(meta.month) ?? 0) + 1);
  }

  const baseCardScore = Object.entries(counts).reduce((total, [category, count]) => {
    return total + CATEGORY_POINTS[category as CardCategory] * count;
  }, 0);

  const yakMonths = Object.keys(YAK_VALUES)
    .map((value) => Number.parseInt(value, 10))
    .filter((month) => monthCounts.get(month) === 4);

  return { counts, baseCardScore, yakMonths };
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
