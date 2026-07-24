#!/usr/bin/env bash
# Migra Neon (ou qualquer Postgres origem) → Postgres da VPS.
#
# Uso:
#   export NEON_DATABASE_URL='postgresql://...@ep-xxx.neon.tech/betdb?sslmode=require'
#   export TARGET_DATABASE_URL='postgresql://betuser:PASS@127.0.0.1:5432/betdb?schema=public'
#   # Se o Postgres da VPS só está na rede Docker:
#   #   docker compose -f docker-compose.yml exec -T postgres \
#   #     pg_restore ...  (ver modo --via-docker abaixo)
#
#   ./infra/hostinger/scripts/migrate-from-neon.sh
#   ./infra/hostinger/scripts/migrate-from-neon.sh --via-docker
#
# Depois:
#   DATABASE_URL="$TARGET_DATABASE_URL" npx --prefix apps/backend prisma migrate deploy
#   ./infra/hostinger/scripts/validate-db-counts.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
DUMP_DIR="${DUMP_DIR:-$ROOT_DIR/infra/hostinger/.dumps}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="${DUMP_DIR}/neon_${STAMP}.dump"
VIA_DOCKER=0

for arg in "$@"; do
  case "$arg" in
    --via-docker) VIA_DOCKER=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
  esac
done

if [[ -z "${NEON_DATABASE_URL:-}" ]]; then
  echo "Erro: defina NEON_DATABASE_URL (connection string do Neon)." >&2
  exit 1
fi

if [[ -z "${TARGET_DATABASE_URL:-}" && "$VIA_DOCKER" -eq 0 ]]; then
  echo "Erro: defina TARGET_DATABASE_URL ou use --via-docker." >&2
  exit 1
fi

mkdir -p "$DUMP_DIR"

echo "==> [1/3] pg_dump do Neon → ${DUMP_FILE}"
pg_dump \
  --dbname="$NEON_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$DUMP_FILE"

echo "==> [2/3] pg_restore no alvo"
if [[ "$VIA_DOCKER" -eq 1 ]]; then
  COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
  SERVICE="${POSTGRES_SERVICE:-postgres}"
  # Copia dump para o container e restaura (banco deve existir e estar vazio ou --clean).
  docker compose -f "$COMPOSE_FILE" cp "$DUMP_FILE" "${SERVICE}:/tmp/restore.dump"
  docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE" \
    pg_restore \
      --username="${POSTGRES_USER:-betuser}" \
      --dbname="${POSTGRES_DB:-betdb}" \
      --no-owner \
      --no-acl \
      --clean \
      --if-exists \
      /tmp/restore.dump || true
  # pg_restore retorna 1 com avisos de objetos; validamos depois.
  docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE" rm -f /tmp/restore.dump
else
  pg_restore \
    --dbname="$TARGET_DATABASE_URL" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    "$DUMP_FILE" || true
fi

echo "==> [3/3] prisma migrate deploy"
if [[ "$VIA_DOCKER" -eq 1 ]]; then
  # URL interna vista pelo container backend
  MIGRATE_URL="${MIGRATE_DATABASE_URL:-postgresql://${POSTGRES_USER:-betuser}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-betdb}?schema=public}"
  docker compose -f "${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}" run --rm --no-deps \
    -e DATABASE_URL="$MIGRATE_URL" \
    backend \
    npx prisma migrate deploy --schema prisma/schema.prisma
else
  DATABASE_URL="${TARGET_DATABASE_URL}" \
    npx --prefix "$ROOT_DIR/apps/backend" prisma migrate deploy --schema "$ROOT_DIR/apps/backend/prisma/schema.prisma"
fi

echo "Dump guardado em: $DUMP_FILE"
echo "Próximo: ./infra/hostinger/scripts/validate-db-counts.sh"
