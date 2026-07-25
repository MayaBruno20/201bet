#!/usr/bin/env bash
# Restart Coolify Traefik proxy if HTTPS to the app stops responding.
#
# Install on VPS:
#   sudo cp infra/hostinger/scripts/check-site.sh /root/check-site.sh
#   sudo chmod +x /root/check-site.sh
#   (crontab -l 2>/dev/null | grep -v check-site.sh; \
#     echo '*/2 * * * * /root/check-site.sh >> /var/log/check-site.log 2>&1') | crontab -
#
# Override URL: SITE_HEALTH_URL=https://... /root/check-site.sh
set -euo pipefail

URL="${SITE_HEALTH_URL:-https://palpite201.com/api/health}"
TIMEOUT="${SITE_HEALTH_TIMEOUT:-10}"
LOCK="/tmp/check-site.lock"

exec 9>"$LOCK"
if ! flock -n 9; then
  exit 0
fi

if curl -fsS --max-time "$TIMEOUT" "$URL" >/dev/null 2>&1; then
  exit 0
fi

# One retry before restart (avoids flapping on brief blips)
sleep 3
if curl -fsS --max-time "$TIMEOUT" "$URL" >/dev/null 2>&1; then
  exit 0
fi

logger -t site-watch "HTTPS health check failed for $URL — restarting coolify-proxy"
if ! docker restart coolify-proxy >/dev/null 2>&1; then
  logger -t site-watch "FAILED to restart coolify-proxy"
  exit 1
fi

sleep 8
if curl -fsS --max-time "$TIMEOUT" "$URL" >/dev/null 2>&1; then
  logger -t site-watch "coolify-proxy restarted OK — $URL healthy"
else
  logger -t site-watch "coolify-proxy restarted but $URL still unhealthy"
  exit 1
fi
