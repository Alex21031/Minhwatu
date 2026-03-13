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

## Local Run

- Browser prototype: `npm run dev`
- Multiplayer server skeleton: `npm run server`
- Multiplayer server with auto-reload: `npm run server:watch`
- Browser E2E tests: `npm run test:e2e`

The server now persists account, balance, and audit data to `data/accounts.json` by default. Set `ACCOUNT_STORE_PATH` if you want a different local file.
Live room state, synchronized setup/play progress, action logs, and recent round results are also persisted to `data/table-state.json` by default. Set `TABLE_STORE_PATH` to override that path.

Before the first E2E run, install the Playwright browser once with `npx playwright install chromium`.

The first online slice currently exposes:

- `ws://localhost:8080` for WebSocket room actions
- `http://localhost:8080/health` for a simple health check

The browser prototype now also includes an `Online Lobby` panel for:

- connecting to the local multiplayer server
- identifying a player
- creating or joining a room
- leaving a room and refreshing the latest synchronized room snapshot
- starting a synchronized round setup flow
- auto-resolving the first dealer on the server
- sending synchronized `Play` or `Give Up` decisions during the 6/7-player give-up phase
- dealing a synchronized five-player round from the server-authoritative setup state
- selecting hand cards, resolving floor captures or discards, and flipping the synchronized draw pile
- preparing the next synchronized round after the server-authoritative round is complete
- hiding opponent hands and live draw-pile order from active players while still allowing spectator-mode clients to inspect all cards
