#!/usr/bin/env sh
# Backup Postgres interno do compose → /backups
# Usado pelo serviço `backup` (profile) em docker-compose.yml
set -eu

HOST="${POSTGRES_HOST:-postgres}"
DB="${POSTGRES_DB:-betdb}"
USER="${POSTGRES_USER:-betuser}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="/backups"
OUT_FILE="${OUT_DIR}/${DB}_${STAMP}.dump"

mkdir -p "${OUT_DIR}"

echo "[backup] dumping ${DB}@${HOST} → ${OUT_FILE}"
pg_dump \
  --host="${HOST}" \
  --username="${USER}" \
  --dbname="${DB}" \
  --format=custom \
  --file="${OUT_FILE}"

echo "[backup] pruning dumps older than ${RETENTION_DAYS} days"
find "${OUT_DIR}" -type f -name "${DB}_*.dump" -mtime "+${RETENTION_DAYS}" -print -delete || true

ls -lh "${OUT_DIR}" | tail -n 20
echo "[backup] done ${STAMP}"
