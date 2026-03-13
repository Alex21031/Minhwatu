#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: sudo ./deploy/lightsail/configure-caddy-site.sh <domain> [upstream-port]"
  exit 1
fi

DOMAIN="$1"
UPSTREAM_PORT="${2:-8081}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_PATH="${SCRIPT_DIR}/../caddy/Caddyfile.template"

if [ ! -f "${TEMPLATE_PATH}" ]; then
  echo "Caddy template not found at ${TEMPLATE_PATH}."
  exit 1
fi

TEMP_OUTPUT="$(mktemp)"
trap 'rm -f "${TEMP_OUTPUT}"' EXIT

sed \
  -e "s/{{DOMAIN}}/${DOMAIN}/g" \
  -e "s/{{UPSTREAM_PORT}}/${UPSTREAM_PORT}/g" \
  "${TEMPLATE_PATH}" > "${TEMP_OUTPUT}"

sudo cp "${TEMP_OUTPUT}" /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
