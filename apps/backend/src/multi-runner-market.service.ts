import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MarketStatus, MarketType, OddStatus, Prisma, WalletTransactionType } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from './database/prisma.service';

type RunnerState = {
  oddId: string;
  label: string;
  pool: number;
  tickets: number;
  odd: number;
  locked: boolean;
};

type MultiRunnerEngineState = {
  marketId: string;
  marketType: MarketType;
  eventId: string;
  eventName: string;
  name: string;
  status: MarketStatus;
  rakePercent: number;
  bookingCloseAt: Date;
  runners: RunnerState[];
  history: Array<{
    at: string;
    odds: Record<string, number>;
    totalPool: number;
  }>;
};

export type MultiRunnerSnapshot = {
  marketId: string;
  marketType: string;
  eventId: string;
  eventName: string;
  marketName: string;
  status: string;
  totalPool: number;
  rakePercent: number;
  closeInSeconds: number;
  locked: boolean;
  lockMessage?: string;
  runners: Array<{
    oddId: string;
    label: string;
    odd: number;
    pool: number;
    tickets: number;
    locked: boolean;
    poolShare: number;
  }>;
  history: Array<{
    at: string;
    odds: Record<string, number>;
    totalPool: number;
  }>;
};

const TICK_MS = 3_000;
const REFRESH_FROM_DB_MS = 30_000;

