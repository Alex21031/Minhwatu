# Project Spec

## Product Goal

Build `Minhwatu` as an online multiplayer card game with real-time turns, fixed five-player matches, winner determination, and money settlement based on final score.

## Document Status

- This document defines the current MVP scope.
- User-provided game rules are the source of truth for gameplay and settlement.
- Implementation should follow [`AGENTS.md`](/d:/Game/Minhwatu/AGENTS.md) and be tracked in [`tasks/todo.md`](/d:/Game/Minhwatu/tasks/todo.md).

## MVP Summary

- Room management: create room, join room, wait for players, start match.
- Real-time gameplay: server-synced turns and state updates.
- Result handling: winner calculation, final money settlement, rematch support.
- Match format: a room allows 5 to 7 entrants, but each round is always played by exactly 5 active players.

## Room And Participation Rules

- A room accepts a minimum of 5 and a maximum of 7 players.
- The first player takes the initial seat, and each newly joined player sits to the right of the most recently seated player.
- The actual match always starts with exactly 5 active players.
- If 6 or 7 players are in the room, up to 2 players may give up and sit out after receiving their hand.
- The give-up declaration order starts from the dealer and proceeds counterclockwise, which is the right-hand direction in this project.
- The last player in that order has no choice and must play if the match has not already been reduced to 5 active players.
- After give-up declarations are complete, the final 5 active players are locked for the round.
- Players who give up move into spectator mode for that round, can see all cards, and return to their original seats for the next round.
- Spectators can view all player hands and all revealed game cards.

## Dealer Rules

- First game: each player draws one random card from the deck, and the player with the lowest month value becomes the first dealer.
- First game tie-break step 1: if multiple players draw the same lowest month, the tied player with the higher card score becomes the dealer.
- First game tie-break step 2: if multiple tied players still share both the same month and the same score, only those tied players draw again and the same rule repeats: lower month first, then higher score.
- Later games: the player with the highest score in the previous round becomes the next dealer.
- Later game tie-break: if multiple players tie for the highest score, the tied player who acted earlier in the previous round order becomes the dealer.

## Card Setup And Start Flow

- The dealer shuffles the deck.
- The player seated to the dealer's left performs the cut (`giri`).
- The dealer deals cards starting from the player on the dealer's right and continues counterclockwise.
- Cards are dealt in groups of 4.
- The dealer receives cards last.
- All hand cards are private and visible only to their owner.
- If 6 or 7 players have entered the room, the 8 floor cards remain face down until the 5 active players are finalized.
- After the active 5 players are fixed, the 8 floor cards are revealed face up and the game begins.

## Turn Flow

- Turn order moves counterclockwise, starting from the dealer.
- Each turn has two phases.

### Phase 1: Play A Hand Card

- The active player selects one card from hand and plays it.
- If the floor contains a card with the same month, the played card and one matching floor card are collected and placed face up in front of the player.
- If there is no matching month on the floor, the played card remains on the floor.

### Phase 2: Flip The Deck

- The top card of the central deck is revealed.
- If the floor contains a card with the same month, the revealed card and one matching floor card are collected and placed face up in front of the player.
- If there is no matching month on the floor, the revealed card remains on the floor.

## Round End Condition

- The round ends when all hand cards, floor progression, and the draw deck are exhausted.

## Base Scoring

- `Gwang` cards: 20 points each, 5 total cards in the deck.
- `Yeolkkeut` cards: 10 points each, 10 total cards in the deck.
- `Tti` cards: 5 points each, 10 total cards in the deck.
- `Pi` cards: 0 points each, 23 total cards in the deck.

## Entry Fee Deduction

- Each of the 5 active players pays a base entry fee of 50 points.
- Final score starts as `base card score - 50`.

## Yak Rules

- A player completes a `Yak` by collecting all 4 cards of one of these months: 1, 2, 3, 8, 11, or 12.
- When a `Yak` is completed, the owner gains a bonus and each of the other 4 active players takes an extra deduction.

| Month | Name | Bonus To Owner | Extra Deduction To Each Other Player |
| --- | --- | ---: | ---: |
| 12 | Bi | +80 | -20 |
| 11 | Odong | +160 | -40 |
| 8 | Gongsan | +240 | -60 |
| 3 | Beotkkot | +320 | -80 |
| 1 | Songhak | +400 | -100 |
| 2 | Maejo | +480 | -120 |

## Multiple Yak Handling

- If one player completes multiple `Yak`, all related bonuses and penalties stack.
- If two players complete `Yak`, each completed `Yak` is applied independently and stacks across all players.
- A player who completed one `Yak` still pays the penalty caused by another player's `Yak`.
- If 3 or more players complete any `Yak`, the round is canceled and reset with no gains or losses.

## Final Settlement

- Final score formula: `base card score - 50 +/- Yak bonus and Yak penalties`.
- Positive final score: receive `(final score / 5) * 500 KRW`.
- Negative final score: pay `(abs(final score) / 5) * 500 KRW`.

## MVP System Requirements

- The server is authoritative for shuffling, dealing, give-up decisions, turn order, capture resolution, scoring, `Yak` detection, and money settlement.
- Clients receive real-time state updates and only submit player intentions such as join, give up, play card, or rematch.
- Spectator mode must expose all player hands and all revealed cards to spectators and to players who gave up for the current round.
- The match result screen must show each player's base score, entry fee deduction, `Yak` adjustments, final score, and final amount won or lost.
- Rematch support must preserve the room when enough players remain and must assign the next dealer based on the previous winner.
- The MVP has no timeout rule for give-up declarations or turn actions.

## Open Implementation Questions

- None at the gameplay-rule level. Remaining open items should be implementation-specific, such as protocol design, engine choice, and UI flow.
