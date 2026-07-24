# Setup — 201Bet em Hostinger VPS (Coolify)

Deploy alvo: **Ubuntu + Coolify + Docker Compose** na VPS. Neon/Upstash/Vercel/Render ficam só para migração/legado.

## Ordem recomendada

1. Provisionar VPS + Coolify → [`infra/hostinger/VPS_SETUP.md`](infra/hostinger/VPS_SETUP.md)
2. Env → copiar [`.env.production.example`](.env.production.example) para a Coolify
3. Deploy do [`docker-compose.prod.yml`](docker-compose.prod.yml)
4. Migrar dados Neon → VPS → [`infra/hostinger/scripts/migrate-from-neon.sh`](infra/hostinger/scripts/migrate-from-neon.sh)
5. Cutover DNS → [`infra/hostinger/CUTOVER.md`](infra/hostinger/CUTOVER.md)
6. Secrets GitHub + webhooks Coolify (abaixo)

## Secrets GitHub Actions

| Secret | Uso |
|--------|-----|
| `COOLIFY_WEBHOOK_PROD` | Deploy produção (`main`) |
| `COOLIFY_WEBHOOK_STAGING` | Deploy staging (`development`) |
| `BACKEND_PROD_HEALTH_URL` | Ex.: `https://seudominio.com/api/health` |
| `BACKEND_STAGING_HEALTH_URL` | Idem staging |
| `VPS_SSH_HOST` | Opcional — migrate via SSH |
| `VPS_SSH_USER` | Opcional |
| `VPS_SSH_KEY` | Opcional (chave privada) |
| `VPS_COMPOSE_DIR` | Pasta na VPS com o compose |

**Pre-deploy na Coolify (backend), recomendado:**

```text
npx prisma migrate deploy --schema prisma/schema.prisma
```

## Legado (Terraform cloud)

O caminho antigo (Neon + Upstash + Vercel + Render) permanece em [`infra/terraform`](infra/terraform) e no histórico do repo. Não use Neon/Upstash como load balancer da VPS — ver plano de migração.

## Verificação

```bash
PUBLIC_URL=https://seudominio.com ./infra/hostinger/scripts/smoke-test.sh
```