@Injectable()
export class MultiRunnerMarketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MultiRunnerMarketService.name);
  private ticker?: NodeJS.Timeout;
  private refreshTicker?: NodeJS.Timeout;
  private states = new Map<string, MultiRunnerEngineState>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.safeRefreshStatesFromDatabase();

    this.ticker = setInterval(() => {
      this.tick();
    }, TICK_MS);

    this.refreshTicker = setInterval(() => {
      void this.safeRefreshStatesFromDatabase();
    }, REFRESH_FROM_DB_MS);
  }

  onModuleDestroy() {
    if (this.ticker) clearInterval(this.ticker);
    if (this.refreshTicker) clearInterval(this.refreshTicker);
  }

  getSnapshot(marketId: string): MultiRunnerSnapshot | null {
    const state = this.states.get(marketId);
    if (!state) return null;
    return this.toSnapshot(state);
  }

  getAllSnapshots(): MultiRunnerSnapshot[] {
    return [...this.states.values()].map((state) => this.toSnapshot(state));
  }

  removeMarket(marketId: string) {
    this.states.delete(marketId);
  }

  async placeBet(input: { userId: string; marketId: string; oddId: string; amount: number }) {
    const prof = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { cpf: true, birthDate: true },
    });
    if (!prof?.cpf || !prof?.birthDate) {
      throw new BadRequestException(
        'Conclua CPF e data de nascimento (Completar cadastro) antes de apostar.',
      );
    }

    const state = this.states.get(input.marketId);
    if (!state) {
      throw new NotFoundException('Mercado não encontrado');
    }

    if (state.status !== MarketStatus.OPEN) {
      throw new BadRequestException('Este mercado não está aberto para apostas');
    }

    if (Date.now() >= state.bookingCloseAt.getTime()) {
      throw new BadRequestException('O período de apostas deste mercado já encerrou');
    }

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Informe um valor de aposta válido');
    }

    const minBet = this.getMinBet();
    if (amount < minBet) {
      throw new BadRequestException(`A aposta mínima é de R$ ${minBet.toFixed(2).replace('.', ',')}`);
    }

    const runner = state.runners.find((r) => r.oddId === input.oddId);
    if (!runner) {
      throw new NotFoundException('Opção não encontrada neste mercado');
    }

    const oddAtPlacement = runner.odd;
    const amountDecimal = new Prisma.Decimal(amount.toFixed(4));
    const potentialWin = amountDecimal.mul(new Prisma.Decimal(oddAtPlacement.toFixed(4)));

    // Re-valida estado do mercado direto no DB (evita janela de 30s do refresh em memoria)
    const dbMarket = await this.prisma.market.findUnique({
      where: { id: input.marketId },
      select: { status: true, bookingCloseAt: true },
    });
    if (!dbMarket) {
      throw new NotFoundException('Mercado não encontrado');
    }
    if (dbMarket.status !== 'OPEN') {
      throw new BadRequestException('Este mercado não está aberto para apostas');
    }
    if (dbMarket.bookingCloseAt && Date.now() >= dbMarket.bookingCloseAt.getTime()) {
      throw new BadRequestException('O período de apostas deste mercado já encerrou');
    }

    // BUG-8: se nao tem bookingCloseAt configurado, bloqueia (mercado mal configurado)
    if (!dbMarket.bookingCloseAt) {
      throw new BadRequestException('Mercado sem data de encerramento configurada. Contate o admin.');
    }

    const placed = await this.prisma.$transaction(async (tx) => {
      // SELECT FOR UPDATE to prevent double-spend race condition
      const wallet = await tx.$queryRaw<Array<{ id: string; balance: Prisma.Decimal }>>`
        SELECT id, balance FROM "Wallet" WHERE "userId" = ${input.userId} FOR UPDATE
      `.then((rows) => rows[0] ?? null);
      if (!wallet) {
        throw new NotFoundException('Carteira do usuário não encontrada');
      }

      if (new Prisma.Decimal(String(wallet.balance)).lt(amountDecimal)) {
        throw new BadRequestException('Saldo insuficiente para realizar essa aposta');
      }

      const bet = await tx.bet.create({
        data: {
          userId: input.userId,
          stake: amountDecimal,
          potentialWin,
          status: 'OPEN',
          items: {
            create: {
              oddId: input.oddId,
              oddAtPlacement: new Prisma.Decimal(oddAtPlacement.toFixed(4)),
            },
          },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.BET_PLACED,
          amount: amountDecimal.neg(),
          reference: bet.id,
        },
      });

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amountDecimal } },
      });

      return {
        betId: bet.id,
        potentialWin: Number(potentialWin),
        newBalance: Number(updatedWallet.balance),
      };
    });

    // Update in-memory pool
    runner.pool += amount;
    runner.tickets += 1;
    this.recalculateOdds(state);
    this.captureHistory(state);

    return {
      snapshot: this.toSnapshot(state),
      bet: {
        id: placed.betId,
        oddId: input.oddId,
        stake: amount,
        oddAtPlacement,
        potentialWin: Number(placed.potentialWin.toFixed(2)),
      },
      wallet: {
        balance: Number(placed.newBalance.toFixed(2)),
      },
    };
  }

  // ── Engine internals ──

  private async refreshStatesFromDatabase() {
    const markets = await this.prisma.market.findMany({
      where: {
        type: { not: MarketType.DUEL },
        status: { in: [MarketStatus.OPEN, MarketStatus.SUSPENDED] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        event: true,
        odds: {
          where: { status: { in: [OddStatus.ACTIVE, OddStatus.SUSPENDED] } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const next = new Map<string, MultiRunnerEngineState>();

    for (const market of markets) {
      const existing = this.states.get(market.id);

      const runners: RunnerState[] = market.odds.map((odd) => {
        const existingRunner = existing?.runners.find((r) => r.oddId === odd.id);
        if (existingRunner) {
          return { ...existingRunner };
        }
        return {
          oddId: odd.id,
          label: odd.label,
          pool: 0,
          tickets: 0,
          odd: 0,
          locked: false,
        };
      });

      const rakePercent = market.rakePercent
        ? Number(market.rakePercent)
        : this.getDefaultRakePercent();

      const state: MultiRunnerEngineState = {
        marketId: market.id,
        marketType: market.type,
        eventId: market.eventId,
        eventName: market.event.name,
        name: market.name,
        status: market.status,
        rakePercent,
        bookingCloseAt: market.bookingCloseAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
        runners,
        history: existing?.history ?? [],
      };

      this.recalculateOdds(state);
      this.captureHistory(state);
      next.set(state.marketId, state);
    }

    this.states = next;
  }

  private async safeRefreshStatesFromDatabase() {
    try {
      await this.refreshStatesFromDatabase();
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2021') {
        this.logger.error(
          `Tabela em falta no Postgres (${JSON.stringify((e as PrismaClientKnownRequestError).meta)}). Execute: npx prisma migrate deploy`,
        );
        return;
      }
      throw e;
    }
  }

  private tick() {
    for (const state of this.states.values()) {
      this.recalculateOdds(state);
      this.captureHistory(state);
    }
  }

  private recalculateOdds(state: MultiRunnerEngineState) {
    const totalPool = state.runners.reduce((sum, r) => sum + r.pool, 0);
    const net = totalPool * (1 - state.rakePercent / 100);

    for (const runner of state.runners) {
      runner.odd = runner.pool > 0
        ? Math.max(1.01, net / runner.pool)
        : 0;
    }
  }

  private toSnapshot(state: MultiRunnerEngineState): MultiRunnerSnapshot {
    const totalPool = state.runners.reduce((sum, r) => sum + r.pool, 0);

    return {
      marketId: state.marketId,
      marketType: state.marketType,
      eventId: state.eventId,
      eventName: state.eventName,
      marketName: state.name,
      status: state.status,
      totalPool: Number(totalPool.toFixed(2)),
      rakePercent: state.rakePercent,
      closeInSeconds: Math.max(0, Math.floor((state.bookingCloseAt.getTime() - Date.now()) / 1000)),
      locked: false,
      runners: state.runners.map((r) => ({
        oddId: r.oddId,
        label: r.label,
        odd: Number(r.odd.toFixed(2)),
        pool: Number(r.pool.toFixed(2)),
        tickets: r.tickets,
        locked: false,
        poolShare: totalPool > 0 ? Number(((r.pool / totalPool) * 100).toFixed(1)) : 0,
      })),
      history: state.history.slice(-30),
    };
  }

  private captureHistory(state: MultiRunnerEngineState) {
    const totalPool = state.runners.reduce((sum, r) => sum + r.pool, 0);
    const odds: Record<string, number> = {};
    for (const runner of state.runners) {
      odds[runner.oddId] = runner.odd;
    }

    const last = state.history[state.history.length - 1];
    const changed = !last
      || last.totalPool !== Number(totalPool.toFixed(2))
      || Object.keys(odds).some((k) => last.odds[k] !== odds[k]);

    if (changed) {
      state.history.push({
        at: new Date().toISOString(),
        odds,
        totalPool: Number(totalPool.toFixed(2)),
      });

      if (state.history.length > 120) {
        state.history = state.history.slice(-120);
      }
    }
  }

  private getDefaultRakePercent(): number {
    const env = Number(process.env.MARKET_MARGIN_PERCENT ?? '20');
    return Number.isFinite(env) ? Math.min(50, Math.max(0, env)) : 20;
  }

  private getMinBet(): number {
    const env = Number(process.env.MIN_BET_AMOUNT ?? '10');
    return Number.isFinite(env) ? Math.max(1, env) : 10;
  }
}
