import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  DuelStatus,
  MarketStatus,
  OddStatus,
  Prisma,
  WalletTransactionType,
} from '@prisma/client';
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
    left: {
      id: string;
      label: string;
      odd: number;
      tickets: number;
      pool: number;
      locked: boolean;
    };
    right: {
      id: string;
      label: string;
      odd: number;
      tickets: number;
      pool: number;
      locked: boolean;
    };
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

  getAllSnapshots(): MarketSnapshot[] {
    return [...this.states.values()].map((state) => this.toSnapshot(state));
  }

  removeDuel(duelId: string) {
    this.states.delete(duelId);
  }

  async getBettingBoard(): Promise<BettingBoard> {
    const events = await this.prisma.event.findMany({
      orderBy: { startAt: 'asc' },
      include: {
        markets: { orderBy: { createdAt: 'asc' }, select: { name: true } },
        duels: {
          orderBy: { startsAt: 'asc' },
          select: {
            id: true,
            startsAt: true,
            bookingCloseAt: true,
            status: true,
          },
        },
      },
    });

    return {
      events: events.map((event) => {
        const stateDuels = event.duels.filter((duel) =>
          this.states.has(duel.id),
        );
        const current =
          stateDuels.find((duel) =>
            ['BOOKING_OPEN', 'BOOKING_CLOSED'].includes(duel.status),
          ) ??
          stateDuels[0] ??
          null;

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

  async placeBet(input: {
    userId: string;
    duelId: string;
    side: Side;
    amount: number;
  }) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Informe um valor de aposta válido');
    }

    if (amount < 5) {
      throw new BadRequestException('A aposta mínima é de R$ 5,00');
    }

    const amountDecimal = new Prisma.Decimal(amount.toFixed(4));

    const placed = await this.prisma.$transaction(async (tx) => {
      const duel = await tx.duel.findUnique({
        where: { id: input.duelId },
        include: {
          leftCar: { include: { driver: true } },
          rightCar: { include: { driver: true } },
        },
      });

      if (!duel) {
        throw new NotFoundException(
          'Não encontramos esta corrida para apostar',
        );
      }

      await tx.duelPoolState.upsert({
        where: { duelId: input.duelId },
        create: {
          duelId: input.duelId,
          leftPool: 1500,
          rightPool: 1500,
          leftTickets: 18,
          rightTickets: 18,
        },
        update: {},
      });

      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "DuelPoolState" WHERE "duelId" = ${input.duelId} FOR UPDATE`,
      );

      const poolRow = await tx.duelPoolState.findUnique({
        where: { duelId: input.duelId },
      });
      if (!poolRow) {
        throw new NotFoundException('Estado do mercado indisponível');
      }

      const leftPool = Number(poolRow.leftPool);
      const rightPool = Number(poolRow.rightPool);
      const metrics = this.syntheticState(
        duel.status,
        duel.bookingCloseAt,
        leftPool,
        rightPool,
      );
      this.recalculateOdds(metrics);

      const lock = this.evaluateLock(metrics);
      if (
        lock.locked &&
        (lock.lockedSide === 'BOTH' || lock.lockedSide === input.side)
      ) {
        throw new BadRequestException(
          lock.message ?? 'As apostas estão temporariamente bloqueadas',
        );
      }

      const oddAtPlacement =
        input.side === 'LEFT' ? metrics.left.odd : metrics.right.odd;
      const potentialWin = amountDecimal.mul(
        new Prisma.Decimal(oddAtPlacement.toFixed(4)),
      );

      const walletDec = await tx.wallet.updateMany({
        where: { userId: input.userId, balance: { gte: amountDecimal } },
        data: { balance: { decrement: amountDecimal } },
      });

      if (walletDec.count === 0) {
        const walletRow = await tx.wallet.findUnique({
          where: { userId: input.userId },
        });
        if (!walletRow) {
          throw new BadRequestException('Carteira do usuário não encontrada');
        }
        throw new BadRequestException(
          'Saldo insuficiente para realizar essa aposta',
        );
      }

      const wallet = await tx.wallet.findUnique({
        where: { userId: input.userId },
      });
      if (!wallet) {
        throw new BadRequestException('Carteira do usuário não encontrada');
      }

      const oddId = await this.resolveOddIdForSide(
        tx,
        input.duelId,
        input.side,
      );

      const poolUpdate =
        input.side === 'LEFT'
          ? { leftPool: { increment: amount }, leftTickets: { increment: 1 } }
          : {
              rightPool: { increment: amount },
              rightTickets: { increment: 1 },
            };

      await tx.duelPoolState.update({
        where: { duelId: input.duelId },
        data: poolUpdate,
      });

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

      const updatedWallet = await tx.wallet.findUnique({
        where: { id: wallet.id },
      });

      return {
        betId: bet.id,
        potentialWin: Number(potentialWin),
        newBalance: Number(updatedWallet!.balance),
        oddAtPlacement,
      };
    });

    const mem = this.states.get(input.duelId);
    if (mem) {
      this.applyPoolIncrement(mem, input.side, amount);
      this.recalculateOdds(mem);
      const nextLock = this.evaluateLock(mem);
      this.captureHistory(mem, nextLock.lockedSide, nextLock.reason);
    } else {
      await this.safeRefreshStatesFromDatabase();
    }

    const snapshotState = this.states.get(input.duelId);
    if (!snapshotState) {
      throw new NotFoundException('Não encontramos esta corrida para apostar');
    }

    return {
      snapshot: this.toSnapshot(snapshotState),
      bet: {
        id: placed.betId,
        side: input.side,
        stake: amount,
        oddAtPlacement: placed.oddAtPlacement,
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
          in: [
            DuelStatus.SCHEDULED,
            DuelStatus.BOOKING_OPEN,
            DuelStatus.BOOKING_CLOSED,
            DuelStatus.FINISHED,
          ],
        },
      },
      orderBy: { startsAt: 'asc' },
      include: {
        poolState: true,
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
        .forEach((duel, index) =>
          stageByDuelId.set(duel.id, `Etapa ${index + 1}`),
        );
    }

    for (const duel of duels) {
      const existing = this.states.get(duel.id);
      let pool = duel.poolState;

      if (!pool) {
        const seedLeft = 800 + this.randomInt(0, 1800);
        const seedRight = 800 + this.randomInt(0, 1800);
        pool = await this.prisma.duelPoolState.create({
          data: {
            duelId: duel.id,
            leftPool: seedLeft,
            rightPool: seedRight,
            leftTickets: Math.max(1, Math.floor(seedLeft / 80)),
            rightTickets: Math.max(1, Math.floor(seedRight / 80)),
          },
        });
      }

      const state: EngineState = {
        duelId: duel.id,
        eventId: duel.eventId,
        eventName: duel.event.name,
        eventStartAt: duel.event.startAt,
        marketNames: duel.event.markets.map((m) => m.name),
        stageLabel: stageByDuelId.get(duel.id) ?? 'Etapa 1',
        status: duel.status,
        bookingCloseAt: duel.bookingCloseAt,
        left: {
          carId: duel.leftCarId,
          carName: duel.leftCar.name,
          driverName: duel.leftCar.driver.name,
          pool: Number(pool.leftPool),
          tickets: pool.leftTickets,
          odd: 1.9,
          locked: false,
        },
        right: {
          carId: duel.rightCarId,
          carName: duel.rightCar.name,
          driverName: duel.rightCar.driver.name,
          pool: Number(pool.rightPool),
          tickets: pool.rightTickets,
          odd: 1.9,
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

  /** Evita crash loop em produção se `prisma migrate deploy` ainda não foi aplicado nesta base. */
  private async safeRefreshStatesFromDatabase() {
    try {
      await this.refreshStatesFromDatabase();
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2021') {
        this.logger.error(
          `Tabela em falta no Postgres (${JSON.stringify(
            e.meta,
          )}). Na mesma DATABASE_URL: na raiz do monorepo com .env, \`npm run db:migrate:deploy\`; ou em apps/backend: \`DATABASE_URL=... npx prisma migrate deploy\`.`,
        );
        return;
      }
      throw e;
    }
  }

  private tick() {
    const runSimulation = this.isSimulationLeader();

    for (const state of this.states.values()) {
      const lock = this.evaluateLock(state);

      if (
        runSimulation &&
        !lock.locked &&
        state.status === DuelStatus.BOOKING_OPEN
      ) {
        const side = Math.random() > 0.5 ? 'LEFT' : 'RIGHT';
        const addAmount = this.randomInt(35, 280);
        this.applyPoolIncrement(state, side, addAmount);
      }

      this.normalizePoolsIfNeeded(state);
      this.recalculateOdds(state);
      const nextLock = this.evaluateLock(state);
      state.left.locked =
        nextLock.locked &&
        (nextLock.lockedSide === 'LEFT' || nextLock.lockedSide === 'BOTH');
      state.right.locked =
        nextLock.locked &&
        (nextLock.lockedSide === 'RIGHT' || nextLock.lockedSide === 'BOTH');
      this.captureHistory(state, nextLock.lockedSide, nextLock.reason);
    }

    if (runSimulation) {
      void this.persistAllPoolsToDb();
    }
  }

  /**
   * Em múltiplas instâncias, defina `MARKET_SIMULATION_LEADER=false` em todas exceto uma
   * para evitar simulação duplicada; apostas reais continuam usando o Postgres como fonte de verdade.
   */
  private isSimulationLeader() {
    return process.env.MARKET_SIMULATION_LEADER !== 'false';
  }

  private async persistAllPoolsToDb() {
    for (const state of this.states.values()) {
      try {
        await this.prisma.duelPoolState.update({
          where: { duelId: state.duelId },
          data: {
            leftPool: state.left.pool,
            rightPool: state.right.pool,
            leftTickets: state.left.tickets,
            rightTickets: state.right.tickets,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Falha ao persistir pools do duelo ${state.duelId}`,
          err,
        );
      }
    }
  }

  /** Estado mínimo só para calcular travas e odds a partir dos pools persistidos. */
  private syntheticState(
    status: DuelStatus,
    bookingCloseAt: Date,
    leftPool: number,
    rightPool: number,
  ): EngineState {
    return {
      duelId: '',
      eventId: '',
      eventName: '',
      eventStartAt: new Date(),
      marketNames: [],
      stageLabel: '',
      status,
      bookingCloseAt,
      left: {
        carId: '',
        carName: '',
        driverName: '',
        pool: leftPool,
        tickets: 0,
        odd: 1.9,
        locked: false,
      },
      right: {
        carId: '',
        carName: '',
        driverName: '',
        pool: rightPool,
        tickets: 0,
        odd: 1.9,
        locked: false,
      },
      history: [],
    };
  }

  private recalculateOdds(state: EngineState) {
    const totalPool = state.left.pool + state.right.pool;
    const margin = this.getMarginPercent() / 100;

    const leftOdd = this.clamp(
      (totalPool * (1 - margin)) / Math.max(state.left.pool, 1),
      1.1,
      8,
    );
    const rightOdd = this.clamp(
      (totalPool * (1 - margin)) / Math.max(state.right.pool, 1),
      1.1,
      8,
    );

    state.left.odd = Number(leftOdd.toFixed(2));
    state.right.odd = Number(rightOdd.toFixed(2));
  }

  private evaluateLock(state: EngineState): {
    locked: boolean;
    lockedSide: Side | 'BOTH' | 'NONE';
    reason?: string;
    message?: string;
  } {
    const now = Date.now();
    if (state.status === DuelStatus.SCHEDULED) {
      return {
        locked: true,
        lockedSide: 'BOTH',
        reason: 'BOOKING_NOT_OPEN',
        message: 'Apostas ainda não foram abertas para esta corrida',
      };
    }

    if (
      now >= state.bookingCloseAt.getTime() ||
      state.status === DuelStatus.BOOKING_CLOSED
    ) {
      return {
        locked: true,
        lockedSide: 'BOTH',
        reason: 'BOOKING_CLOSED_BY_TIME',
        message: 'Apostas encerradas para esta corrida. Aguarde o resultado.',
      };
    }

    if (
      state.status === DuelStatus.FINISHED ||
      state.status === DuelStatus.CANCELED
    ) {
      return {
        locked: true,
        lockedSide: 'BOTH',
        reason: 'DUEL_NOT_OPEN',
        message: 'Corrida finalizada ou cancelada. Não é possível apostar.',
      };
    }

    const totalPool = state.left.pool + state.right.pool;
    if (totalPool <= 0) {
      return { locked: false, lockedSide: 'NONE' };
    }

    const biggerSide: Side =
      state.left.pool >= state.right.pool ? 'LEFT' : 'RIGHT';
    const biggerPool =
      biggerSide === 'LEFT' ? state.left.pool : state.right.pool;
    const dominance = (biggerPool / totalPool) * 100;
    const threshold = this.getLockThresholdPercent();

    if (dominance >= threshold) {
      return {
        locked: true,
        lockedSide: biggerSide,
        reason: 'IMBALANCE_LOCK',
        message:
          biggerSide === 'LEFT'
            ? 'Apostas no lado azul foram pausadas para equilibrar o mercado'
            : 'Apostas no lado laranja foram pausadas para equilibrar o mercado',
      };
    }

    const houseBuffer = this.getHouseExposureBuffer();
    const leftLiability = state.left.pool * state.left.odd;
    const rightLiability = state.right.pool * state.right.odd;

    if (leftLiability > totalPool + houseBuffer) {
      return {
        locked: true,
        lockedSide: 'LEFT',
        reason: 'HOUSE_EXPOSURE_LIMIT',
        message:
          'Apostas no lado azul pausadas por limite de segurança operacional',
      };
    }

    if (rightLiability > totalPool + houseBuffer) {
      return {
        locked: true,
        lockedSide: 'RIGHT',
        reason: 'HOUSE_EXPOSURE_LIMIT',
        message:
          'Apostas no lado laranja pausadas por limite de segurança operacional',
      };
    }

    return { locked: false, lockedSide: 'NONE' };
  }

  private toSnapshot(state: EngineState): MarketSnapshot {
    const totalPool = state.left.pool + state.right.pool;
    const lock = this.evaluateLock(state);

    return {
      duelId: state.duelId,
      eventId: state.eventId,
      eventName: state.eventName,
      eventStartAt: state.eventStartAt.toISOString(),
      marketNames: state.marketNames,
      stageLabel: state.stageLabel,
      status: state.status,
      totalPool: Number(totalPool.toFixed(2)),
      closeInSeconds: Math.max(
        0,
        Math.floor((state.bookingCloseAt.getTime() - Date.now()) / 1000),
      ),
      marginPercent: this.getMarginPercent(),
      lockThresholdPercent: this.getLockThresholdPercent(),
      locked: lock.locked,
      lockedSide: lock.lockedSide,
      lockReason: lock.reason,
      lockMessage: lock.message,
      duel: {
        left: {
          id: state.left.carId,
          label: `${state.left.carName} (${state.left.driverName})`,
          odd: state.left.odd,
          tickets: state.left.tickets,
          pool: Number(state.left.pool.toFixed(2)),
          locked:
            lock.locked &&
            (lock.lockedSide === 'LEFT' || lock.lockedSide === 'BOTH'),
        },
        right: {
          id: state.right.carId,
          label: `${state.right.carName} (${state.right.driverName})`,
          odd: state.right.odd,
          tickets: state.right.tickets,
          pool: Number(state.right.pool.toFixed(2)),
          locked:
            lock.locked &&
            (lock.lockedSide === 'RIGHT' || lock.lockedSide === 'BOTH'),
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

  private captureHistory(
    state: EngineState,
    lockedSide: Side | 'BOTH' | 'NONE',
    reason?: string,
  ) {
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

  private normalizePoolsIfNeeded(state: EngineState) {
    const total = state.left.pool + state.right.pool;
    const maxPool = 500_000;
    if (total <= maxPool) {
      return;
    }

    const factor = maxPool / total;
    state.left.pool *= factor;
    state.right.pool *= factor;
  }

  private async resolveOddIdForSide(
    tx: Prisma.TransactionClient,
    duelId: string,
    side: Side,
  ) {
    const duel = await tx.duel.findUnique({
      where: { id: duelId },
      include: {
        event: {
          include: {
            markets: {
              where: {
                status: { in: [MarketStatus.OPEN, MarketStatus.SUSPENDED] },
              },
              orderBy: { createdAt: 'asc' },
              include: {
                odds: {
                  where: {
                    status: { in: [OddStatus.ACTIVE, OddStatus.SUSPENDED] },
                  },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!duel) {
      throw new BadRequestException('Corrida não encontrada');
    }

    const market = duel.event.markets.find((m) => m.odds.length >= 2);
    if (!market) {
      throw new BadRequestException(
        'Mercado do evento sem odds válidas para registrar aposta',
      );
    }

    const odd = side === 'LEFT' ? market.odds[0] : market.odds[1];
    if (!odd) {
      throw new BadRequestException('Odd indisponível para o lado selecionado');
    }

    return odd.id;
  }

  private getMarginPercent() {
    const env = Number(process.env.MARKET_MARGIN_PERCENT ?? '6');
    return Number.isFinite(env) ? this.clamp(env, 0, 20) : 6;
  }

  private getLockThresholdPercent() {
    const env = Number(process.env.BOOKING_LOCK_PERCENT ?? '67');
    return Number.isFinite(env) ? this.clamp(env, 51, 95) : 67;
  }

  private getHouseExposureBuffer() {
    const env = Number(process.env.HOUSE_EXPOSURE_BUFFER ?? '25000');
    return Number.isFinite(env) ? Math.max(0, env) : 25_000;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
