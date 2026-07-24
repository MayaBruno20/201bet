#!/usr/bin/env bash
# Exemplo: copiar dumps locais do volume/pasta de backup para storage offsite (rclone).
# Configure um remote `bet-offsite` (S3, B2, etc.) e rode via cron na VPS host.
#
#   0 4 * * * /opt/201bet/infra/hostinger/scripts/rclone-offsite.example.sh
set -euo pipefail

SRC="${BACKUP_SRC:-/var/lib/docker/volumes/bet-prod_backups/_data}"
REMOTE="${RCLONE_REMOTE:-bet-offsite:201bet-postgres}"
LOG="${BACKUP_LOG:-/var/log/201bet-rclone-backup.log}"

{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) rclone sync ${SRC} → ${REMOTE}"
  rclone sync "$SRC" "$REMOTE" --checksum --exclude '.tmp/**'
  echo "OK"
} >>"$LOG" 2>&1
