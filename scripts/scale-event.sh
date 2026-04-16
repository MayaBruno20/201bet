#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Uso:
  scripts/scale-event.sh --app <fly-app> --count <n>
  scripts/scale-event.sh --app <fly-app> --up
  scripts/scale-event.sh --app <fly-app> --down

Flags:
  --app     Nome do app no Fly (ex: 201bet-backend-prod)
  --count   Número exato de instâncias
  --up      Sobe para 2 instâncias (padrão evento)
  --down    Volta para 1 instância (padrão pós-evento)

Exemplos:
  scripts/scale-event.sh --app 201bet-backend-prod --up
  scripts/scale-event.sh --app 201bet-backend-prod --count 3
  scripts/scale-event.sh --app 201bet-backend-prod --down
USAGE
}

APP=""
COUNT=""
MODE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      APP="$2"; shift 2;;
    --count)
      COUNT="$2"; MODE="count"; shift 2;;
    --up)
      MODE="up"; shift;;
    --down)
      MODE="down"; shift;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Argumento inválido: $1"; usage; exit 1;;
  esac
done

if [[ -z "$APP" ]]; then
  echo "Erro: --app é obrigatório"; usage; exit 1
fi

if [[ -z "$MODE" ]]; then
  echo "Erro: escolha --count, --up ou --down"; usage; exit 1
fi

case "$MODE" in
  up)
    COUNT=2;;
  down)
    COUNT=1;;
  count)
    if [[ -z "$COUNT" ]]; then
      echo "Erro: --count requer um número"; exit 1
    fi;;
  *)
    echo "Modo inválido"; exit 1;;
 esac

if ! command -v flyctl >/dev/null 2>&1; then
  echo "Erro: flyctl não encontrado. Instale com 'brew install flyctl'"; exit 1
fi

if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  echo "Erro: --count precisa ser um número inteiro"; exit 1
fi

if [[ "$COUNT" -lt 0 ]]; then
  echo "Erro: --count não pode ser negativo"; exit 1
fi

echo "Scaling app '$APP' para $COUNT instância(s)..."
flyctl scale count "$COUNT" --app "$APP"

echo "Status atual:"
flyctl status --app "$APP"
