#!/usr/bin/env bash
# Sigma Cap — installation sur un serveur Ubuntu ou Debian (ex. VPS Contabo).
# À lancer en root :  curl -fsSL https://raw.githubusercontent.com/Profdemaths882/sigma-cap/main/server/install.sh | bash -s sigmacap.mondomaine.com
set -euo pipefail
DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then echo "Indiquez le nom de domaine, ex. : bash install.sh sigmacap.racineprofdemaths.com"; exit 1; fi
if [ "$(id -u)" != 0 ]; then echo "Lancez ce script en root (ou avec sudo)."; exit 1; fi
. /etc/os-release
case "$ID" in ubuntu|debian) ;; *) echo "Système $ID non prévu (Ubuntu ou Debian attendu)."; exit 1;; esac
export DEBIAN_FRONTEND=noninteractive
echo "==> Paquets de base"
apt-get update -y -q
apt-get install -y -q curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https cron

echo "==> Node.js"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -q nodejs
fi

echo "==> Caddy (https automatique)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y -q && apt-get install -y -q caddy
fi

echo "==> Application"
id sigma >/dev/null 2>&1 || useradd --system --home /var/lib/sigma-cap --shell /usr/sbin/nologin sigma
if [ -d /opt/sigma-cap/.git ]; then git -C /opt/sigma-cap pull -q --ff-only; else git clone -q https://github.com/Profdemaths882/sigma-cap.git /opt/sigma-cap; fi
mkdir -p /var/lib/sigma-cap/{db,www,files/docs,files/rendus,corbeille} /var/backups/sigma-cap
chown -R sigma:sigma /var/lib/sigma-cap
chmod 755 /var/lib/sigma-cap /var/lib/sigma-cap/files /var/lib/sigma-cap/files/docs /var/lib/sigma-cap/www
chmod 700 /var/lib/sigma-cap/db /var/lib/sigma-cap/files/rendus /var/lib/sigma-cap/corbeille
cat > /var/lib/sigma-cap/www/config.js <<EOF
window.SIGMA_CONFIG = { API_URL: "https://$DOMAIN/api", SITE_URL: "https://$DOMAIN/" };
EOF
chmod 644 /var/lib/sigma-cap/www/config.js

cat > /etc/systemd/system/sigma-cap.service <<EOF
[Unit]
Description=Sigma Cap
After=network.target
[Service]
User=sigma
Environment=SIGMA_DATA=/var/lib/sigma-cap
ExecStart=/usr/bin/node /opt/sigma-cap/server/server.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now sigma-cap

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	@prive path /server/* /.git* /.github/*
	handle @prive {
		respond 404
	}
	handle /api* {
		reverse_proxy 127.0.0.1:3010
	}
	handle /files/docs/* {
		root * /var/lib/sigma-cap
		file_server
	}
	handle /config.js {
		root * /var/lib/sigma-cap/www
		header Cache-Control no-store
		file_server
	}
	handle {
		root * /opt/sigma-cap
		file_server
	}
}
EOF
systemctl reload caddy || systemctl restart caddy
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp; ufw allow 443/tcp; fi

echo "==> Mises à jour automatiques (toutes les 10 min) et sauvegarde chaque nuit"
install -m 755 /opt/sigma-cap/server/sigma-update.sh /usr/local/bin/sigma-update
cat > /etc/cron.d/sigma-cap <<EOF
*/10 * * * * root /usr/local/bin/sigma-update >/dev/null 2>&1
30 2 * * * root tar czf /var/backups/sigma-cap/sigma-\$(date +\%F).tgz -C /var/lib sigma-cap && find /var/backups/sigma-cap -name 'sigma-*.tgz' -mtime +30 -delete
EOF

echo
echo "Sigma Cap est installé : https://$DOMAIN"
echo "Étape suivante (une seule fois) : copier les données depuis Google :"
echo "   sudo -u sigma node /opt/sigma-cap/server/import.js && systemctl restart sigma-cap"
