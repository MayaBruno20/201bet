# Setup Completo — 201Bet (NeonDB + Upstash + Vercel + Fly.io + CI/CD)

Este guia cobre **do zero ao deploy final** (staging e produção), incluindo criação de contas, variáveis, IaC (Terraform) e CI/CD.

---

## 1) Criar contas e pegar tokens

### NeonDB
1. Crie conta: https://neon.tech
2. Gere API Key (Dashboard → API Keys)
3. Guarde: `NEON_API_KEY`

### Upstash
1. Crie conta: https://upstash.com
2. Gere API Key (Upstash Console → Account → API Keys)
3. Guarde: `UPSTASH_API_KEY`

### Fly.io
1. Crie conta: https://fly.io
2. Gere token: `flyctl auth token`
3. Guarde: `FLY_API_TOKEN`

### Vercel
1. Crie conta: https://vercel.com
2. Gere token (Account Settings → Tokens)
3. Guarde: `VERCEL_TOKEN`

### GitHub
1. Crie um token (Settings → Developer settings → Personal access tokens)
2. Permissões mínimas: `repo`, `admin:repo_hook`, `write:packages`, `read:org`
3. Guarde: `GITHUB_TOKEN`

---

## 2) Configurar IaC (Terraform)

### 2.1) Pré‑requisitos
- Terraform >= 1.6
- Fly CLI instalado

### 2.2) Preencher variáveis do Terraform

**Staging**
```bash
cp infra/terraform/envs/staging/terraform.tfvars.example infra/terraform/envs/staging/terraform.tfvars
```
Edite `infra/terraform/envs/staging/terraform.tfvars` e preencha:
- `neon_api_key`
- `upstash_api_key`
- `fly_api_token`
- `vercel_api_token`
- `github_token`
- `github_owner`
- `github_repo`
- `jwt_secret`
- `cors_origin` (URL do front staging)
- `vercel_project_name`
- `fly_app_name`

**Produção**
```bash
cp infra/terraform/envs/production/terraform.tfvars.example infra/terraform/envs/production/terraform.tfvars
```
Edite `infra/terraform/envs/production/terraform.tfvars` e preencha os mesmos campos.

### 2.3) Aplicar Terraform

**Staging**
```bash
cd infra/terraform/envs/staging
terraform init
terraform plan
terraform apply
```

**Produção**
```bash
cd infra/terraform/envs/production
terraform init
terraform plan
terraform apply
```

---

## 3) Criar apps no Fly.io

**Staging**
```bash
flyctl launch --no-deploy --name 201bet-backend-staging --region gru --config apps/backend/fly.toml
```

**Produção**
```bash
flyctl launch --no-deploy --name 201bet-backend-prod --region gru --config apps/backend/fly.toml
```

---

## 4) Configurar secrets no Fly.io

**Staging**
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

**Produção**
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

---

## 5) Configurar secrets no GitHub (CI/CD)

Com **`terraform apply`** em `envs/staging` e `envs/production` (e `enable_github_secrets = true`), o Terraform grava no repositório:

- `FLY_API_TOKEN_STAGING` / `FLY_API_TOKEN_PROD`
- `FLY_APP_NAME_STAGING` / `FLY_APP_NAME_PROD`
- `DATABASE_URL_STAGING` / `DATABASE_URL_PROD` (URI do Neon do módulo)
- `UPSTASH_REDIS_REST_URL_STAGING` / `_PROD` e `UPSTASH_REDIS_REST_TOKEN_STAGING` / `_PROD`
- `JWT_SECRET_STAGING` / `JWT_SECRET_PROD`
- `CORS_ORIGIN_STAGING` / `CORS_ORIGIN_PROD`

Ainda é preciso configurar **à mão** em **Settings → Secrets and variables → Actions** (não geridos pelo Terraform deste repo):

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- `BACKEND_STAGING_HEALTH_URL` / `BACKEND_PROD_HEALTH_URL` (opcional, para health + rollback no workflow)

Para os **Fly secrets** (secção 4), podes reutilizar os valores dos repository secrets acima (mesmos `DATABASE_URL`, `JWT_SECRET`, Upstash, `CORS_ORIGIN`).

---

## 6) Deploy inicial

**Staging**
```bash
flyctl deploy --config apps/backend/fly.toml --app 201bet-backend-staging
```

**Produção**
```bash
flyctl deploy --config apps/backend/fly.toml --app 201bet-backend-prod
```

---

## 7) CI/CD

- Qualquer push em `development` → deploy automático para staging.
- Qualquer push em `main` → deploy automático para produção.
- Health check + rollback automático no Fly se falhar.

---

## 8) Escalar durante evento

```bash
scripts/scale-event.sh --app 201bet-backend-prod --up
scripts/scale-event.sh --app 201bet-backend-prod --count 3
scripts/scale-event.sh --app 201bet-backend-prod --down
```

---

## 9) Verificação rápida

**Backend**
```bash
curl https://<backend>/api/health
```

**Logs**
```bash
flyctl logs --app 201bet-backend-prod
```

---

## 10) Rollback manual

```bash
flyctl releases --app 201bet-backend-prod
flyctl releases rollback -a 201bet-backend-prod
```
