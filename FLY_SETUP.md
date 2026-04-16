# Setup Fly.io — Backend 201Bet

Este guia configura o backend no Fly.io (staging e produção) com deploy automático via GitHub Actions.

## 1) Pré‑requisitos

- Conta no Fly.io
- Fly CLI instalada
- Repositório com os arquivos:
  - `apps/backend/fly.toml`
  - `apps/backend/Dockerfile.fly`
  - Workflows em `.github/workflows/`

Instalar Fly CLI (macOS):
```bash
brew install flyctl
```

Login:
```bash
flyctl auth login
```

---

## 2) Criar os apps no Fly

### Staging
```bash
flyctl launch --no-deploy --name 201bet-backend-staging --region gru --config apps/backend/fly.toml
```

### Produção
```bash
flyctl launch --no-deploy --name 201bet-backend-prod --region gru --config apps/backend/fly.toml
```

---

## 3) Configurar secrets no Fly

### Staging
```bash
flyctl secrets set \
  DATABASE_URL="<NEONDB_STAGING_URL>" \
  JWT_SECRET="<JWT_SECRET>" \
  JWT_EXPIRES_IN="8h" \
  CORS_ORIGIN="https://<staging-frontend>.vercel.app" \
  UPSTASH_REDIS_REST_URL="<UPSTASH_URL>" \
  UPSTASH_REDIS_REST_TOKEN="<UPSTASH_TOKEN>" \
  --app 201bet-backend-staging
```

### Produção
```bash
flyctl secrets set \
  DATABASE_URL="<NEONDB_PROD_URL>" \
  JWT_SECRET="<JWT_SECRET>" \
  JWT_EXPIRES_IN="8h" \
  CORS_ORIGIN="https://<frontend>.vercel.app" \
  UPSTASH_REDIS_REST_URL="<UPSTASH_URL>" \
  UPSTASH_REDIS_REST_TOKEN="<UPSTASH_TOKEN>" \
  --app 201bet-backend-prod
```

Observações:
- Adicione `GOOGLE_CLIENT_ID` se usar login Google.
- Ajuste `MARKET_MARGIN_PERCENT`, `BOOKING_LOCK_PERCENT`, `HOUSE_EXPOSURE_BUFFER` conforme necessidade.

---

## 4) Configurar secrets no GitHub (CI/CD)

Em **Settings → Secrets and variables → Actions**:

- `FLY_API_TOKEN_STAGING`
- `FLY_API_TOKEN_PROD`
- `FLY_APP_NAME_STAGING` = `201bet-backend-staging`
- `FLY_APP_NAME_PROD` = `201bet-backend-prod`
- `BACKEND_STAGING_HEALTH_URL` = `https://<staging-backend>/api/health`
- `BACKEND_PROD_HEALTH_URL` = `https://<prod-backend>/api/health`

Também manter:
- `DATABASE_URL_STAGING`
- `DATABASE_URL_PROD`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

---

## 5) Primeiro deploy manual

### Staging
```bash
flyctl deploy --config apps/backend/fly.toml --app 201bet-backend-staging
```

### Produção
```bash
flyctl deploy --config apps/backend/fly.toml --app 201bet-backend-prod
```

---

## 6) Escalar durante evento (manual)

### Subir instâncias
```bash
flyctl scale count 2 --app 201bet-backend-prod
```

### Voltar para 1
```bash
flyctl scale count 1 --app 201bet-backend-prod
```

---

## 7) Observabilidade rápida

```bash
flyctl status --app 201bet-backend-prod
flyctl logs --app 201bet-backend-prod
```

---

## 8) Rollback manual (se necessário)

```bash
flyctl releases --app 201bet-backend-prod
flyctl releases rollback -a 201bet-backend-prod
```
