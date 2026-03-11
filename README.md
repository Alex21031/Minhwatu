# Minhwatu

`Minhwatu` is planned as an online multiplayer Minhwatu game with fixed five-player matches, real-time turn synchronization, score calculation, and money settlement.

## Working Rules

- Follow [`AGENTS.md`](/d:/Game/Minhwatu/AGENTS.md) for editing, planning, verification, and task-tracking rules.
- Record active work in [`tasks/todo.md`](/d:/Game/Minhwatu/tasks/todo.md).
- Record persistent corrections and process improvements in [`tasks/lessons.md`](/d:/Game/Minhwatu/tasks/lessons.md).

## Current MVP

- Room creation and join flow for 5 to 7 entrants.
- Exactly 5 active players per round after the give-up selection phase.
- Real-time turn progression starting from the dealer and moving counterclockwise.
- End-of-round score calculation, `Yak` bonus and penalty handling, final money settlement, and rematch support.

## Specification

- Product and gameplay rules are documented in [`docs/project-spec.md`](/d:/Game/Minhwatu/docs/project-spec.md).
- The MVP spec currently defines room flow, dealer selection, dealing flow, turn order, scoring, `Yak` handling, and settlement rules.

## Next Step

Choose the implementation stack and start the server-authoritative game architecture from [`docs/project-spec.md`](/d:/Game/Minhwatu/docs/project-spec.md).
