import { type DealerDraw } from "./cards.js";

export interface InitialDealerRound {
  draws: DealerDraw[];
}

export interface InitialDealerResult {
  dealerId: string;
  winningDraw: DealerDraw;
  roundsPlayed: number;
}

export interface InitialDealerTie {
  status: "tied";
  contenders: DealerDraw[];
  roundsPlayed: number;
}

export interface InitialDealerResolved {
  status: "resolved";
  result: InitialDealerResult;
}

export type InitialDealerProgress = InitialDealerTie | InitialDealerResolved;

export interface NextDealerCandidate {
  playerId: string;
  finalScore: number;
  orderIndex: number;
}

export function evaluateInitialDealerRounds(rounds: readonly InitialDealerRound[]): InitialDealerProgress {
  if (rounds.length === 0) {
    throw new Error("At least one dealer draw round is required.");
  }

  let contenders: Set<string> | null = null;

  for (const [index, round] of rounds.entries()) {
    if (round.draws.length === 0) {
      throw new Error(`Dealer draw round ${index + 1} does not contain any draws.`);
    }

    const roundPlayers = new Set(round.draws.map((draw) => draw.playerId));
    if (roundPlayers.size !== round.draws.length) {
      throw new Error(`Dealer draw round ${index + 1} contains duplicate players.`);
    }

    if (contenders !== null) {
      if (roundPlayers.size !== contenders.size) {
        throw new Error(`Dealer draw round ${index + 1} does not match the previous tied contenders.`);
      }

      for (const playerId of roundPlayers) {
        if (!contenders.has(playerId)) {
          throw new Error(`Dealer draw round ${index + 1} includes a non-tied player: ${playerId}`);
        }
      }
    }

    const lowestMonth = Math.min(...round.draws.map((draw) => draw.month));
    const lowestMonthDraws = round.draws.filter((draw) => draw.month === lowestMonth);
    const highestScore = Math.max(...lowestMonthDraws.map((draw) => draw.score));
    const winners = lowestMonthDraws.filter((draw) => draw.score === highestScore);

    if (winners.length === 1) {
      const winningDraw = winners[0];
      if (winningDraw === undefined) {
        throw new Error(`Dealer draw round ${index + 1} produced no winning draw.`);
      }

      return {
        status: "resolved",
        result: {
          dealerId: winningDraw.playerId,
          winningDraw,
          roundsPlayed: index + 1
        }
      };
    }

    contenders = new Set(winners.map((draw) => draw.playerId));

    if (index === rounds.length - 1) {
      return {
        status: "tied",
        contenders: winners,
        roundsPlayed: index + 1
      };
    }
  }

  throw new Error("Dealer draw progress could not be evaluated.");
}

export function determineInitialDealer(rounds: readonly InitialDealerRound[]): InitialDealerResult {
  const progress = evaluateInitialDealerRounds(rounds);
  if (progress.status === "resolved") {
    return progress.result;
  }

  throw new Error("Dealer could not be determined from the provided draw rounds.");
}

export function determineNextDealer(candidates: readonly NextDealerCandidate[]): NextDealerCandidate {
  if (candidates.length === 0) {
    throw new Error("At least one next-dealer candidate is required.");
  }

  const winner = [...candidates].sort((left, right) => {
    if (left.finalScore !== right.finalScore) {
      return right.finalScore - left.finalScore;
    }

    return left.orderIndex - right.orderIndex;
  })[0];

  if (winner === undefined) {
    throw new Error("Next dealer could not be determined.");
  }

  return winner;
}
