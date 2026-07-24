# Hostinger VPS + Coolify — provisionamento (201Bet)

Guia da Fase 0 do plano de migração. Execute isto **no painel Hostinger** antes do primeiro deploy.

## 1) Criar a VPS

1. Hostinger → VPS → criar instância.
2. Em **Choose what to install** → aba **Control panel** → **Coolify**.
3. Plano mínimo: **4 GB RAM / 2 vCPU**. Produção com builds Docker na VPS: **8 GB**.
4. Região mais próxima dos usuários (ex.: Brasil / EUA Leste).
5. Guarde: IP público, senha/root ou chave SSH.

## 2) Firewall

No painel Hostinger (ou `ufw` via SSH), libere só:

| Porta | Uso |
|-------|-----|
| 22 | SSH |
| 80 | HTTP (Let’s Encrypt + redirect) |
| 443 | HTTPS |
| 8000 | UI Coolify (ou o que a imagem Coolify Hostinger indicar) — restrinja por IP se possível |

Não exponha `5432` (Postgres) nem `6379` (Redis).

```bash
# Se usar ufw na VPS:
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8000/tcp
sudo ufw enable
```

## 3) Primeiro acesso Coolify

1. Abra `http://<IP>:8000` (ou URL que a Hostinger mostrar).
2. Crie o usuário admin da Coolify.
3. Em **Settings → Configuration**, confirme que o proxy (Traefik) está ativo.
4. (Opcional) Domínio do painel Coolify, ex.: `coolify.seudominio.com` → SSL.

## 4) Conectar o repositório

1. Coolify → **Sources** → GitHub (App ou Deploy Key).
2. **New Resource** → **Docker Compose**.
3. Selecione o repo `201bet`.
4. Compose file: `docker-compose.prod.yml` (raiz do monorepo).
5. Branch: `main` (prod) ou `development` (staging).

## 5) Domínios

Aponte DNS (TTL baixo, ex. 300s) para o IP da VPS:

| Host | Tipo | Valor |
|------|------|--------|
| `seudominio.com` | A | IP VPS |
| `www.seudominio.com` | A ou CNAME | IP / apex |
| `admin.seudominio.com` | A | IP VPS |

Na Coolify, anexe esses hosts ao serviço **`nginx`** (entrada única do compose). SSL automático (Let’s Encrypt).

## 6) Variáveis de ambiente

Copie de [`.env.production.example`](../../.env.production.example) para o Environment da Coolify (ou ficheiro `.env` do recurso).

Obrigatórias no cutover:

- `POSTGRES_PASSWORD`, `JWT_SECRET` (≥32 chars)
- `CORS_ORIGIN`, `FRONTEND_URL`
- `NEXT_PUBLIC_*` (usadas no **build** do frontend)
- `AUTH_COOKIE_SAMESITE=lax`
- `AUTH_COOKIE_DOMAIN=.seudominio.com` (com o ponto inicial)

### Pre-deploy (backend)

No serviço backend da Coolify, configure **Pre-deploy Command**:

```text
npx prisma migrate deploy --schema prisma/schema.prisma
```

Assim as migrações Prisma correm na rede interna (Postgres não precisa ficar público).

## 7) Deploy inicial (só infra)

Antes de migrar dados do Neon:

1. Suba a stack (Coolify Deploy).
2. Confirme volumes `postgres_data` e `redis_data`.
3. Só depois rode [`scripts/migrate-from-neon.sh`](scripts/migrate-from-neon.sh).

## 8) Webhook de deploy (CI)

Em Coolify → recurso → **Webhooks** → copiar URL de Deploy.

Secrets no GitHub:

- `COOLIFY_WEBHOOK_PROD`
- `COOLIFY_WEBHOOK_STAGING` (se houver segundo recurso)
- `DATABASE_URL_PROD` / `DATABASE_URL_STAGING` (para `prisma migrate deploy` no Actions)
- `BACKEND_PROD_HEALTH_URL` = `https://seudominio.com/api/health`

## Checklist rápido

- [ ] Coolify acessível
- [ ] Firewall só 22/80/443 (+ painel)
- [ ] Repo ligado + `docker-compose.prod.yml`
- [ ] Domínios A apontando para a VPS
- [ ] Env preenchido (sem Upstash obrigatório)
- [ ] Webhook no GitHub Secrets
