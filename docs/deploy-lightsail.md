# Lightsail Deployment

This project is ready to run on an AWS Lightsail Ubuntu 22.04 instance with Docker Compose.

Chrome-family browsers are more reliable against the public domain once the site is served over HTTPS. The steps below include a host-level Caddy option for automatic TLS on `playhwatu.com`.

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

If you plan to put host-level Caddy in front of Docker for HTTPS, change `HTTP_PORT` to `8081` so Caddy can bind the public `80` and `443` ports:

```dotenv
HTTP_PORT=8081
```

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

## Live Account Maintenance

Duplicate active logins for the same account are blocked by the Node server after deployment.

To purge every non-admin account from the live persisted store while keeping the default admin account:

```bash
docker compose exec app node build/server/server/tools/purge-player-accounts.js
```

Expected output:

```json
{
  "storagePath": "/app/data/accounts.json",
  "removedUserIds": ["..."],
  "removedCount": 3
}
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

The included Nginx container handles HTTP and reverse proxying only. For reliable Chrome access on the production domain, use HTTPS.

### Recommended: Host-Level Caddy

1. Edit `.env` and set:

```dotenv
HTTP_PORT=8081
```

2. Rebuild and restart Docker on the new upstream port:

```bash
./deploy/lightsail/update.sh
```

3. Install Caddy on the Lightsail host:

```bash
chmod +x deploy/lightsail/install-caddy-ubuntu.sh deploy/lightsail/configure-caddy-site.sh
./deploy/lightsail/install-caddy-ubuntu.sh
```

4. Write the live site config and reload Caddy:

```bash
sudo ./deploy/lightsail/configure-caddy-site.sh playhwatu.com
```

That script writes `/etc/caddy/Caddyfile` from [deploy/caddy/Caddyfile.template](/d:/Game/Minhwatu/deploy/caddy/Caddyfile.template), redirects `www.playhwatu.com` to `playhwatu.com`, and proxies HTTPS traffic to `127.0.0.1:8081`.

5. Verify:

```bash
curl -I http://playhwatu.com
curl -I https://playhwatu.com
```

Expected result:
- `http://playhwatu.com` redirects to `https://playhwatu.com`
- `https://playhwatu.com` returns `200`

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
