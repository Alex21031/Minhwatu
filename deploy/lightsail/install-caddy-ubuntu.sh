#!/usr/bin/env bash
set -euo pipefail

sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl

if [ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
fi

if [ ! -f /etc/apt/sources.list.d/caddy-stable.list ]; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
fi

sudo apt update
sudo apt install -y caddy
sudo systemctl enable caddy
sudo systemctl start caddy
sudo systemctl status caddy --no-pager
