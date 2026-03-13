# Lightsail Deployment

This project is ready to run on an AWS Lightsail Ubuntu 22.04 instance with Docker Compose.

## What Gets Deployed

- `app`: Node.js multiplayer/API server on internal port `8080`
- `web`: Nginx container serving the built web client and proxying `/api`, `/health`, and `/ws` to `app`
- `minhwatu-data` volume: persistent `accounts.json` and `table-state.json`

## Instance Preparation

On the Lightsail instance, after cloning the repository:

```bash
chmod +x deploy/lightsail/install-docker-ubuntu.sh
./deploy/lightsail/install-docker-ubuntu.sh
```

Log out once and reconnect so the Docker group applies.

## Deploy Steps

```bash
git clone <your-repo-url>
cd Minhwatu
chmod +x deploy/lightsail/deploy.sh deploy/lightsail/update.sh
cp .env.example .env
./deploy/lightsail/deploy.sh
```

The deploy helper does the repeatable production steps:

- creates `.env` from `.env.example` if it does not exist
- runs `docker compose build`
- runs `docker compose up -d`
- prints `docker compose ps`

Expected public ports:

- `80` from the `web` container
- `8080` stays internal to Docker

## Environment

Default `.env` values:

```dotenv
PORT=8080
HTTP_PORT=80
ACCOUNT_STORE_PATH=/app/data/accounts.json
TABLE_STORE_PATH=/app/data/table-state.json
```

Do not expose port `8080` publicly unless you intentionally want direct access to the Node server.

## Health Check

After startup:

```bash
curl http://127.0.0.1/health
```

Expected response:

```json
{"status":"ok"}
```

## Updating

```bash
./deploy/lightsail/update.sh
```

To update a different branch:

```bash
./deploy/lightsail/update.sh staging
```

## Logs

```bash
docker compose logs -f app
docker compose logs -f web
```

## Persistence

Runtime data is stored inside the named Docker volume `minhwatu-data`.

To inspect the data files:

```bash
docker volume inspect minhwatu_minhwatu-data
docker compose exec app ls -la /app/data
```

## HTTPS

The included Nginx config handles HTTP and reverse proxying only.

For production HTTPS on Lightsail, choose one of these:

1. Attach a Lightsail load balancer and terminate TLS there.
2. Put host-level Nginx or Caddy in front of Docker and manage certificates with Certbot or automatic TLS.

If you terminate TLS in front of the container, keep the websocket path as `/ws`.

## Suggested First-Day Command Order

For a fresh Lightsail Ubuntu 22.04 box:

```bash
sudo apt update && sudo apt install -y git
git clone <your-repo-url>
cd Minhwatu
chmod +x deploy/lightsail/install-docker-ubuntu.sh deploy/lightsail/deploy.sh deploy/lightsail/update.sh
./deploy/lightsail/install-docker-ubuntu.sh
exit
```

Reconnect to the server, then:

```bash
cd ~/Minhwatu
cp .env.example .env
./deploy/lightsail/deploy.sh
curl http://127.0.0.1/health
```
