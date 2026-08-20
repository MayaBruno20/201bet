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
import { ActivityService } from './common/activity.service';
import { isValidCpf } from './common/validators/cpf.validator';

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
  isCustom: boolean;
  isFeatured: boolean;
  left: {
    carId: string;
    carName: string;
    driverName: string;
    photoUrl: string | null;
    pool: number;
    tickets: number;
    odd: number;
    locked: boolean;
  };
  right: {
    carId: string;
    carName: string;
    driverName: string;
    photoUrl: string | null;
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
  settlement?: {
    winnerSide: Side;
    winnerLabel: string;
    finalPool: number;
    finalOdd: number;
    settledAt: string;
  };
};

export type MarketSnapshot = {
  duelId: string;
  eventId: string;
  eventName: string;
  eventStartAt: string;
  marketNames: string[];
  stageLabel: string;
  status: DuelStatus;
  isCustom: boolean;
  isFeatured: boolean;
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
      poolShare: number;
      locked: boolean;
      photoUrl: string | null;
    };
    right: {
      id: string;
      label: string;
      odd: number;
      tickets: number;
      pool: number;
      poolShare: number;
      locked: boolean;
      photoUrl: string | null;
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
  settlement?: {
    winnerSide: Side;
    winnerLabel: string;
    finalPool: number;
    finalOdd: number;
    settledAt: string;
  };
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
      roundNumber: number;
      category: string | null;
      categoryLabel: string | null;
      startsAt: string;
      bookingCloseAt: string;
      status: string;
      isSuperFinal: boolean;
      matchupStatus: 'PENDING' | 'COMPLETED' | 'INVALIDATED' | 'CANCELED' | null;
    }>;
  }>;
  generatedAt: string;
};

const TIME_CATEGORY_LABEL: Record<string, string> = {
  ORIGINAL_10S: 'Original 10s',
  CAT_9S: '9s',
  CAT_8_5S: '8,5s',
  CAT_8S: '8s',
  CAT_7_5S: '7,5s',
  CAT_7S: '7s',
  CAT_6_5S: '6,5s',
  CAT_6S: '6s',
  CAT_5_5S: '5,5s',
  TUDOKIDA: 'TUDOKIDÁ',
  APRESENTACAO: 'Apresentação',
  PRO: 'Pro',
  RACING: 'Racing',
  STREET: 'Street',
  BIG_TIRE_PRO: 'Big Tire Pro',
  SMALL_TIRE_PRO: 'Small Tire Pro',
  RADIAL_RACING: 'Radial Racing',
  NOPREP_70: 'No Prep 7.0s',
  NOPREP_80: 'No Prep 8.0s',
  NOPREP_90: 'No Prep 9.0s',
  NOPREP_95: 'No Prep 9.5s',
  NOPREP_10: 'No Prep 10s',
  NOPREP_11: 'No Prep 11s',
  DRAGSTER_JUNIOR: 'Dragster Junior',
};

const LIST_ROUND_LABEL: Record<string, string> = {
  ODD: 'Ímpares',
  EVEN: 'Pares',
  SHARK_TANK: 'Shark Tank',
};

const TICK_MS = 3_000;
const REFRESH_FROM_DB_MS = 30_000;

