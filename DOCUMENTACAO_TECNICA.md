# Documentação Técnica — 201Bet - Step 01

## 1) Escolha do banco de dados: NeonDB (PostgreSQL)

**Banco escolhido:** NeonDB (PostgreSQL serverless).

**Por que NeonDB:**
- **Compatibilidade total com PostgreSQL.** Mantém o ecossistema padrão (SQL, Prisma, drivers, tooling) e permite evolução sem lock-in de dialeto.
- **Serverless com auto‑scaling.** Escala de forma elástica e reduz custos em ambientes com picos de carga.
- **Branching de banco.** Possibilita criar “ambientes” de dados isolados para testes e validações sem afetar produção.
- **Alta disponibilidade.** Infra gerenciada reduz esforço operacional e risco de indisponibilidade.
- **Backups e recuperação.** Suporte nativo a restore e histórico de dados.

**Decisão técnica:** o projeto mantém o schema em Prisma e executa em qualquer PostgreSQL compatível. NeonDB é a recomendação para produção por custo, escalabilidade e operação simplificada.

---

## 2) Modelo de dados completo

**Padrões gerais**
- Chave primária em UUID.
- Datas de criação/atualização (`createdAt`, `updatedAt`).
- Tabelas sensíveis com índices para busca por status, data e relacionamentos.
- Ledger financeiro imutável (`WalletTransaction`).

**Enums**
- `UserRole`: `USER`, `ADMIN`, `OPERATOR`, `AUDITOR`
- `UserStatus`: `ACTIVE`, `SUSPENDED`, `BANNED`
- `EventStatus`: `SCHEDULED`, `LIVE`, `FINISHED`, `CANCELED`
- `MarketStatus`: `OPEN`, `SUSPENDED`, `CLOSED`, `SETTLED`
- `OddStatus`: `ACTIVE`, `SUSPENDED`, `CLOSED`
- `BetStatus`: `OPEN`, `WON`, `LOST`, `CANCELED`, `REFUNDED`
- `WalletTransactionType`: `DEPOSIT`, `WITHDRAW`, `BET_PLACED`, `BET_WON`, `BET_REFUND`, `BONUS`, `ADJUSTMENT`
- `PaymentType`: `DEPOSIT`, `WITHDRAW`
- `PaymentStatus`: `PENDING`, `APPROVED`, `FAILED`, `CANCELED`
- `BonusStatus`: `PENDING`, `ACTIVE`, `CONSUMED`, `CANCELED`, `EXPIRED`
- `DuelStatus`: `SCHEDULED`, `BOOKING_OPEN`, `BOOKING_CLOSED`, `FINISHED`, `CANCELED`

**Entidades principais**

### User
- Identificação: `id`, `email`, `cpf`.
- Segurança: `password`, `googleSub`.
- Perfil: `name`, `firstName`, `lastName`, `birthDate`, `phone`, `address`, etc.
- Controle: `role`, `status`, `emailVerified`.
- Relacionamentos:
  - `wallet` (1:1)
  - `bets`, `payments`, `bonuses` (1:N)
  - `auditLogs` (1:N como ator)
  - `settings` (1:N como autor de mudanças globais)

### Wallet
- `userId` único (1:1 com User).
- `balance` decimal, `currency`.
- `ledger` (1:N com WalletTransaction).

### WalletTransaction
- Livro razão (imutável).
- `type`, `amount`, `reference`.
- Indexado por `walletId` e `createdAt`.

### Event
- Evento de corrida/competição.
- `sport`, `name`, `startAt`, `status`.
- Relaciona com `markets` e `duels`.

### Driver / Car
- Pilotos e carros.
- Carro ligado a `driverId`.

### Duel
- Embate entre dois carros.
- `leftCarId`, `rightCarId`, `eventId`.
- `startsAt`, `bookingCloseAt`, `status`.

### Market / Odd
- Market representa a modalidade do evento (ex: “Passou na frente”).
- `Odd` guarda a cotação e versionamento.

### Bet / BetItem
- `Bet` é a aposta do usuário.
- `BetItem` associa cada aposta à odd no momento do placement.

### Payment
- Estrutura de pagamentos (depósito/saque) e status.

### Bonus
- Bônus com status e wagering.

### GlobalSetting
- Configurações globais (ex: percentuais de lock, margem de mercado).

### AuditLog
- Auditoria completa de ações administrativas.

**Fonte do schema:** `apps/backend/prisma/schema.prisma`

---

## 3) Migrations

**Ferramenta:** Prisma.

**Situação atual do projeto**
- O fluxo principal de desenvolvimento pode usar `prisma db push` para velocidade.
- Existe migração inicial versionada em `apps/backend/prisma/migrations/20260325_init`.

**Recomendação para produção**
- Migrar para `prisma migrate dev` (ambiente de dev) e `prisma migrate deploy` (produção), garantindo versionamento e histórico de alterações.
- Padrão recomendado:
  1. Criar migração: `npx --prefix apps/backend prisma migrate dev --name <nome>`
  2. Aplicar em produção: `npx --prefix apps/backend prisma migrate deploy`

**Scripts já existentes**
- `db:migrate`: `npm --prefix apps/backend run prisma:migrate`
- `db:push`: `npm --prefix apps/backend run prisma:push`

**Fonte:** `package.json`, `apps/backend/package.json`

---

## 4) Estrutura de usuários

**Roles**
- `USER`: usuário final
- `ADMIN`: administrador total
- `OPERATOR`: operador administrativo
- `AUDITOR`: acesso à auditoria

**Status**
- `ACTIVE`, `SUSPENDED`, `BANNED`

**Autenticação**
- Login padrão com e‑mail e senha (hash bcrypt).
- JWT com expiração configurável (`JWT_EXPIRES_IN`).
- Login com Google disponível se `GOOGLE_CLIENT_ID` estiver configurado.

**Autorização**
- Guard de roles ativo no módulo admin.
- Endpoints administrativos exigem `ADMIN` ou `OPERATOR`.
- Auditoria exige `ADMIN` ou `AUDITOR`.

**Perfil**
- Dados pessoais completos (nome, cpf, nascimento, endereço, etc.)
- `cpf` é único e validado.

**Fonte:** `apps/backend/prisma/schema.prisma`, `apps/backend/src/auth`, `apps/backend/src/common/guards/roles.guard.ts`

---

## 5) Cache: Upstash (Redis Serverless)

**Cache escolhido:** Upstash Redis (serverless).

**Por que Upstash:**
- **Serverless com auto‑scaling.** Ajusta capacidade conforme carga, sem gerenciamento de servidor.
- **Baixa latência global.** Ideal para respostas rápidas e sessões.
- **Integração simples.** Compatível com Redis padrão e SDKs leves.
- **Custos previsíveis.** Pay‑as‑you‑go com cobrança por uso real.

**Casos de uso recomendados no 201Bet:**
- **Rate limiting** por IP/usuário.
- **Cache de leitura** para catálogo de eventos e mercados.
- **Sessões rápidas** (se optar por sessão ao invés de JWT).
- **Dados temporários** (tokens, OTP, confirmações).

**Observação:** o projeto já utiliza Redis em `docker-compose.yml` para ambiente local. Em produção, vamos apontar para o endpoint do Upstash via variáveis de ambiente.
