# Cutover DNS — Neon/Vercel/Render → Hostinger VPS

Checklist da Fase 3. Não faça cutover sem smoke em domínio de teste.

## Pré-requisitos

- [ ] Coolify + stack `docker-compose.yml` saudável ([VPS_SETUP.md](VPS_SETUP.md))
- [ ] Restore do Neon feito ([scripts/migrate-from-neon.sh](scripts/migrate-from-neon.sh))
- [ ] Contagens OK ([scripts/validate-db-counts.sh](scripts/validate-db-counts.sh))
- [ ] Env de produção preenchido (ver [`.env.production.example`](../../.env.production.example))
- [ ] TTL DNS baixado (300s) com antecedência

## Variáveis no cutover (mesmo domínio raiz)

| Variável | Valor exemplo |
|----------|----------------|
| `CORS_ORIGIN` | `https://palpite201.com,https://www.palpite201.com,https://admin.palpite201.com` |
| `FRONTEND_URL` | `https://palpite201.com` |
| `NEXT_PUBLIC_API_URL` | `https://palpite201.com/api` |
| `NEXT_PUBLIC_WS_URL` | `https://palpite201.com/realtime` |
| `AUTH_COOKIE_SAMESITE` | `lax` |
| `AUTH_COOKIE_DOMAIN` | `.palpite201.com` |
| `UPSTASH_*` | vazio |

Rebuild do **frontend** é obrigatório se mudar qualquer `NEXT_PUBLIC_*`.

## Janela de manutenção

1. **Congelar writes** (manutenção no site / freeze deploys Render+Vercel).
2. Dump final do Neon:
   ```bash
   export NEON_DATABASE_URL='...'
   export POSTGRES_PASSWORD='...'   # da VPS
   ./infra/hostinger/scripts/migrate-from-neon.sh --via-docker
   ```
3. Validar contagens e `prisma migrate deploy` (já no script).
4. Apontar registros A do apex, `www` e `admin` para o IP da VPS.
5. Na Coolify, confirmar SSL nos três hosts → serviço `nginx`.
6. Smoke:
   ```bash
   PUBLIC_URL=https://palpite201.com ./infra/hostinger/scripts/smoke-test.sh
   ```
7. Manual: login, cookie, WebSocket de odds, admin, filas (ex.: e-mail / settlement).

## Desligar legado

| Serviço | Ação |
|---------|------|
| Vercel | Desativar auto-deploy / pausar projeto |
| Render | Suspender Web Service |
| Upstash | Cancelar após 24–48h estáveis |
| Neon | Manter ~14 dias só como **backup frio** (sem writes da app); depois arquivar/apagar |

**Não** configure Neon ou Upstash como load balancer da VPS.

## Rollback rápido

1. Reapontar DNS para Vercel (front) + Render (API), ou IPs anteriores.
2. Reativar serviços cloud.
3. Dados escritos **só na VPS** durante a janela precisam de dump da VPS → Neon se for reverter o DB (avaliar caso a caso).

## Pós-cutover

- [ ] Webhook Coolify nos GitHub Actions (`COOLIFY_WEBHOOK_PROD`)
- [ ] Profile `backup` ligado: `docker compose -f docker-compose.yml --profile backup up -d`
- [ ] Copiar dumps de `/backups` offsite (S3/Backblaze/rclone) — ver [scripts/rclone-offsite.example.sh](scripts/rclone-offsite.example.sh)