@Injectable()
export class MarketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketService.name);
  private ticker?: NodeJS.Timeout;
  private refreshTicker?: NodeJS.Timeout;
  private states = new Map<string, EngineState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async onModuleInit() {
    await this.safeRefreshStatesFromDatabase();

    this.ticker = setInterval(() => {
      this.tick();
    }, TICK_MS);

    this.refreshTicker = setInterval(() => {
      // Guard de idle: sem cliente WS, sem request HTTP recente E sem mercado
      // aberto conhecido → pula o acesso ao banco para a Neon hibernar.
      // Abrir um mercado é um request HTTP (reativa o ciclo no próximo tick).
      if (!this.activity.isActive() && this.states.size === 0) return;
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

  /**
   * Força um refresh imediato do estado em memória a partir do DB. Usado após ações
   * admin que mudam o status de duelos (cancelar evento etc.) para o card "AO VIVO"
   * e o /apostas refletirem a realidade em ~1 tick em vez de esperar o refresh de 30s.
   * Fire-and-forget seguro: safeRefreshStatesFromDatabase engole qualquer erro.
   */
  async refreshNow(): Promise<void> {
    await this.safeRefreshStatesFromDatabase();
  }

  async getBettingBoard(): Promise<BettingBoard> {
    const events = await this.prisma.event.findMany({
      // Eventos encerrados (FINISHED) ou cancelados (CANCELED) somem do /apostas —
      // independente de terem sido finalizados manualmente ou pelo lifecycle.
      where: { status: { notIn: ['FINISHED', 'CANCELED'] } },
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
            isCustom: true,
          },
        },
      },
    });

    const allDuelIds = events.flatMap((e) => e.duels.map((d) => d.id));

    // Enriquecimento: descobre roundNumber/categoria/super-final a partir das tabelas de matchup
    type MatchupStatusLabel = 'PENDING' | 'COMPLETED' | 'INVALIDATED' | 'CANCELED';
    const meta = new Map<string, {
      roundNumber: number;
      category: string | null;
      categoryLabel: string | null;
      isSuperFinal: boolean;
      matchupStatus: MatchupStatusLabel | null;
    }>();
    if (allDuelIds.length > 0) {
      const [catMatchups, armaMatchups, listMatchups] = await Promise.all([
        this.prisma.categoryMatchup.findMany({
          where: { duelId: { in: allDuelIds } },
          select: {
            duelId: true,
            roundNumber: true,
            isSuperFinal: true,
            status: true,
            bracket: { select: { category: true } },
          },
        }),
        this.prisma.armageddonMatchup.findMany({
          where: { duelId: { in: allDuelIds } },
          select: { duelId: true, roundNumber: true, roundType: true, stage: true, bracketKey: true },
        }),
        this.prisma.listMatchup.findMany({
          where: { duelId: { in: allDuelIds } },
          select: { duelId: true, roundNumber: true, roundType: true },
        }),
      ]);

      for (const m of catMatchups) {
        if (!m.duelId) continue;
        const cat = m.bracket.category;
        meta.set(m.duelId, {
          roundNumber: m.roundNumber,
          category: cat,
          categoryLabel: TIME_CATEGORY_LABEL[cat] ?? cat,
          isSuperFinal: m.isSuperFinal,
          matchupStatus: m.status as MatchupStatusLabel,
        });
      }
      for (const m of armaMatchups) {
        if (!m.duelId) continue;
        // Eliminação 144 não usa roundType (ODD/EVEN) — rotula por chave/fase.
        const label = m.roundType
          ? LIST_ROUND_LABEL[m.roundType] ?? m.roundType
          : m.bracketKey
            ? `Chave ${m.bracketKey}`
            : m.stage === 'SECOND_DRAW'
              ? 'Fase final'
              : 'Armageddon';
        meta.set(m.duelId, {
          roundNumber: m.roundNumber,
          // Agrupa por CHAVE no 1º sorteio (bracketKey) — assim o board separa as
          // chaves dentro de cada rodada (antes caía tudo em 'FIRST_DRAW' e as
          // chaves A/B se misturavam na "Rodada 2"). Mesma prioridade do label:
          // roundType (LADDER legado) → bracketKey (1º sorteio) → stage (fase final).
          category: m.roundType ?? m.bracketKey ?? m.stage ?? null,
          categoryLabel: label,
          isSuperFinal: false,
          matchupStatus: null,
        });
      }
      for (const m of listMatchups) {
        if (!m.duelId) continue;
        meta.set(m.duelId, {
          roundNumber: m.roundNumber,
          category: m.roundType,
          categoryLabel: LIST_ROUND_LABEL[m.roundType] ?? m.roundType,
          isSuperFinal: false,
          matchupStatus: null,
        });
      }
    }

    // Eventos sem nenhum duelo apostável saem da listagem do /apostas.
    // "Apostável" = SCHEDULED | BOOKING_OPEN | BOOKING_CLOSED (esse último ainda
    // aguarda settlement). Duelos FINISHED/CANCELED não contam — então quando
    // todos os embates de um evento já foram auditados (ou cancelados), o
    // evento some do EventSelector. Histórico de bets segue visível pelo
    // componente "Minhas Apostas" (independente de qual evento).
    const visibleEvents = events.filter((e) =>
      e.status !== 'FINISHED' &&
      e.status !== 'CANCELED' &&
      e.duels.some(
        (d) =>
          d.status === 'BOOKING_OPEN' ||
          d.status === 'BOOKING_CLOSED' ||
          d.status === 'SCHEDULED',
      ),
    );

    return {
      events: visibleEvents.map((event) => {
        // Duelos ÓRFÃOS (sem matchup) em eventos de chaveamento (Armageddon/Lista/
        // Copa) são lixo: seed de teste vazado ou duelos antigos deixados pra trás
        // pelo "Reiniciar evento" (que apaga os matchups mas só CANCELA os duelos,
        // sem religar nem remover). Eles caíam no fallback `índice+1` e geravam
        // "Rodada 85, 87..." no board. Regra: num evento que TEM matchups, só
        // mostra duelo com matchup (ou embate personalizado); em evento de duelo
        // avulso (sem nenhum matchup) nada é filtrado.
        const eventHasMatchups = event.duels.some((d) => meta.has(d.id));
        const boardDuels = eventHasMatchups
          ? event.duels.filter((d) => meta.has(d.id) || d.isCustom)
          : event.duels;
        const stateDuels = boardDuels.filter((duel) =>
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
          stages: boardDuels.map((duel, index) => {
            const m = meta.get(duel.id);
            const roundNumber = m?.roundNumber ?? index + 1;
            return {
              duelId: duel.id,
              label: m?.isSuperFinal ? 'Super Final' : `Rodada ${roundNumber}`,
              roundNumber,
              category: m?.category ?? null,
              categoryLabel: m?.categoryLabel ?? null,
              startsAt: duel.startsAt.toISOString(),
              bookingCloseAt: duel.bookingCloseAt.toISOString(),
              status: duel.status,
              isSuperFinal: m?.isSuperFinal ?? false,
              matchupStatus: m?.matchupStatus ?? null,
            };
          }),
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
    const prof = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { cpf: true, birthDate: true },
    });
    if (!prof?.cpf || !prof?.birthDate) {
      throw new BadRequestException(
        'Conclua CPF e data de nascimento (Completar cadastro) antes de apostar.',
      );
    }
    // CPF precisa ser VÁLIDO (dígito verificador) para apostar. Usuários com CPF
    // inválido ficam inaptos até corrigir em Minha Conta.
    if (!isValidCpf(prof.cpf)) {
      throw new BadRequestException(
        'Seu CPF é inválido. Corrija em Minha Conta para voltar a apostar.',
      );
    }

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Informe um valor de aposta válido');
    }

    const minBet = this.getMinBetAmount();
    if (amount < minBet) {
      throw new BadRequestException(`A aposta mínima é de R$ ${minBet.toFixed(2).replace('.', ',')}`);
    }

    const amountDecimal = new Prisma.Decimal(amount.toFixed(4));

    const placed = await this.prisma.$transaction(async (tx) => {
      const duel = await tx.duel.findUnique({
        where: { id: input.duelId },
        select: {
          id: true,
          status: true,
          bookingCloseAt: true,
          event: { select: { status: true } },
        },
      });

      if (!duel) {
        throw new NotFoundException(
          'Não encontramos esta corrida para apostar',
        );
      }

      // Defesa: bloqueia aposta em evento já encerrado/cancelado mesmo que o duel
      // tenha ficado órfão em BOOKING_OPEN (o lifecycle finaliza o Event mas pode
      // não fechar o duel). Sem isto, daria pra apostar via duelId direto.
      if (duel.event.status === 'FINISHED' || duel.event.status === 'CANCELED') {
        throw new BadRequestException('Este evento já foi encerrado — apostas indisponíveis.');
      }

      await tx.duelPoolState.upsert({
        where: { duelId: input.duelId },
        create: {
          duelId: input.duelId,
          leftPool: 0,
          rightPool: 0,
          leftTickets: 0,
          rightTickets: 0,
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
    }, { timeout: 15000, maxWait: 5000 });

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
          stageByDuelId.set(duel.id, `Rodada ${index + 1}`),
        );
    }

    for (const duel of duels) {
      const existing = this.states.get(duel.id);
      let pool = duel.poolState;

      if (!pool) {
        pool = await this.prisma.duelPoolState.create({
          data: {
            duelId: duel.id,
            leftPool: 0,
            rightPool: 0,
            leftTickets: 0,
            rightTickets: 0,
          },
        });
      }

      // Load settlement details if either Duel is FINISHED OR there's any SETTLED market for this duel
      let settlement: EngineState['settlement'];
      const settledMarket = await this.prisma.market.findFirst({
        where: { duelId: duel.id, status: MarketStatus.SETTLED },
        include: { odds: { orderBy: { createdAt: 'asc' } } },
      });
      if (settledMarket || duel.status === DuelStatus.FINISHED) {
        if (settledMarket && settledMarket.winnerOddId && settledMarket.settledAt) {
          const winnerIndex = settledMarket.odds.findIndex((o) => o.id === settledMarket.winnerOddId);
          const winnerSide: Side = winnerIndex === 0 ? 'LEFT' : 'RIGHT';
          const finalPool = Number(pool.leftPool) + Number(pool.rightPool);
          const winnerPool = winnerSide === 'LEFT' ? Number(pool.leftPool) : Number(pool.rightPool);
          const margin = this.getMarginPercent() / 100;
          // Mesma regra de produto da settlement: vencedor nunca recebe < 1.0x stake.
          const rawFinalOdd = winnerPool > 0 ? (finalPool * (1 - margin)) / winnerPool : 0;
          const finalOdd = winnerPool > 0 ? Math.max(1.0, rawFinalOdd) : 0;
          settlement = {
            winnerSide,
            winnerLabel: winnerSide === 'LEFT'
              ? `${duel.leftCar.name} (${duel.leftCar.driver.name})`
              : `${duel.rightCar.name} (${duel.rightCar.driver.name})`,
            finalPool,
            finalOdd: Number(finalOdd.toFixed(2)),
            settledAt: settledMarket.settledAt.toISOString(),
          };
        }
      }

      const state: EngineState = {
        duelId: duel.id,
        eventId: duel.eventId,
        eventName: duel.event.name,
        eventStartAt: duel.event.startAt,
        marketNames: duel.event.markets.map((m) => m.name),
        stageLabel: stageByDuelId.get(duel.id) ?? 'Rodada 1',
        status: duel.status,
        bookingCloseAt: duel.bookingCloseAt,
        isCustom: duel.isCustom,
        isFeatured: duel.isFeatured,
        left: {
          carId: duel.leftCarId,
          carName: duel.leftCar.name,
          driverName: duel.leftCar.driver.name,
          photoUrl: duel.leftCar.photoUrl ?? null,
          pool: Number(pool.leftPool),
          tickets: pool.leftTickets,
          odd: SEED_ODD,
          locked: false,
        },
        right: {
          carId: duel.rightCarId,
          carName: duel.rightCar.name,
          driverName: duel.rightCar.driver.name,
          photoUrl: duel.rightCar.photoUrl ?? null,
          pool: Number(pool.rightPool),
          tickets: pool.rightTickets,
          odd: SEED_ODD,
          locked: false,
        },
        history: existing?.history ?? [],
        settlement,
      };

      this.recalculateOdds(state);
      this.captureHistory(state, 'NONE');
      next.set(state.duelId, state);
    }

    this.states = next;
  }

  /**
   * Roda num setInterval (fire-and-forget) — NENHUM erro pode derrubar o processo.
   * No pior caso pulamos este tick (mantendo o estado em memória) e tentamos no próximo.
   */
  private async safeRefreshStatesFromDatabase() {
    try {
      await this.refreshStatesFromDatabase();
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code === 'P2021') {
          this.logger.error(
            `Tabela em falta no Postgres (${JSON.stringify(
              e.meta,
            )}). Na mesma DATABASE_URL: na raiz do monorepo com .env, \`npm run db:migrate:deploy\`; ou em apps/backend: \`DATABASE_URL=... npx prisma migrate deploy\`.`,
          );
          return;
        }
        if (e.code === 'P2024') {
          this.logger.warn(
            'Refresh do mercado pulou um tick: pool de conexões esgotado (P2024). Estado mantido em memória.',
          );
          return;
        }
      }
      this.logger.warn(
        `Refresh do mercado falhou neste tick (ignorado): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private tick() {
    for (const state of this.states.values()) {
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
      isCustom: false,
      isFeatured: false,
      left: {
        carId: '',
        carName: '',
        driverName: '',
        photoUrl: null,
        pool: leftPool,
        tickets: 0,
        odd: SEED_ODD,
        locked: false,
      },
      right: {
        carId: '',
        carName: '',
        driverName: '',
        photoUrl: null,
        pool: rightPool,
        tickets: 0,
        odd: SEED_ODD,
        locked: false,
      },
      history: [],
    };
  }

  private recalculateOdds(state: EngineState) {
    // Pari-mutuel puro (referência 201Bet):
    //   pool  = leftPool + rightPool
    //   net   = pool * (1 - rake)         rake fixo 20% (regulamento da casa)
    //   odd_X = net / pool_X              piso 1.01, sem teto
    // Quando um lado ainda não tem aposta, exibimos a cotação inicial seed (1.00) —
    // o cliente sabe que é só projeção e que vai se formar conforme o pote.
    const totalPool = state.left.pool + state.right.pool;
    const rake = HOUSE_MARGIN_PERCENT / 100;
    const net = totalPool * (1 - rake);

    state.left.odd =
      state.left.pool > 0 ? Number(Math.max(1.01, net / state.left.pool).toFixed(2)) : SEED_ODD;
    state.right.odd =
      state.right.pool > 0 ? Number(Math.max(1.01, net / state.right.pool).toFixed(2)) : SEED_ODD;
  }

  private evaluateLock(state: EngineState): {
    locked: boolean;
    lockedSide: Side | 'BOTH' | 'NONE';
    reason?: string;
    message?: string;
  } {
    // Pari-mutuel puro (referência 201Bet): apostas NUNCA pausam por imbalance,
    // exposição da casa ou tempo. Os únicos bloqueios são estados terminais
    // (mercado ainda não aberto, fechado pelo admin, finalizado, cancelado, liquidado).
    if (state.settlement) {
      return {
        locked: true,
        lockedSide: 'BOTH',
        reason: 'SETTLED',
        message: 'Confronto auditado e liquidado.',
      };
    }
    if (state.status === DuelStatus.SCHEDULED) {
      return {
        locked: true,
        lockedSide: 'BOTH',
        reason: 'NOT_OPEN',
        message: 'Mercado ainda não foi aberto pelo operador.',
      };
    }
    if (state.status === DuelStatus.BOOKING_CLOSED) {
      return {
        locked: true,
        lockedSide: 'BOTH',
        reason: 'CLOSED_BY_ADMIN',
        message: 'Apostas encerradas pelo operador.',
      };
    }
    if (
      state.status === DuelStatus.FINISHED ||
      state.status === DuelStatus.CANCELED
    ) {
      return {
        locked: true,
        lockedSide: 'BOTH',
        reason: 'FINISHED',
        message: 'Confronto encerrado.',
      };
    }
    return { locked: false, lockedSide: 'NONE' };
  }

  private toSnapshot(state: EngineState): MarketSnapshot {
    const totalPool = state.left.pool + state.right.pool;
    const lock = this.evaluateLock(state);

    // Pool share: usado como display público no lugar da odd. Quando ninguém
    // apostou ainda, mostra 50/50 (UI fica neutra em vez de mostrar 0/0).
    const leftShare = totalPool > 0 ? Number(((state.left.pool / totalPool) * 100).toFixed(1)) : 50;
    const rightShare = totalPool > 0 ? Number(((state.right.pool / totalPool) * 100).toFixed(1)) : 50;

    return {
      duelId: state.duelId,
      eventId: state.eventId,
      eventName: state.eventName,
      eventStartAt: state.eventStartAt.toISOString(),
      marketNames: state.marketNames,
      stageLabel: state.stageLabel,
      status: state.status,
      isCustom: state.isCustom,
      isFeatured: state.isFeatured,
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
          carName: state.left.carName,
          driverName: state.left.driverName,
          odd: state.left.odd,
          tickets: state.left.tickets,
          pool: Number(state.left.pool.toFixed(2)),
          poolShare: leftShare,
          locked:
            lock.locked &&
            (lock.lockedSide === 'LEFT' || lock.lockedSide === 'BOTH'),
          photoUrl: state.left.photoUrl,
        },
        right: {
          id: state.right.carId,
          label: `${state.right.carName} (${state.right.driverName})`,
          carName: state.right.carName,
          driverName: state.right.driverName,
          odd: state.right.odd,
          tickets: state.right.tickets,
          pool: Number(state.right.pool.toFixed(2)),
          poolShare: rightShare,
          locked:
            lock.locked &&
            (lock.lockedSide === 'RIGHT' || lock.lockedSide === 'BOTH'),
          photoUrl: state.right.photoUrl,
        },
      },
      history: state.history.slice(-20),
      settlement: state.settlement,
    };
  }

  private pickDefaultState() {
    // Card "AO VIVO AGORA" (home) e pré-seleção do /apostas: SEMPRE e APENAS um
    // embate que esteja ao vivo agora — ou seja, com a aposta aberta (BOOKING_OPEN).
    // SCHEDULED (ainda vai abrir), BOOKING_CLOSED e FINISHED não entram aqui.
    // "Ao vivo" = aposta aberta. Atenção: bookingCloseAt NÃO é enforced aqui — o
    // embate segue BOOKING_OPEN e apostável mesmo depois do horário, até o admin
    // fechar. Então NÃO filtramos por bookingCloseAt/closeInSeconds (senão o card
    // some assim que o countdown zera, que é o caso de quase todos os embates).
    const live = [...this.states.values()].filter(
      (v) => v.status === DuelStatus.BOOKING_OPEN,
    );
    if (!live.length) return null;

    // Prioridade dentro dos que estão ao vivo:
    //   1) Embate personalizado em destaque (isCustom + isFeatured)
    //   2) Qualquer embate ao vivo que já tenha pote (apostas registradas)
    //   3) Qualquer embate ao vivo
    return (
      live.find((v) => v.isCustom && v.isFeatured) ||
      live.find((v) => v.left.pool + v.right.pool > 0) ||
      live[0]
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
    // Busca o Market vinculado diretamente a este Duel (indexado em Market.duelId).
    // Evita carregar todos os mercados do Event quando há múltiplos abertos em paralelo.
    let market = await tx.market.findFirst({
      where: {
        duelId,
        status: { in: [MarketStatus.OPEN, MarketStatus.SUSPENDED] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        odds: {
          where: { status: { in: [OddStatus.ACTIVE, OddStatus.SUSPENDED] } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Fallback p/ mercados antigos sem duelId preenchido: encontra pelo evento.
    if (!market || market.odds.length < 2) {
      const duel = await tx.duel.findUnique({
        where: { id: duelId },
        select: { eventId: true },
      });
      if (!duel) {
        throw new BadRequestException('Corrida não encontrada');
      }
      const fallback = await tx.market.findFirst({
        where: {
          eventId: duel.eventId,
          duelId: null,
          status: { in: [MarketStatus.OPEN, MarketStatus.SUSPENDED] },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          odds: {
            where: { status: { in: [OddStatus.ACTIVE, OddStatus.SUSPENDED] } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      market = fallback ?? market;
    }

    if (!market || market.odds.length < 2) {
      throw new BadRequestException(
        'Mercado deste embate sem odds válidas para registrar aposta',
      );
    }

    const odd = side === 'LEFT' ? market.odds[0] : market.odds[1];
    if (!odd) {
      throw new BadRequestException('Odd indisponível para o lado selecionado');
    }

    return odd.id;
  }

  private getMarginPercent() {
    // Margem da casa é FIXA por regulamento (não admite override por env ou per-market).
    // Toda a math de odd/settlement depende disso ser estável.
    return HOUSE_MARGIN_PERCENT;
  }

  private getMinBetAmount() {
    const env = Number(process.env.MIN_BET_AMOUNT ?? '10');
    return Number.isFinite(env) ? Math.max(1, env) : 10;
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
}

/**
 * Constantes seladas do mecanismo de odds da 201bet. Não dependem de env nem
 * de configuração por mercado — uma mudança aqui é mudança de regulamento.
 *
 *  HOUSE_MARGIN_PERCENT = 20  → comissão da casa fixa
 *  SEED_ODD             = 1.0 → cotação exibida quando o pool de um lado é 0
 *
 * A invariante de proteção da casa é garantida pelo piso 1.0 no settlement:
 * mesmo em "mega esmagamento" (ex.: 50 num lado, 1000 no outro), o pagamento
 * total não excede o pool total — a casa pode coletar menos que 20%, mas
 * nunca paga do próprio bolso.
 */
export const HOUSE_MARGIN_PERCENT = 20;
export const SEED_ODD = 1.0;
