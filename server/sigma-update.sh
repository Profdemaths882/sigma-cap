#!/usr/bin/env bash
# Récupère la dernière version du site et redémarre le serveur seulement si son code a changé.
set -e
cd /opt/sigma-cap
before=$(git rev-parse HEAD:server 2>/dev/null || echo none)
git pull -q --ff-only
after=$(git rev-parse HEAD:server 2>/dev/null || echo none)
if [ "$before" != "$after" ]; then
  install -m 755 /opt/sigma-cap/server/sigma-update.sh /usr/local/bin/sigma-update
  systemctl restart sigma-cap
fi
