# 201Bet - Guia de execução local (passo a passo)

Este guia é para qualquer novo programador subir o projeto local sem dor de cabeça.

## 1) Pré-requisitos

Instale antes:

- Node.js 22.x
- npm 10+
- Docker + Docker Compose plugin
- `ripgrep` (`rg`) opcional (para busca rápida)

Verifique:

```bash
node -v
npm -v
docker --version
docker compose version
```

## 2) Instalação de ferramentas (máquina nova)

Ubuntu/Debian (exemplo):

1. Instalar Node.js 22 + npm:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. Instalar Docker + Compose plugin:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

3. (Opcional) Instalar `rg`:

```bash
sudo apt-get install -y ripgrep
```

## 3) Portas padrão do projeto

- Frontend: `3501`
- Backend: `3502`
- Nginx: `3503`
- Postgres: `3504`
- Redis: `3505`

Se alguma porta já estiver em uso, veja a seção **Problemas comuns**.

## 4) Clonar e instalar dependências

```bash
git clone <URL_DO_REPO>
cd 201Bet
npm install
npm --prefix apps/backend install
npm --prefix apps/frontend install
```

Validação importante (evita erro `prisma: not found`):

```bash
npx --prefix apps/backend prisma -v
```

## 5) Subir banco e cache (infra)

```bash
npm run infra:up
```

Isso sobe apenas:

- `bet-postgres`
- `bet-redis`

## 6) Preparar banco (schema + seed)

### 5.1 Gerar Prisma Client

```bash
npm run db:generate
```

### 5.2 Aplicar schema

Primeira vez/máquina nova:

```bash
npm run db:push
```

Se o Prisma reclamar de colunas obrigatórias em banco já populado, faça reset local:

```bash
DATABASE_URL='postgresql://betuser:betpass@localhost:3504/betdb?schema=public' \
npx --prefix apps/backend prisma db push --force-reset --skip-generate --schema apps/backend/prisma/schema.prisma
```

### 5.3 Popular dados iniciais

```bash
npm run db:seed
```

## 7) Rodar em modo desenvolvimento (local)

```bash
npm run dev
```

Acessos:

- Front: `http://localhost:3501`
- API health: `http://localhost:3502/api/health`
- Nginx (quando estiver ligado): `http://localhost:3503`

## 8) Credenciais seed

- Admin: `admin@201bet.local` / `Admin@201Bet123`
- Usuário: `user@201bet.local` / `User@201Bet123`

## 9) Rodar stack completa em Docker (apps + infra)

Quando quiser subir tudo containerizado:

```bash
docker compose --profile apps up -d --build
```

Serviços do profile `apps`:

- `bet-backend`
- `bet-frontend`
- `bet-nginx`

Infra (`postgres`, `redis`) sobe junto via compose.

## 10) Fluxo recomendado para dia a dia

1. Subir infra:

```bash
npm run infra:up
```

2. Garantir schema:

```bash
npm run db:push
```

3. Rodar apps locais:

```bash
npm run dev
```

4. Ao final:

```bash
npm run infra:down
```

## 11) Problemas comuns (e solução)

### 10.1 `EADDRINUSE` (porta em uso)

Exemplo: backend na `3502` ou frontend na `3501`.

Ver quem está usando:

```bash
ss -ltnp | rg '3501|3502|3503|3504|3505'
```

Matar processo da porta (Linux):

```bash
sudo fuser -k 3502/tcp
```

### 10.2 Docker: `permission denied` ao parar/remover container

Tente limpar containers do projeto:

```bash
docker ps -a --format '{{.ID}} {{.Names}}' | rg 'bet-' | awk '{print $1}' | xargs -r docker rm -f
```

Se persistir, reinicie daemon Docker:

```bash
sudo systemctl restart docker
```

### 10.3 Docker: `address already in use` ao bindar porta

Exemplo `3504` (Postgres) ou `3502` (backend).

- descubra e pare quem ocupa a porta:

```bash
ss -ltnp | rg 3504
```

- ou mude a porta no momento de subir:

```bash
POSTGRES_PORT=4504 docker compose --profile apps up -d --build
```

### 11.4 Prisma: `prisma: not found`

Causa mais comum: dependências do `apps/backend` não foram instaladas na máquina nova.

Corrija com:

```bash
npm --prefix apps/backend install
npx --prefix apps/backend prisma -v
npm run db:generate
```

Se ainda falhar, execute sem cache:

```bash
rm -rf apps/backend/node_modules apps/backend/package-lock.json
npm --prefix apps/backend install
npm run db:generate
```

### 11.5 Prisma: “Could not find Prisma Schema”

Use o schema explícito:

```bash
npx --prefix apps/backend prisma db push --schema apps/backend/prisma/schema.prisma
```

### 11.6 Next/Turbopack inferindo root errado

Se aparecer warning de múltiplos lockfiles, confirme que você está executando comandos na raiz do projeto `201Bet` e mantenha apenas os lockfiles necessários.

## 12) Variáveis de ambiente importantes

### Backend

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CORS_ORIGIN`
- `GOOGLE_CLIENT_ID` (opcional)

### Frontend

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (opcional)

## 13) Google Login (opcional)

No `.env`:

```env
GOOGLE_CLIENT_ID=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
```

No Google Cloud Console, configure origem autorizada:

- `http://localhost:3501`

## 14) Rotas principais

- `/` Home
- `/login` Login/Cadastro
- `/apostas` Apostas por evento/etapa com cotações dinâmicas
- `/eventos` Catálogo de eventos
- `/carteira` Conta, saldo, histórico, transações
- `/admin` Painel administrativo

## 15) Comandos úteis

```bash
npm run infra:up        # sobe postgres e redis
npm run infra:down      # para postgres e redis
npm run infra:logs      # logs de postgres e redis
npm run dev             # backend + frontend local
npm run build           # build completo
npm run db:generate     # prisma generate
npm run db:push         # aplica schema
npm run db:seed         # dados iniciais
```
