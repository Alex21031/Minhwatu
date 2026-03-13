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
- Production server build: `npm run build:server`
- Full production build: `npm run build`
- Production server start: `npm start`
- Browser E2E tests: `npm run test:e2e`

Production builds are split by target:

- `build/server`: compiled Node.js server output
- `build/web`: compiled static web client output

The server now persists account, balance, and audit data to `data/accounts.json` by default. Set `ACCOUNT_STORE_PATH` if you want a different local file.
Live room state, synchronized setup/play progress, action logs, and recent round results are also persisted to `data/table-state.json` by default. Set `TABLE_STORE_PATH` to override that path.
The account service now rejects duplicate active logins for the same account until the existing session logs out or expires with a server restart.

Before the first E2E run, install the Playwright browser once with `npx playwright install chromium`.

The first online slice currently exposes:

- `ws://localhost:8080/ws` as the default local WebSocket endpoint used by the browser client
- `http://localhost:8080/health` for a simple health check

In reverse-proxied production hosting, the browser now defaults to `ws(s)://<host>/ws`, which matches the included Nginx deployment config.

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

## Deployment

Lightsail Ubuntu 22.04 deployment artifacts are included for a Docker-based setup:

- [Dockerfile](/d:/Game/Minhwatu/Dockerfile)
- [docker-compose.yml](/d:/Game/Minhwatu/docker-compose.yml)
- [.env.example](/d:/Game/Minhwatu/.env.example)
- [deploy/nginx/default.conf](/d:/Game/Minhwatu/deploy/nginx/default.conf)
- [deploy/lightsail/install-docker-ubuntu.sh](/d:/Game/Minhwatu/deploy/lightsail/install-docker-ubuntu.sh)
- [deploy/lightsail/install-caddy-ubuntu.sh](/d:/Game/Minhwatu/deploy/lightsail/install-caddy-ubuntu.sh)
- [deploy/lightsail/configure-caddy-site.sh](/d:/Game/Minhwatu/deploy/lightsail/configure-caddy-site.sh)
- [deploy/lightsail/deploy.sh](/d:/Game/Minhwatu/deploy/lightsail/deploy.sh)
- [deploy/lightsail/update.sh](/d:/Game/Minhwatu/deploy/lightsail/update.sh)
- [deploy/caddy/Caddyfile.template](/d:/Game/Minhwatu/deploy/caddy/Caddyfile.template)
- [docs/deploy-lightsail.md](/d:/Game/Minhwatu/docs/deploy-lightsail.md)

Recommended deployment flow:

1. Run `deploy/lightsail/install-docker-ubuntu.sh` on the Ubuntu 22.04 instance.
2. Copy `.env.example` to `.env` and adjust ports/paths if needed.
3. Run `deploy/lightsail/deploy.sh`.
4. Put a domain and HTTPS in front of the Nginx container on the Lightsail instance.

For Chrome-safe production hosting on a real domain, prefer HTTPS with host-level Caddy in front of Docker:

1. Set `HTTP_PORT=8081` in `.env`.
2. Run `./deploy/lightsail/update.sh`.
3. Run `./deploy/lightsail/install-caddy-ubuntu.sh`.
4. Run `sudo ./deploy/lightsail/configure-caddy-site.sh playhwatu.com`.

Live account maintenance:

- Purge every non-admin account from the live persistent store:
  - `docker compose exec app node build/server/server/tools/purge-player-accounts.js`
