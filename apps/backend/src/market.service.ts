import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DuelStatus, MarketStatus, OddStatus, Prisma, WalletTransactionType } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from './database/prisma.service';

type Side = 'LEFT' | 'RIGHT';

type EngineState = {
  duelId: string;
  eventId: string;
  eventName: string;
  eventStartAt: Date;
  marketNames: string[];
  stageLabel: string;
  status: DuelStatus;
  bookingCloseAt: Date;
  left: {
    carId: string;
    carName: string;
    driverName: string;
    pool: number;
    tickets: number;
    odd: number;
    locked: boolean;
  };
  right: {
    carId: string;
    carName: string;
    driverName: string;
    pool: number;
    tickets: number;
    odd: number;
    locked: boolean;
  };
  history: Array<{
    at: string;
    leftOdd: number;
    rightOdd: number;
    leftPool: number;
    rightPool: number;
    lockedSide: Side | 'BOTH' | 'NONE';
    reason?: string;
  }>;
};

export type MarketSnapshot = {
  duelId: string;
  eventId: string;
  eventName: string;
  eventStartAt: string;
  marketNames: string[];
  stageLabel: string;
  status: DuelStatus;
  totalPool: number;
  closeInSeconds: number;
  marginPercent: number;
  lockThresholdPercent: number;
  locked: boolean;
  lockedSide: Side | 'BOTH' | 'NONE';
  lockReason?: string;
  lockMessage?: string;
  duel: {
    left: { id: string; label: string; odd: number; tickets: number; pool: number; locked: boolean };
    right: { id: string; label: string; odd: number; tickets: number; pool: number; locked: boolean };
  };
  history: Array<{
    at: string;
    leftOdd: number;
    rightOdd: number;
    leftPool: number;
    rightPool: number;
    lockedSide: Side | 'BOTH' | 'NONE';
    reason?: string;
  }>;
};

export type BettingBoard = {
  events: Array<{
    id: string;
    name: string;
    startAt: string;
    status: string;
    marketNames: string[];
    currentDuelId: string | null;
    stages: Array<{
      duelId: string;
      label: string;
      startsAt: string;
      bookingCloseAt: string;
      status: string;
    }>;
  }>;
  generatedAt: string;
};

const TICK_MS = 3_000;
const REFRESH_FROM_DB_MS = 30_000;

