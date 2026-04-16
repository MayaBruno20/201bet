# Setup — 201Bet (Neon + Upstash + Vercel + backend em Render + CI/CD)

Guia do zero ao deploy: contas, Terraform (IaC) e GitHub Actions.

---

## 1) Contas e tokens

- **Neon:** https://neon.tech — API Key → `neon_api_key` no Terraform.
- **Upstash:** https://upstash.com — API Key + email → `upstash_api_key`, `upstash_email`.
- **Vercel:** token, org id, project id (secrets do GitHub Actions, não geridos pelo Terraform deste repo).
- **GitHub:** PAT com `repo` (e o necessário para secrets) → `github_token`, `github_owner`, `github_repo`.
- **Backend:** hospede a API (ex.: **Render**) com `infra/backend.Dockerfile`; anote a URL base HTTPS (sem `/api`).

---

## 2) Terraform

```bash
cp infra/terraform/envs/staging/terraform.tfvars.example infra/terraform/envs/staging/terraform.tfvars
# edite: neon, upstash, vercel, github, jwt_secret, cors_origin, backend_public_url, etc.

cd infra/terraform/envs/staging
terraform init && terraform plan && terraform apply
```

Repita com `envs/production`.

Variáveis importantes:

- `backend_public_url` — URL do backend (ex.: `https://xxx.onrender.com`), **sem** `/api`, se `enable_render_web_service = false`.
- `enable_render_web_service = true` — cria o Web Service via Terraform; antes do `apply`, exporte `RENDER_API_KEY` e `RENDER_OWNER_ID` (Dashboard Render).

Com `enable_github_secrets = true`, o Terraform grava secrets como `DATABASE_URL_*`, `UPSTASH_*`, `JWT_SECRET_*`, `CORS_ORIGIN_*`, `BACKEND_HTTP_ORIGIN_*` (e opcionalmente Render se preencher `render_api_key` / `render_owner_id` no tfvars).

Configure à mão no GitHub: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`; opcional `BACKEND_STAGING_HEALTH_URL` / `BACKEND_PROD_HEALTH_URL` (ex.: `https://seu-backend/api/health`).

---

## 3) CI/CD

- Push em `development` → staging (Vercel preview + migrações Prisma).
- Push em `main` → produção (Vercel prod + migrações).

O deploy do **backend** não é feito por estes workflows (use deploy automático do Render ligado ao Git ou outro pipeline).

---

## 4) Verificação

```bash
curl https://<seu-backend>/api/health
```
