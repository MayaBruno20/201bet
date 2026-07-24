#!/usr/bin/env bash
# Smoke tests pós-cutover (HTTP).
# Uso: PUBLIC_URL=https://palpite201.com ./infra/hostinger/scripts/smoke-test.sh
set -euo pipefail

BASE="${PUBLIC_URL:?Defina PUBLIC_URL (ex. https://palpite201.com)}"
BASE="${BASE%/}"

echo "==> GET ${BASE}/api/health"
curl -fsS --retry 5 --retry-delay 3 "${BASE}/api/health"
echo

echo "==> GET ${BASE}/ (frontend)"
code="$(curl -sS -o /dev/null -w '%{http_code}' --retry 3 "${BASE}/")"
if [[ "$code" != "200" && "$code" != "307" && "$code" != "308" ]]; then
  echo "Frontend retornou HTTP ${code}" >&2
  exit 1
fi
echo "frontend HTTP ${code}"

echo "==> nginx-health (se exposto atrás do proxy)"
curl -fsS "${BASE}/nginx-health" || echo "(skip nginx-health — normal se Coolify não encaminhar esse path)"

echo "OK smoke básico."
echo "Manual: login, WebSocket odds, admin em https://admin.<dominio>, uma aposta de teste."
