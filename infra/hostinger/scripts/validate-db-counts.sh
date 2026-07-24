#!/usr/bin/env bash
# Contagens de sanidade pós-restore (Neon vs VPS ou só alvo).
#
# Uso:
#   # Só alvo (VPS):
#   TARGET_DATABASE_URL='postgresql://...' ./infra/hostinger/scripts/validate-db-counts.sh
#
#   # Comparar Neon × VPS:
#   NEON_DATABASE_URL='...' TARGET_DATABASE_URL='...' ./infra/hostinger/scripts/validate-db-counts.sh
#
#   # Via docker compose (serviço postgres):
#   ./infra/hostinger/scripts/validate-db-counts.sh --via-docker
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
VIA_DOCKER=0
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"

for arg in "$@"; do
  case "$arg" in
    --via-docker) VIA_DOCKER=1 ;;
  esac
done

SQL=$(cat <<'SQL'
SELECT 'User' AS entity, COUNT(*)::bigint AS n FROM "User"
UNION ALL SELECT 'Wallet', COUNT(*) FROM "Wallet"
UNION ALL SELECT 'WalletTransaction', COUNT(*) FROM "WalletTransaction"
UNION ALL SELECT 'Event', COUNT(*) FROM "Event"
UNION ALL SELECT 'Bet', COUNT(*) FROM "Bet"
UNION ALL SELECT 'Market', COUNT(*) FROM "Market"
UNION ALL SELECT 'Duel', COUNT(*) FROM "Duel"
ORDER BY 1;
SQL
)

run_psql() {
  local url="$1"
  local label="$2"
  echo "--- ${label} ---"
  psql "$url" -v ON_ERROR_STOP=1 -c "$SQL"
}

run_docker() {
  echo "--- VPS postgres (docker) ---"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "${POSTGRES_USER:-betuser}" -d "${POSTGRES_DB:-betdb}" -v ON_ERROR_STOP=1 -c "$SQL"
}

if [[ "$VIA_DOCKER" -eq 1 ]]; then
  run_docker
else
  if [[ -n "${NEON_DATABASE_URL:-}" ]]; then
    run_psql "$NEON_DATABASE_URL" "Neon (origem)"
  fi
  if [[ -z "${TARGET_DATABASE_URL:-}" ]]; then
    echo "Erro: defina TARGET_DATABASE_URL ou use --via-docker." >&2
    exit 1
  fi
  run_psql "$TARGET_DATABASE_URL" "VPS (alvo)"
fi

echo
echo "Smoke HTTP (opcional):"
echo "  curl -fsS \"\${PUBLIC_URL:-https://seudominio.com}/api/health\""