@Injectable()
export class MarketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketService.name);
  private ticker?: NodeJS.Timeout;
  private refreshTicker?: NodeJS.Timeout;
  private states = new Map<string, EngineState>();

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

  getMarketSnapshot(duelId?: string): MarketSnapshot | null {
    if (!this.states.size) return null;

    const state = duelId ? this.states.get(duelId) : this.pickDefaultState();
    if (!state) return null;

    return this.toSnapshot(state);
  }

  removeDuel(duelId: string) {
    this.states.delete(duelId);
  }

  getAllSnapshots(): MarketSnapshot[] {
    return [...this.states.values()].map((state) => this.toSnapshot(state));
  }

  async getBettingBoard(): Promise<BettingBoard> {
    const events = await this.prisma.event.findMany({
      orderBy: { startAt: 'asc' },
      include: {
        markets: { orderBy: { createdAt: 'asc' }, select: { name: true } },
        duels: { orderBy: { startsAt: 'asc' }, select: { id: true, startsAt: true, bookingCloseAt: true, status: true } },
      },
    });

    return {
      events: events.map((event) => {
        const stateDuels = event.duels.filter((duel) => this.states.has(duel.id));
        const current = stateDuels.find((duel) => ['BOOKING_OPEN', 'BOOKING_CLOSED'].includes(duel.status)) ?? stateDuels[0] ?? null;

        return {
          id: event.id,
          name: event.name,
          startAt: event.startAt.toISOString(),
          status: event.status,
          marketNames: event.markets.map((m) => m.name),
          currentDuelId: current?.id ?? null,
          stages: event.duels.map((duel, index) => ({
            duelId: duel.id,
            label: `Etapa ${index + 1}`,
            startsAt: duel.startsAt.toISOString(),
            bookingCloseAt: duel.bookingCloseAt.toISOString(),
            status: duel.status,
          })),
        };
      }),
      generatedAt: new Date().toISOString(),
    };
  }

  async placeBet(input: { userId: string; duelId: string; side: Side; amount: number }) {
    const state = this.states.get(input.duelId);
    if (!state) {
      throw new NotFoundException('Não encontramos esta corrida para apostar');
    }

    if (state.status !== DuelStatus.BOOKING_OPEN) {
      throw new Error('Apostas não estão abertas para esta corrida');
    }

    if (Date.now() >= state.bookingCloseAt.getTime()) {
      throw new Error('O período de apostas desta corrida já encerrou');
    }

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Informe um valor de aposta válido');
    }

    const minBet = this.getMinBet();
    if (amount < minBet) {
      throw new Error(`A aposta mínima é de R$ ${minBet.toFixed(2).replace('.', ',')}`);
    }

    if (input.side !== 'LEFT' && input.side !== 'RIGHT') {
      throw new Error('Lado inválido. Escolha LEFT ou RIGHT');
    }

    const oddAtPlacement = input.side === 'LEFT' ? state.left.odd : state.right.odd;
    const amountDecimal = new Prisma.Decimal(amount.toFixed(4));
    const potentialWin = amountDecimal.mul(new Prisma.Decimal(oddAtPlacement.toFixed(4)));

    const placed = await this.prisma.$transaction(async (tx) => {
      // SELECT FOR UPDATE to prevent double-spend race condition
      const wallet = await tx.$queryRaw<Array<{ id: string; balance: Prisma.Decimal }>>`
        SELECT id, balance FROM "Wallet" WHERE "userId" = ${input.userId} FOR UPDATE
      `.then((rows) => rows[0] ?? null);
      if (!wallet) {
        throw new Error('Carteira do usuário não encontrada');
      }

      if (new Prisma.Decimal(String(wallet.balance)).lt(amountDecimal)) {
        throw new Error('Saldo insuficiente para realizar essa aposta');
      }

      const oddId = await this.resolveOddIdForSide(tx, input.duelId, input.side);

      const bet = await tx.bet.create({
        data: {
          userId: input.userId,
          stake: amountDecimal,
          potentialWin,
          status: 'OPEN',
          items: {
            create: {
              oddId,
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

    this.applyPoolIncrement(state, input.side, amount);
    this.recalculateOdds(state);
    this.captureHistory(state, 'NONE');

    return {
      snapshot: this.toSnapshot(state),
      bet: {
        id: placed.betId,
        side: input.side,
        stake: amount,
        oddAtPlacement,
        potentialWin: Number(placed.potentialWin.toFixed(2)),
      },
      wallet: {
        balance: Number(placed.newBalance.toFixed(2)),
      },
    };
  }

  private async refreshStatesFromDatabase() {
    const duels = await this.prisma.duel.findMany({
      where: {
        status: {
          in: [DuelStatus.SCHEDULED, DuelStatus.BOOKING_OPEN, DuelStatus.BOOKING_CLOSED, DuelStatus.FINISHED],
        },
      },
      orderBy: { startsAt: 'asc' },
      include: {
        event: {
          include: {
            markets: {
              orderBy: { createdAt: 'asc' },
              select: { name: true },
            },
          },
        },
        leftCar: { include: { driver: true } },
        rightCar: { include: { driver: true } },
      },
    });

    const next = new Map<string, EngineState>();
    const stageByDuelId = new Map<string, string>();
    const byEvent = new Map<string, typeof duels>();
    for (const duel of duels) {
      const list = byEvent.get(duel.eventId) ?? [];
      list.push(duel);
      byEvent.set(duel.eventId, list);
    }
    for (const eventDuels of byEvent.values()) {
      eventDuels
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .forEach((duel, index) => stageByDuelId.set(duel.id, `Etapa ${index + 1}`));
    }

    for (const duel of duels) {
      const existing = this.states.get(duel.id);

      const state: EngineState = {
        duelId: duel.id,
        eventId: duel.eventId,
        eventName: duel.event.name,
        eventStartAt: duel.event.startAt,
        marketNames: duel.event.markets.map((m) => m.name),
        stageLabel: stageByDuelId.get(duel.id) ?? 'Etapa 1',
        status: duel.status,
        bookingCloseAt: duel.bookingCloseAt,
        left: existing
          ? { ...existing.left }
          : {
              carId: duel.leftCarId,
              carName: duel.leftCar.name,
              driverName: duel.leftCar.driver.name,
              pool: 0,
              tickets: 0,
              odd: 0,
              locked: false,
            },
        right: existing
          ? { ...existing.right }
          : {
              carId: duel.rightCarId,
              carName: duel.rightCar.name,
              driverName: duel.rightCar.driver.name,
              pool: 0,
              tickets: 0,
              odd: 0,
              locked: false,
            },
        history: existing?.history ?? [],
      };

      this.recalculateOdds(state);
      this.captureHistory(state, 'NONE');
      next.set(state.duelId, state);
    }

    this.states = next;
  }

  /** Evita crash loop na Fly se `prisma migrate deploy` ainda não foi aplicado nesta base. */
  private async safeRefreshStatesFromDatabase() {
    try {
      await this.refreshStatesFromDatabase();
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2021') {
        this.logger.error(
          `Tabela em falta no Postgres (${JSON.stringify(e.meta)}). Corra na mesma DATABASE_URL: npx prisma migrate deploy --schema prisma/schema.prisma`,
        );
        return;
      }
      throw e;
    }
  }

  private tick() {
    for (const state of this.states.values()) {
      this.recalculateOdds(state);
      this.captureHistory(state, 'NONE');
    }
  }

  private recalculateOdds(state: EngineState) {
    const totalPool = state.left.pool + state.right.pool;
    const margin = this.getMarginPercent() / 100;

    const leftOdd = state.left.pool > 0 ? Math.max(1.01, (totalPool * (1 - margin)) / state.left.pool) : 0;
    const rightOdd = state.right.pool > 0 ? Math.max(1.01, (totalPool * (1 - margin)) / state.right.pool) : 0;

    state.left.odd = Number(leftOdd.toFixed(2));
    state.right.odd = Number(rightOdd.toFixed(2));
  }


  private toSnapshot(state: EngineState): MarketSnapshot {
    const totalPool = state.left.pool + state.right.pool;

    return {
      duelId: state.duelId,
      eventId: state.eventId,
      eventName: state.eventName,
      eventStartAt: state.eventStartAt.toISOString(),
      marketNames: state.marketNames,
      stageLabel: state.stageLabel,
      status: state.status,
      totalPool: Number(totalPool.toFixed(2)),
      closeInSeconds: Math.max(0, Math.floor((state.bookingCloseAt.getTime() - Date.now()) / 1000)),
      marginPercent: this.getMarginPercent(),
      lockThresholdPercent: 100,
      locked: false,
      lockedSide: 'NONE',
      duel: {
        left: {
          id: state.left.carId,
          label: `${state.left.carName} (${state.left.driverName})`,
          odd: state.left.odd,
          tickets: state.left.tickets,
          pool: Number(state.left.pool.toFixed(2)),
          locked: false,
        },
        right: {
          id: state.right.carId,
          label: `${state.right.carName} (${state.right.driverName})`,
          odd: state.right.odd,
          tickets: state.right.tickets,
          pool: Number(state.right.pool.toFixed(2)),
          locked: false,
        },
      },
      history: state.history.slice(-20),
    };
  }

  private pickDefaultState() {
    const values = [...this.states.values()];
    return (
      values.find((v) => v.status === DuelStatus.BOOKING_OPEN) ||
      values.find((v) => v.status === DuelStatus.SCHEDULED) ||
      values[0] ||
      null
    );
  }

  private captureHistory(state: EngineState, lockedSide: Side | 'BOTH' | 'NONE', reason?: string) {
    const now = new Date().toISOString();
    const last = state.history[state.history.length - 1];

    const entry = {
      at: now,
      leftOdd: state.left.odd,
      rightOdd: state.right.odd,
      leftPool: Number(state.left.pool.toFixed(2)),
      rightPool: Number(state.right.pool.toFixed(2)),
      lockedSide,
      reason,
    };

    if (
      !last ||
      last.leftOdd !== entry.leftOdd ||
      last.rightOdd !== entry.rightOdd ||
      last.leftPool !== entry.leftPool ||
      last.rightPool !== entry.rightPool ||
      last.lockedSide !== entry.lockedSide
    ) {
      state.history.push(entry);
      if (state.history.length > 120) {
        state.history = state.history.slice(-120);
      }
    }
  }

  private applyPoolIncrement(state: EngineState, side: Side, amount: number) {
    if (side === 'LEFT') {
      state.left.pool += amount;
      state.left.tickets += 1;
      return;
    }

    state.right.pool += amount;
    state.right.tickets += 1;
  }

  private async resolveOddIdForSide(tx: Prisma.TransactionClient, duelId: string, side: Side) {
    const duel = await tx.duel.findUnique({
      where: { id: duelId },
      include: {
        event: {
          include: {
            markets: {
              where: { status: { in: [MarketStatus.OPEN, MarketStatus.SUSPENDED] } },
              orderBy: { createdAt: 'asc' },
              include: {
                odds: {
                  where: { status: { in: [OddStatus.ACTIVE, OddStatus.SUSPENDED] } },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!duel) {
      throw new Error('Corrida não encontrada');
    }

    const market = duel.event.markets.find((m) => m.odds.length >= 2);
    if (!market) {
      throw new Error('Mercado do evento sem odds válidas para registrar aposta');
    }

    const odd = side === 'LEFT' ? market.odds[0] : market.odds[1];
    if (!odd) {
      throw new Error('Odd indisponível para o lado selecionado');
    }

    return odd.id;
  }

  private getMarginPercent() {
    const env = Number(process.env.MARKET_MARGIN_PERCENT ?? '20');
    return Number.isFinite(env) ? Math.min(50, Math.max(0, env)) : 20;
  }

  private getMinBet() {
    const env = Number(process.env.MIN_BET_AMOUNT ?? '10');
    return Number.isFinite(env) ? Math.max(0, env) : 10;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
