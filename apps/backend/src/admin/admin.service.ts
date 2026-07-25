import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BetStatus,
  DuelStatus,
  EventStatus,
  MarketStatus,
  MarketType,
  OddStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  UserRole,
  UserStatus,
  WalletTransactionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { HOUSE_MARGIN_PERCENT, MarketService } from '../market.service';
import { aggregatePoolsByOdd, computeMultiMarketFinancials } from '../multi-market-financials';
import { MultiRunnerMarketService } from '../multi-runner-market.service';
import { SettlementService } from '../settlement.service';
import {
  AnalyticsExportFormat,
  AnalyticsExportQueryDto,
  AnalyticsExportType,
} from './dto/analytics-query.dto';
import {
  WalletAdjustOperation,
  type AdjustUserWalletDto,
} from './dto/adjust-user-wallet.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { CreateCarDto } from './dto/create-car.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { BulkImportDriversDto } from './dto/bulk-import-drivers.dto';
import { parsePilotsFromPdf } from './pilot-file-parse.util';
import { CreateDuelDto } from './dto/create-duel.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { UpdateDuelDto } from './dto/update-duel.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpsertSettingDto } from './dto/upsert-setting.dto';

type AuditContext = {
  actorUserId?: string;
  actorRole?: UserRole;
  ipAddress?: string;
  userAgent?: string;
};

type MatchupOrigin = {
  type: 'LIST' | 'ARMAGEDDON' | 'CATEGORY';
  // Id do matchup de origem — é ele que os endpoints de abrir/fechar/auditar
  // recebem (PATCH matchups/:id/market, POST matchups/:id/settle).
  matchupId: string;
  // Id do EVENTO de origem (listEventId / armageddonEventId / categoryEventId) —
  // usado pelos controles em lote do Modo Pista (gerar rodada, abrir/fechar todos).
  originEventId: string;
  leftPosition: number | null;
  rightPosition: number | null;
  // Localização legível pro operador/auditor ("Chave B · R2", "9s · Super Final").
  context: string | null;
};

const TIME_CATEGORY_LABEL: Record<string, string> = {
  ORIGINAL_10S: '10s',
  CAT_9S: '9s',
  CAT_8_5S: '8,5s',
  CAT_8S: '8s',
  CAT_7_5S: '7,5s',
  CAT_7S: '7s',
  CAT_6_5S: '6,5s',
  CAT_6S: '6s',
  CAT_5_5S: '5,5s',
  TUDOKIDA: 'Tudokida',
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

const PRIVILEGED_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.OPERATOR,
  UserRole.AUDITOR,
];

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: SettlementService,
    private readonly multiRunnerService: MultiRunnerMarketService,
    private readonly marketService: MarketService,
  ) {}

  async getDashboardSummary(days = 30) {
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const startRange = new Date(now); startRange.setDate(startRange.getDate() - days);

    const [
      usersTotal,
      activeUsers,
      eventsTotal,
      eventsLive,
      duelsTotal,
      openMarkets,
      pendingPayments,
      pendingPaymentsAgg,
      ledgerVolume,
      betsTotal,
      betsToday,
      betsRangeStakeAgg,
      betsRangeWonPayoutAgg,
      revenueByMonth,
      eventTypeDistribution,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.event.count(),
      this.prisma.event.count({ where: { status: 'LIVE' } }),
      this.prisma.duel.count(),
      this.prisma.market.count({ where: { status: 'OPEN' } }),
      this.prisma.payment.count({ where: { status: 'PENDING', type: 'WITHDRAW' } }),
      this.prisma.payment.aggregate({
        where: { status: 'PENDING', type: 'WITHDRAW' },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.aggregate({ _sum: { amount: true } }),
      this.prisma.bet.count(),
      this.prisma.bet.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.bet.aggregate({
        where: { createdAt: { gte: startRange } },
        _sum: { stake: true },
      }),
      this.prisma.bet.aggregate({
        where: { createdAt: { gte: startRange }, status: 'WON' },
        _sum: { potentialWin: true },
      }),
      // Receita por mês (últimos 8 meses) — agrupa stake de bets pelo mês de criação
      this.prisma.$queryRaw<Array<{ month: string; receita: number; apostas: number; ggr: number }>>`
        SELECT
          to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
          COALESCE(SUM("stake"), 0)::float AS receita,
          COUNT(*)::int AS apostas,
          COALESCE(SUM(CASE WHEN status='WON' THEN "potentialWin" ELSE 0 END), 0)::float AS ggr
        FROM "Bet"
        WHERE "createdAt" >= NOW() - INTERVAL '8 months'
        GROUP BY 1
        ORDER BY 1
      `,
      // Distribuição por tipo de evento (Copa Categorias, Listas Brasil, Armageddon, Outros)
      this.prisma.$queryRaw<Array<{ tipo: string; total: number }>>`
        SELECT 'CategoryEvent' AS tipo, COUNT(*)::int AS total FROM "CategoryEvent" WHERE status != 'CANCELED'
        UNION ALL
        SELECT 'ListEvent', COUNT(*)::int FROM "ListEvent" WHERE status != 'CANCELED'
        UNION ALL
        SELECT 'ArmageddonEvent', COUNT(*)::int FROM "ArmageddonEvent" WHERE status != 'CANCELED'
        UNION ALL
        SELECT 'Event', COUNT(*)::int FROM "Event" WHERE status != 'CANCELED' AND id NOT IN (
          SELECT "eventId" FROM "CategoryEvent" WHERE "eventId" IS NOT NULL
          UNION SELECT "eventId" FROM "ListEvent" WHERE "eventId" IS NOT NULL
          UNION SELECT "eventId" FROM "ArmageddonEvent" WHERE "eventId" IS NOT NULL
        )
      `,
    ]);

    const totalStakeRange = Number(betsRangeStakeAgg._sum.stake ?? 0);
    const totalWonRange = Number(betsRangeWonPayoutAgg._sum.potentialWin ?? 0);
    const ggrRange = totalStakeRange - totalWonRange;

    return {
      // Tabela legada
      usersTotal,
      activeUsers,
      eventsTotal,
      duelsTotal,
      openMarkets,
      pendingPayments,
      ledgerVolume: Number(ledgerVolume._sum.amount ?? 0),

      // Campos novos consumidos pelo painel admin externo
      totalUsers: usersTotal,
      liveEvents: eventsLive,
      pendingPaymentsAmount: Number(pendingPaymentsAgg._sum.amount ?? 0),
      totalRevenue: totalStakeRange,
      ggr: ggrRange,
      rangeDays: days,
      totalBets: betsTotal,
      betsToday,
      riskMarkets: 0,
      revenueByMonth,
      eventTypeDistribution,
    };
  }

  async listUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        cpf: true,
        birthDate: true,
        role: true,
        status: true,
        createdAt: true,
        wallet: {
          select: {
            id: true,
            balance: true,
            currency: true,
          },
        },
      },
    });
  }

  async createUser(payload: CreateAdminUserDto, audit: AuditContext = {}) {
    const normalizedEmail = payload.email.toLowerCase().trim();
    const normalizedCpf = payload.cpf.replace(/\D/g, '');

    if (!/^\d{11}$/.test(normalizedCpf)) {
      throw new BadRequestException('CPF inválido');
    }

    if (
      PRIVILEGED_ROLES.includes(payload.role) &&
      audit.actorRole !== UserRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Apenas administradores podem criar usuários com este perfil',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    const existingCpf = await this.prisma.user.findUnique({
      where: { cpf: normalizedCpf },
    });
    if (existing || existingCpf) {
      throw new ConflictException(
        existing ? 'E-mail já cadastrado' : 'CPF já cadastrado',
      );
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: payload.name.trim(),
          cpf: normalizedCpf,
          birthDate: new Date(payload.birthDate),
          password: passwordHash,
          role: payload.role ?? UserRole.USER,
          status: payload.status ?? UserStatus.ACTIVE,
          wallet: {
            create: {
              balance: new Prisma.Decimal(0),
              currency: 'BRL',
            },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
          cpf: true,
          birthDate: true,
          role: true,
          status: true,
          createdAt: true,
          wallet: {
            select: {
              id: true,
              balance: true,
              currency: true,
            },
          },
        },
      });

      await this.logAction(
        tx,
        'ADMIN_CREATE_USER',
        'User',
        created.id,
        { email: created.email, role: created.role, status: created.status },
        audit,
      );
      return created;
    });
  }

  async updateUser(
    id: string,
    payload: UpdateAdminUserDto,
    audit: AuditContext = {},
  ) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Usuário não encontrado');

    const data: Prisma.UserUpdateInput = {};

    if (payload.email) {
      const email = payload.email.toLowerCase().trim();
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== id) {
        throw new ConflictException('E-mail já cadastrado');
      }
      data.email = email;
    }

    if (payload.cpf) {
      const cpf = payload.cpf.replace(/\D/g, '');
      if (!/^\d{11}$/.test(cpf)) {
        throw new BadRequestException('CPF inválido');
      }
      const existingCpf = await this.prisma.user.findUnique({ where: { cpf } });
      if (existingCpf && existingCpf.id !== id) {
        throw new ConflictException('CPF já cadastrado');
      }
      data.cpf = cpf;
    }

    if (payload.password) {
      data.password = await bcrypt.hash(payload.password, 12);
    }
    if (payload.name) data.name = payload.name.trim();
    if (payload.birthDate) data.birthDate = new Date(payload.birthDate);
    if (payload.role) {
      if (
        PRIVILEGED_ROLES.includes(payload.role) &&
        audit.actorRole !== UserRole.ADMIN
      ) {
        throw new ForbiddenException(
          'Apenas administradores podem atribuir este perfil',
        );
      }
      data.role = payload.role;
    }
    if (payload.status) data.status = payload.status;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          name: true,
          cpf: true,
          birthDate: true,
          role: true,
          status: true,
          wallet: { select: { id: true, balance: true, currency: true } },
        },
      });

      await this.logAction(tx, 'ADMIN_UPDATE_USER', 'User', id, payload, audit);
      return updated;
    });
  }

  async deleteUser(id: string, audit: AuditContext = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { status: UserStatus.BANNED },
      });
      await this.logAction(
        tx,
        'ADMIN_DEACTIVATE_USER',
        'User',
        id,
        { previousStatus: user.status, nextStatus: 'BANNED' },
        audit,
      );
      return { id: updated.id, status: updated.status };
    });
  }

  async adjustUserWallet(
    id: string,
    payload: AdjustUserWalletDto,
    audit: AuditContext = {},
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { wallet: true },
    });
    if (!user?.wallet)
      throw new NotFoundException('Carteira do usuário não encontrada');

    const amount = new Prisma.Decimal(payload.amount);
    if (amount.lte(0))
      throw new BadRequestException('Valor inválido para ajuste');

    const signedAmount =
      payload.operation === WalletAdjustOperation.ADD ? amount : amount.neg();

    return this.prisma.$transaction(async (tx) => {
      if (payload.operation === WalletAdjustOperation.REMOVE) {
        const dec = await tx.wallet.updateMany({
          where: { id: user.wallet!.id, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        });
        if (dec.count === 0) {
          throw new BadRequestException('Saldo insuficiente para remoção');
        }
      } else {
        await tx.wallet.update({
          where: { id: user.wallet!.id },
          data: { balance: { increment: amount } },
        });
      }

      const wallet = await tx.wallet.findUnique({
        where: { id: user.wallet!.id },
      });
      if (!wallet)
        throw new NotFoundException('Carteira do usuário não encontrada');

      const ledger = await tx.walletTransaction.create({
        data: {
          walletId: user.wallet!.id,
          type: WalletTransactionType.ADJUSTMENT,
          amount: signedAmount,
          reference:
            payload.reason?.trim() ||
            `admin-adjust-${payload.operation.toLowerCase()}`,
        },
      });

      await this.logAction(
        tx,
        'ADMIN_WALLET_ADJUST',
        'Wallet',
        user.wallet!.id,
        {
          userId: id,
          operation: payload.operation,
          amount: payload.amount,
          reason: payload.reason,
        },
        audit,
      );

      return {
        walletId: wallet.id,
        userId: id,
        newBalance: Number(wallet.balance),
        ledgerId: ledger.id,
      };
    });
  }

  async listEvents() {
    return this.prisma.event.findMany({
      orderBy: { startAt: 'asc' },
      include: {
        markets: {
          include: {
            odds: true,
          },
        },
        duels: {
          include: {
            leftCar: { include: { driver: true } },
            rightCar: { include: { driver: true } },
          },
        },
      },
    });
  }

  async createEvent(payload: CreateEventDto, audit: AuditContext = {}) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          sport: payload.sport,
          name: payload.name,
          description: payload.description,
          bannerUrl: payload.bannerUrl,
          featured: payload.featured ?? false,
          startAt: new Date(payload.startAt),
          status: payload.status,
          markets: {
            create: payload.markets.map((market) => ({
              name: market.name,
              status: market.status,
              odds: {
                create: market.odds.map((odd) => ({
                  label: odd.label,
                  value: new Prisma.Decimal(odd.value),
                  status: odd.status,
                })),
              },
            })),
          },
        },
        include: {
          markets: { include: { odds: true } },
        },
      });

      await this.logAction(
        tx,
        'ADMIN_CREATE_EVENT',
        'Event',
        created.id,
        { name: created.name, sport: created.sport },
        audit,
      );
      return created;
    });
  }

  async updateEvent(
    id: string,
    payload: UpdateEventDto,
    audit: AuditContext = {},
  ) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Evento não encontrado');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: { id },
        data: {
          sport: payload.sport,
          name: payload.name,
          description: payload.description,
          bannerUrl: payload.bannerUrl,
          featured: payload.featured,
          startAt: payload.startAt ? new Date(payload.startAt) : undefined,
          status: payload.status,
        },
      });

      await this.logAction(
        tx,
        'ADMIN_UPDATE_EVENT',
        'Event',
        id,
        payload,
        audit,
      );
      return updated;
    });
  }

  async deleteEvent(id: string, audit: AuditContext = {}) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Evento não encontrado');

    // Void all open markets (refund bets) before canceling
    const openMarkets = await this.prisma.market.findMany({
      where: { eventId: id, status: { in: [MarketStatus.OPEN, MarketStatus.SUSPENDED] } },
      select: { id: true },
    });

    for (const m of openMarkets) {
      try {
        await this.settlementService.voidMarket(m.id, audit);
        this.multiRunnerService.removeMarket(m.id);
      } catch { /* market may already be closed */ }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id },
        data: { status: EventStatus.CANCELED },
      });
      await tx.market.updateMany({
        where: { eventId: id, status: { not: MarketStatus.SETTLED } },
        data: { status: MarketStatus.CLOSED },
      });
      await tx.odd.updateMany({
        where: { market: { eventId: id } },
        data: { status: OddStatus.CLOSED },
      });
      await tx.duel.updateMany({
        where: {
          eventId: id,
          status: {
            in: [
              DuelStatus.SCHEDULED,
              DuelStatus.BOOKING_OPEN,
              DuelStatus.BOOKING_CLOSED,
            ],
          },
        },
        data: { status: DuelStatus.CANCELED },
      });

      await this.logAction(
        tx,
        'ADMIN_CANCEL_EVENT',
        'Event',
        id,
        { previousStatus: existing.status, nextStatus: EventStatus.CANCELED },
        audit,
      );
      return { id, status: EventStatus.CANCELED };
    });

    // Engine recarrega já: os duelos cancelados saem do card "AO VIVO" em ~1 tick.
    void this.marketService.refreshNow();
    return result;
  }

  async listDrivers() {
    return this.prisma.driver.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        cars: true,
      },
    });
  }

  async createDriver(payload: CreateDriverDto, audit: AuditContext = {}) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.driver.create({
        data: {
          name: payload.name.trim(),
          nickname: payload.nickname?.trim(),
          team: payload.team?.trim(),
          carNumber: payload.carNumber?.trim(),
          hometown: payload.hometown?.trim(),
          isGuest: payload.isGuest ?? false,
        },
      });

      await this.logAction(
        tx,
        'ADMIN_CREATE_DRIVER',
        'Driver',
        created.id,
        { name: created.name, nickname: created.nickname, isGuest: created.isGuest },
        audit,
      );
      return created;
    });
  }

  /**
   * Importa pilotos em massa para o pool global (cadastro de Driver).
   * - De-dup por nome (case-insensitive, trim) contra o banco E dentro do próprio lote.
   * - Piloto já existente: atualiza o apelido só se vier preenchido e for diferente.
   * - Não posiciona em chave nenhuma — apenas cria os pilotos disponíveis.
   */
  async bulkImportDrivers(payload: BulkImportDriversDto, audit: AuditContext = {}) {
    // Normaliza e remove duplicados internos do lote (mantém o 1º de cada nome).
    const seen = new Set<string>();
    const rows = payload.pilots
      .map((p) => ({
        name: p.name.trim(),
        nickname: p.nickname?.trim() || null,
        area: p.area?.trim() || null,
      }))
      .filter((p) => p.name.length >= 2)
      .filter((p) => {
        const key = p.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const result = { received: payload.pilots.length, created: 0, updated: 0, skipped: 0 };

    await this.prisma.$transaction(
      async (tx) => {
        for (const row of rows) {
          const existing = await tx.driver.findFirst({
            where: { name: { equals: row.name, mode: 'insensitive' } },
            select: { id: true, nickname: true },
          });
          if (existing) {
            if (row.nickname && existing.nickname !== row.nickname) {
              await tx.driver.update({ where: { id: existing.id }, data: { nickname: row.nickname } });
              result.updated += 1;
            } else {
              result.skipped += 1;
            }
            continue;
          }
          await tx.driver.create({ data: { name: row.name, nickname: row.nickname } });
          result.created += 1;
        }

        await this.logAction(
          tx,
          'ADMIN_BULK_IMPORT_DRIVERS',
          'Driver',
          null,
          {
            ...result,
            areas: Array.from(new Set(rows.map((r) => r.area).filter(Boolean))),
          },
          audit,
        );
      },
      { timeout: 60000, maxWait: 10000 },
    );

    return result;
  }

  /**
   * Lê um PDF (tabela Área · Nome · Apelido) e devolve as linhas parseadas para
   * pré-visualização — NÃO grava nada. Planilhas (.xlsx/.csv) são lidas no
   * próprio navegador (SheetJS); aqui tratamos só PDF.
   */
  async parsePilotFile(file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Nenhum arquivo enviado');
    const filename = (file.originalname || '').toLowerCase();
    const isPdf = file.mimetype === 'application/pdf' || filename.endsWith('.pdf');
    if (!isPdf) {
      throw new BadRequestException('Envie um PDF. Planilhas (.xlsx/.csv) são lidas direto no navegador.');
    }
    let pilots: Awaited<ReturnType<typeof parsePilotsFromPdf>>;
    try {
      pilots = await parsePilotsFromPdf(file.buffer);
    } catch {
      throw new BadRequestException('Não consegui ler este PDF. Tente exportar a lista como .xlsx/.csv.');
    }
    return { pilots, count: pilots.length };
  }

  /**
   * Reset SEGURO do pool: remove apenas pilotos SEM nenhuma referência (sem
   * carro, lista, shark tank, categoria da Copa, chave do Armageddon ou
   * embate). Pilotos em uso em qualquer lugar são mantidos — assim não quebra
   * Listas/Copa/apostas que compartilham o cadastro global de pilotos.
   */
  async deleteUnusedDrivers(audit: AuditContext = {}) {
    const drivers = await this.prisma.driver.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            cars: true,
            rosters: true,
            leftMatchups: true,
            rightMatchups: true,
            sharkTankEntries: true,
            categoryCompetitors: true,
            armageddonRoster: true,
            armageddonLeftMatches: true,
            armageddonRightMatches: true,
          },
        },
      },
    });

    const unused = drivers.filter((d) => Object.values(d._count).every((n) => n === 0));
    if (unused.length === 0) return { deleted: 0, kept: drivers.length };

    const ids = unused.map((d) => d.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.driver.deleteMany({ where: { id: { in: ids } } });
      await this.logAction(
        tx,
        'ADMIN_DELETE_UNUSED_DRIVERS',
        'Driver',
        null,
        { deleted: ids.length, names: unused.map((d) => d.name).slice(0, 200) },
        audit,
      );
    });

    return { deleted: ids.length, kept: drivers.length - ids.length };
  }

  async updateDriver(
    id: string,
    payload: UpdateDriverDto,
    audit: AuditContext = {},
  ) {
    const existing = await this.prisma.driver.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Piloto não encontrado');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.driver.update({
        where: { id },
        data: {
          name: payload.name?.trim(),
          nickname: payload.nickname?.trim(),
          team: payload.team?.trim(),
          carNumber: payload.carNumber?.trim(),
          hometown: payload.hometown?.trim(),
          active: payload.active,
          isGuest: payload.isGuest,
        },
      });

      await this.logAction(
        tx,
        'ADMIN_UPDATE_DRIVER',
        'Driver',
        id,
        payload,
        audit,
      );
      return updated;
    });
  }

  async deleteDriver(id: string, audit: AuditContext = {}) {
    const existing = await this.prisma.driver.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Piloto não encontrado');

    return this.prisma.$transaction(async (tx) => {
      await tx.driver.update({ where: { id }, data: { active: false } });
      await this.logAction(
        tx,
        'ADMIN_DEACTIVATE_DRIVER',
        'Driver',
        id,
        { active: false },
        audit,
      );
      return { id, active: false };
    });
  }

  async listCars() {
    return this.prisma.car.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        driver: true,
      },
    });
  }

  async createCar(payload: CreateCarDto, audit: AuditContext = {}) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: payload.driverId },
    });
    if (!driver) {
      throw new BadRequestException('Piloto não encontrado');
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.car.create({
        data: {
          driverId: payload.driverId,
          name: payload.name.trim(),
          category: payload.category.trim(),
          number: payload.number?.trim(),
        },
        include: { driver: true },
      });

      await this.logAction(
        tx,
        'ADMIN_CREATE_CAR',
        'Car',
        created.id,
        {
          name: created.name,
          driver: created.driver.name,
          category: created.category,
        },
        audit,
      );
      return created;
    });
  }

  async updateCar(id: string, payload: UpdateCarDto, audit: AuditContext = {}) {
    const existing = await this.prisma.car.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Carro não encontrado');

    if (payload.driverId) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: payload.driverId },
      });
      if (!driver) {
        throw new BadRequestException('Piloto não encontrado');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // photoUrl: undefined = não mexe; null/'' = remove; string preenchida = sobrescreve.
      const photoUrl =
        payload.photoUrl === undefined
          ? undefined
          : payload.photoUrl && payload.photoUrl.trim()
            ? payload.photoUrl.trim()
            : null;

      const updated = await tx.car.update({
        where: { id },
        data: {
          driverId: payload.driverId,
          name: payload.name?.trim(),
          category: payload.category?.trim(),
          number: payload.number?.trim(),
          active: payload.active,
          photoUrl,
        },
        include: { driver: true },
      });

      await this.logAction(tx, 'ADMIN_UPDATE_CAR', 'Car', id, payload, audit);
      return updated;
    });
  }

  async setCarPhoto(id: string, photoUrl: string | null, audit: AuditContext = {}) {
    const existing = await this.prisma.car.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Carro não encontrado');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.car.update({
        where: { id },
        data: { photoUrl },
        include: { driver: true },
      });
      await this.logAction(
        tx,
        photoUrl ? 'ADMIN_SET_CAR_PHOTO' : 'ADMIN_REMOVE_CAR_PHOTO',
        'Car',
        id,
        { photoUrl, previousPhotoUrl: existing.photoUrl },
        audit,
      );
      return updated;
    });
  }

  async deleteCar(id: string, audit: AuditContext = {}) {
    const existing = await this.prisma.car.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Carro não encontrado');

    return this.prisma.$transaction(async (tx) => {
      await tx.car.update({ where: { id }, data: { active: false } });
      await tx.duel.updateMany({
        where: {
          OR: [{ leftCarId: id }, { rightCarId: id }],
          status: {
            in: [
              DuelStatus.SCHEDULED,
              DuelStatus.BOOKING_OPEN,
              DuelStatus.BOOKING_CLOSED,
            ],
          },
        },
        data: { status: DuelStatus.CANCELED },
      });

      await this.logAction(
        tx,
        'ADMIN_DEACTIVATE_CAR',
        'Car',
        id,
        { active: false },
        audit,
      );
      return { id, active: false };
    });
  }

  async listDuels() {
    return this.prisma.duel.findMany({
      orderBy: { startsAt: 'asc' },
      include: {
        event: true,
        leftCar: { include: { driver: true } },
        rightCar: { include: { driver: true } },
      },
    });
  }

  async createDuel(payload: CreateDuelDto, audit: AuditContext = {}) {
    if (payload.leftCarId === payload.rightCarId) {
      throw new BadRequestException('Carros do embate devem ser diferentes');
    }

    const [event, leftCar, rightCar] = await Promise.all([
      this.prisma.event.findUnique({ where: { id: payload.eventId } }),
      this.prisma.car.findUnique({ where: { id: payload.leftCarId } }),
      this.prisma.car.findUnique({ where: { id: payload.rightCarId } }),
    ]);

    if (!event || !leftCar || !rightCar) {
      throw new BadRequestException('Evento ou carros inválidos');
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.duel.create({
        data: {
          eventId: payload.eventId,
          leftCarId: payload.leftCarId,
          rightCarId: payload.rightCarId,
          startsAt: new Date(payload.startsAt),
          bookingCloseAt: new Date(payload.bookingCloseAt),
          status: payload.status,
          notes: payload.notes,
        },
        include: {
          event: true,
          leftCar: { include: { driver: true } },
          rightCar: { include: { driver: true } },
        },
      });

      await this.logAction(
        tx,
        'ADMIN_CREATE_DUEL',
        'Duel',
        created.id,
        {
          event: created.event.name,
          leftCar: created.leftCar.name,
          rightCar: created.rightCar.name,
          status: created.status,
        },
        audit,
      );

      return created;
    });
  }

  async updateDuel(
    id: string,
    payload: UpdateDuelDto,
    audit: AuditContext = {},
  ) {
    const existing = await this.prisma.duel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Embate não encontrado');

    if (
      payload.leftCarId &&
      payload.rightCarId &&
      payload.leftCarId === payload.rightCarId
    ) {
      throw new BadRequestException('Carros do embate devem ser diferentes');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.duel.update({
        where: { id },
        data: {
          eventId: payload.eventId,
          leftCarId: payload.leftCarId,
          rightCarId: payload.rightCarId,
          startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
          bookingCloseAt: payload.bookingCloseAt
            ? new Date(payload.bookingCloseAt)
            : undefined,
          status: payload.status,
          notes: payload.notes,
        },
        include: {
          event: true,
          leftCar: { include: { driver: true } },
          rightCar: { include: { driver: true } },
        },
      });

      await this.logAction(tx, 'ADMIN_UPDATE_DUEL', 'Duel', id, payload, audit);
      return updated;
    });
  }

  async deleteDuel(id: string, audit: AuditContext = {}) {
    const existing = await this.prisma.duel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Embate não encontrado');

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.duel.update({
        where: { id },
        data: { status: DuelStatus.CANCELED },
      });
      await this.logAction(
        tx,
        'ADMIN_CANCEL_DUEL',
        'Duel',
        id,
        { previousStatus: existing.status, nextStatus: DuelStatus.CANCELED },
        audit,
      );
      return { id: updated.id, status: updated.status };
    });

    // Tira o duelo cancelado do engine na hora (card "AO VIVO" / /apostas).
    this.marketService.removeDuel(id);
    return result;
  }

  async listSettings() {
    return this.prisma.globalSetting.findMany({
      orderBy: { key: 'asc' },
      include: {
        updatedBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  async upsertSetting(payload: UpsertSettingDto, audit: AuditContext = {}) {
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.globalSetting.upsert({
        where: { key: payload.key.trim() },
        update: {
          value: payload.value,
          description: payload.description,
          updatedById: audit.actorUserId,
        },
        create: {
          key: payload.key.trim(),
          value: payload.value,
          description: payload.description,
          updatedById: audit.actorUserId,
        },
      });

      await this.logAction(
        tx,
        'ADMIN_UPSERT_SETTING',
        'GlobalSetting',
        saved.id,
        { key: saved.key, value: saved.value },
        audit,
      );
      return saved;
    });
  }

  async deleteSetting(id: string, audit: AuditContext = {}) {
    const existing = await this.prisma.globalSetting.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Configuração não encontrada');

    return this.prisma.$transaction(async (tx) => {
      await tx.globalSetting.delete({ where: { id } });
      await this.logAction(
        tx,
        'ADMIN_DELETE_SETTING',
        'GlobalSetting',
        id,
        { key: existing.key },
        audit,
      );
      return { id };
    });
  }

  async getAnalyticsOverview() {
    const [dashboard, profitability, engagement] = await Promise.all([
      this.getDashboardSummary(),
      this.getProfitabilityReport(),
      this.getUserEngagementMetrics(),
    ]);

    return {
      dashboard,
      profitability,
      engagement,
      generatedAt: new Date().toISOString(),
    };
  }

  async getProfitabilityReport() {
    const [allBets, wonBets, refundedLedger, wonLedger] = await Promise.all([
      this.prisma.bet.aggregate({
        _sum: { stake: true },
        _count: { _all: true },
      }),
      this.prisma.bet.aggregate({
        where: { status: 'WON' },
        _sum: { potentialWin: true },
        _count: { _all: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { type: WalletTransactionType.BET_REFUND },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { type: WalletTransactionType.BET_WON },
        _sum: { amount: true },
      }),
    ]);

    const grossStake = Number(allBets._sum.stake ?? 0);
    const predictedPayout = Number(wonBets._sum.potentialWin ?? 0);
    const paidOut = Number(wonLedger._sum.amount ?? 0);
    const refunded = Number(refundedLedger._sum.amount ?? 0);
    const net = grossStake - paidOut - refunded;
    const margin = grossStake > 0 ? (net / grossStake) * 100 : 0;

    return {
      totalBets: allBets._count._all,
      wonBets: wonBets._count._all,
      grossStake,
      predictedPayout,
      paidOut,
      refunded,
      net,
      marginPercent: Number(margin.toFixed(2)),
    };
  }

  async getEventPerformance(limit = 20) {
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);

    const rows = await this.prisma.$queryRaw<
      Array<{
        eventId: string;
        eventName: string;
        startsAt: Date;
        betsCount: bigint;
        totalStake: Prisma.Decimal;
      }>
    >`
      SELECT
        e.id AS "eventId",
        e.name AS "eventName",
        e."startAt" AS "startsAt",
        COUNT(DISTINCT b.id)::bigint AS "betsCount",
        COALESCE(SUM(b.stake), 0) AS "totalStake"
      FROM "Event" e
      LEFT JOIN "Market" m ON m."eventId" = e.id
      LEFT JOIN "Odd" o ON o."marketId" = m.id
      LEFT JOIN "BetItem" bi ON bi."oddId" = o.id
      LEFT JOIN "Bet" b ON b.id = bi."betId"
      GROUP BY e.id, e.name, e."startAt"
      ORDER BY "totalStake" DESC
      LIMIT ${normalizedLimit}
    `;

    return rows.map((row) => ({
      eventId: row.eventId,
      eventName: row.eventName,
      startsAt: row.startsAt,
      betsCount: Number(row.betsCount ?? 0),
      totalStake: Number(row.totalStake ?? 0),
    }));
  }

  async getUserEngagementMetrics() {
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      newUsers7d,
      newUsers30d,
      bets30d,
      activeBettors30d,
      activeDepositors30d,
    ] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: d7 } } }),
      this.prisma.user.count({ where: { createdAt: { gte: d30 } } }),
      this.prisma.bet.count({ where: { createdAt: { gte: d30 } } }),
      this.prisma.bet.findMany({
        where: { createdAt: { gte: d30 } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.payment.findMany({
        where: { createdAt: { gte: d30 }, type: PaymentType.DEPOSIT },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    const activeBettors = activeBettors30d.length;
    const betsPerActiveUser = activeBettors > 0 ? bets30d / activeBettors : 0;

    return {
      newUsers7d,
      newUsers30d,
      bets30d,
      activeBettors30d: activeBettors,
      activeDepositors30d: activeDepositors30d.length,
      betsPerActiveUser: Number(betsPerActiveUser.toFixed(2)),
    };
  }

  async exportAnalytics(query: AnalyticsExportQueryDto) {
    const format = query.format ?? AnalyticsExportFormat.JSON;
    const limit = query.limit ? Number(query.limit) : 200;
    const normalizedLimit = Math.min(Math.max(limit, 1), 2000);

    let rows: Record<string, unknown>[] = [];

    if (query.type === AnalyticsExportType.USERS) {
      const users = await this.prisma.user.findMany({
        take: normalizedLimit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          createdAt: true,
          wallet: { select: { balance: true, currency: true } },
        },
      });

      rows = users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        walletBalance: Number(u.wallet?.balance ?? 0),
        walletCurrency: u.wallet?.currency ?? 'BRL',
      }));
    }

    if (query.type === AnalyticsExportType.EVENTS) {
      const events = await this.getEventPerformance(normalizedLimit);
      rows = events.map((event) => ({
        eventId: event.eventId,
        eventName: event.eventName,
        startsAt: event.startsAt,
        betsCount: event.betsCount,
        totalStake: event.totalStake,
      }));
    }

    if (query.type === AnalyticsExportType.BETS) {
      const bets = await this.prisma.bet.findMany({
        take: normalizedLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true } },
        },
      });

      rows = bets.map((bet) => ({
        id: bet.id,
        userId: bet.userId,
        userEmail: bet.user.email,
        stake: Number(bet.stake),
        potentialWin: Number(bet.potentialWin),
        status: bet.status,
        createdAt: bet.createdAt,
      }));
    }

    if (query.type === AnalyticsExportType.TRANSACTIONS) {
      const txs = await this.prisma.walletTransaction.findMany({
        take: normalizedLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          wallet: { include: { user: { select: { id: true, email: true } } } },
        },
      });

      rows = txs.map((tx) => ({
        id: tx.id,
        userId: tx.wallet.user.id,
        userEmail: tx.wallet.user.email,
        type: tx.type,
        amount: Number(tx.amount),
        reference: tx.reference,
        createdAt: tx.createdAt,
      }));
    }

    const filename = `analytics-${query.type}-${new Date().toISOString().slice(0, 10)}.${format}`;

    if (format === AnalyticsExportFormat.CSV) {
      return {
        format,
        filename,
        data: this.toCsv(rows),
      };
    }

    return {
      format,
      filename,
      data: rows,
    };
  }

  async listAuditLogs(opts: { limit?: number; since?: Date; entity?: string } = {}) {
    const take = Math.min(Math.max(opts.limit ?? 200, 1), 500);
    const where: Prisma.AuditLogWhereInput = {};
    if (opts.since && !Number.isNaN(opts.since.getTime())) {
      where.createdAt = { gte: opts.since };
    }
    if (opts.entity) {
      where.entity = opts.entity;
    }
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        actorUser: {
          select: { id: true, email: true, name: true, role: true },
        },
      },
    });
  }

  // ── Multi-Runner Markets ──

  /**
   * Cria registros `Event` (entidade de apostas) para CategoryEvent/ListEvent/ArmageddonEvent
   * que ainda não tenham vínculo (`eventId === null`). Idempotente — registros já vinculados
   * são ignorados. Útil para regularizar eventos legados antes do auto-link existir.
   */
  async backfillEventLinks(audit: AuditContext = {}) {
    const result = { categoryEvents: 0, listEvents: 0, armageddonEvents: 0 };

    await this.prisma.$transaction(async (tx) => {
      const orphanCategories = await tx.categoryEvent.findMany({
        where: { eventId: null },
        select: { id: true, name: true, description: true, bannerUrl: true, featured: true, scheduledAt: true },
      });
      for (const ce of orphanCategories) {
        const ev = await tx.event.create({
          data: {
            sport: 'DRAG_RACE',
            name: ce.name,
            description: ce.description,
            bannerUrl: ce.bannerUrl,
            featured: ce.featured,
            startAt: ce.scheduledAt,
            status: EventStatus.SCHEDULED,
          },
        });
        await tx.categoryEvent.update({ where: { id: ce.id }, data: { eventId: ev.id } });
        result.categoryEvents += 1;
      }

      const orphanListEvents = await tx.listEvent.findMany({
        where: { eventId: null },
        select: { id: true, name: true, scheduledAt: true, bannerUrl: true, featured: true, list: { select: { name: true } } },
      });
      for (const le of orphanListEvents) {
        const ev = await tx.event.create({
          data: {
            sport: 'DRAG_RACE',
            name: `${le.list.name} — ${le.name}`,
            bannerUrl: le.bannerUrl,
            featured: le.featured,
            startAt: le.scheduledAt,
            status: EventStatus.SCHEDULED,
          },
        });
        await tx.listEvent.update({ where: { id: le.id }, data: { eventId: ev.id } });
        result.listEvents += 1;
      }

      const orphanArma = await tx.armageddonEvent.findMany({
        where: { eventId: null },
        select: { id: true, name: true, description: true, bannerUrl: true, featured: true, scheduledAt: true },
      });
      for (const ae of orphanArma) {
        const ev = await tx.event.create({
          data: {
            sport: 'DRAG_RACE',
            name: ae.name,
            description: ae.description,
            bannerUrl: ae.bannerUrl,
            featured: ae.featured,
            startAt: ae.scheduledAt,
            status: EventStatus.SCHEDULED,
          },
        });
        await tx.armageddonEvent.update({ where: { id: ae.id }, data: { eventId: ev.id } });
        result.armageddonEvents += 1;
      }

      await this.logAction(tx, 'ADMIN_BACKFILL_EVENT_LINKS', 'Event', null, result, audit);
    });

    return result;
  }

  async listMultiRunnerMarkets(eventId?: string) {
    const markets = await this.prisma.market.findMany({
      where: {
        type: { not: MarketType.DUEL },
        ...(eventId ? { eventId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { id: true, name: true } },
        odds: { orderBy: { createdAt: 'asc' } },
      },
    });
    return this.attachOddPools(markets);
  }

  /**
   * Anexa pool/tickets (derivados do banco) a cada odd de mercados multi-runner.
   * Mercados DUEL ficam intactos — o pote deles vem do DuelPoolState, como sempre.
   * Apostas OPEN contam para mercados vivos; WON/LOST para os já liquidados
   * (assim o pote por opção continua visível depois da auditoria).
   */
  private async attachOddPools<
    T extends { id: string; type: MarketType; status: MarketStatus; odds: Array<{ id: string }> },
  >(markets: T[]): Promise<Array<T & { odds: Array<T['odds'][number] & { pool?: number; tickets?: number }> }>> {
    const liveOddIds: string[] = [];
    const settledOddIds: string[] = [];
    for (const m of markets) {
      if (m.type === MarketType.DUEL) continue;
      const target = m.status === MarketStatus.SETTLED ? settledOddIds : liveOddIds;
      for (const o of m.odds) target.push(o.id);
    }

    const [livePools, settledPools] = await Promise.all([
      aggregatePoolsByOdd(this.prisma, liveOddIds, [BetStatus.OPEN]),
      aggregatePoolsByOdd(this.prisma, settledOddIds, [BetStatus.WON, BetStatus.LOST]),
    ]);

    return markets.map((m) => {
      if (m.type === MarketType.DUEL) return m;
      const source = m.status === MarketStatus.SETTLED ? settledPools : livePools;
      return {
        ...m,
        odds: m.odds.map((o) => {
          const agg = source.get(o.id);
          return { ...o, pool: agg?.pool ?? 0, tickets: agg?.tickets ?? 0 };
        }),
      };
    });
  }

  /**
   * Listagem para o painel "Mercados ao vivo": TODOS os mercados não-finalizados
   * (OPEN/CLOSED/SUSPENDED), inclusive os de duelo (Passadas). Inclui o
   * DuelPoolState pra cálculo do pote no frontend.
   *
   * `listMultiRunnerMarkets` (acima) é mantido só pra criação de mercados
   * multi-runner no admin de eventos.
   */
  async listLiveMarkets(eventId?: string, settledWithinHours?: number) {
    // Opcionalmente inclui mercados AUDITADOS recentes (settledWithinHours,
    // cap 72h) — o Modo Pista mostra pro auditor o que já foi liquidado hoje.
    const liveStatuses = [MarketStatus.OPEN, MarketStatus.CLOSED, MarketStatus.SUSPENDED];
    const hours = settledWithinHours && settledWithinHours > 0 ? Math.min(settledWithinHours, 72) : null;
    const statusWhere: Prisma.MarketWhereInput = hours
      ? {
          OR: [
            { status: { in: liveStatuses } },
            { status: MarketStatus.SETTLED, updatedAt: { gte: new Date(Date.now() - hours * 3_600_000) } },
          ],
        }
      : { status: { in: liveStatuses } };

    const markets = await this.prisma.market.findMany({
      where: {
        ...statusWhere,
        ...(eventId ? { eventId } : {}),
        // Não mostra resíduos de eventos já finalizados/cancelados (mercados
        // "vivos" que sobraram de embates passados). Só eventos ativos entram
        // no Modo Pista / Mercados ao vivo.
        event: { status: { notIn: [EventStatus.FINISHED, EventStatus.CANCELED] } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { id: true, name: true, startAt: true, status: true } },
        odds: { orderBy: { createdAt: 'asc' } },
        // isCustom permite o front distinguir embate personalizado de rápido
        // quando o duelo não tem matchup de origem.
        duel: { select: { poolState: true, isCustom: true } },
      },
    });

    // Enriquece com origem (Lista/Armageddon/Copa) + matchupId + posição dos
    // pilotos + contexto legível ("Chave B · R2"). O matchupId é o que os
    // endpoints de abrir/fechar/auditar da origem recebem — sem ele o auditor
    // precisa abrir outra aba e cruzar manualmente.
    // Potes por opção dos mercados multi-runner (o pote dos DUEL vem do poolState).
    const withPools = await this.attachOddPools(markets);

    const duelIds = withPools.map((m) => m.duelId).filter((id): id is string => !!id);
    if (duelIds.length === 0) {
      return withPools.map((m) => ({ ...m, matchupOrigin: null as MatchupOrigin | null }));
    }

    const [listMatchups, armaMatchups, categoryMatchups] = await Promise.all([
      this.prisma.listMatchup.findMany({
        where: { duelId: { in: duelIds } },
        select: { id: true, duelId: true, listEventId: true, leftPosition: true, rightPosition: true, roundNumber: true, roundType: true },
      }),
      this.prisma.armageddonMatchup.findMany({
        where: { duelId: { in: duelIds } },
        select: {
          id: true, duelId: true, eventId: true, leftPosition: true, rightPosition: true,
          roundNumber: true, stage: true, bracketKey: true, isFinal: true, isThirdPlace: true,
        },
      }),
      this.prisma.categoryMatchup.findMany({
        where: { duelId: { in: duelIds } },
        select: { id: true, duelId: true, roundNumber: true, position: true, isSuperFinal: true, bracket: { select: { category: true, categoryEventId: true } } },
      }),
    ]);

    const originByDuel = new Map<string, MatchupOrigin>();
    for (const m of listMatchups) {
      if (m.duelId) {
        originByDuel.set(m.duelId, {
          type: 'LIST',
          matchupId: m.id,
          originEventId: m.listEventId,
          leftPosition: m.leftPosition,
          rightPosition: m.rightPosition,
          context: m.roundType === 'SHARK_TANK' ? 'Shark Tank' : `Rodada ${m.roundNumber}`,
        });
      }
    }
    for (const m of armaMatchups) {
      if (m.duelId) {
        const context = m.isFinal ? 'Final'
          : m.isThirdPlace ? '3º lugar'
          : m.bracketKey ? `Chave ${m.bracketKey} · R${m.roundNumber}`
          : m.stage === 'SECOND_DRAW' ? `Top 32 · R${m.roundNumber}`
          : `R${m.roundNumber}`;
        originByDuel.set(m.duelId, {
          type: 'ARMAGEDDON',
          matchupId: m.id,
          originEventId: m.eventId,
          leftPosition: m.leftPosition,
          rightPosition: m.rightPosition,
          context,
        });
      }
    }
    for (const m of categoryMatchups) {
      if (m.duelId) {
        const cat = m.bracket ? TIME_CATEGORY_LABEL[m.bracket.category] ?? m.bracket.category : null;
        const stage = m.isSuperFinal ? 'Super Final' : `R${m.roundNumber} · Jogo ${m.position}`;
        originByDuel.set(m.duelId, {
          type: 'CATEGORY',
          matchupId: m.id,
          originEventId: m.bracket?.categoryEventId ?? '',
          leftPosition: null,
          rightPosition: null,
          context: cat ? `${cat} · ${stage}` : stage,
        });
      }
    }

    return withPools.map((m) => ({
      ...m,
      matchupOrigin: m.duelId ? originByDuel.get(m.duelId) ?? null : null,
    }));
  }

  /**
   * Resumo financeiro completo de um mercado multi-runner — o "fechamento" que
   * o painel admin mostra antes (projeção por cenário) e depois (real) da
   * auditoria. A casa nunca paga do próprio bolso: ver invariante documentada
   * em multi-market-financials.ts.
   */
  async getMultiRunnerMarketSummary(marketId: string) {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      include: {
        event: { select: { id: true, name: true } },
        odds: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!market) throw new NotFoundException('Mercado não encontrado');
    if (market.type === MarketType.DUEL) {
      throw new BadRequestException('Use o fluxo de duelos para mercados do tipo DUEL');
    }

    const settled = market.status === MarketStatus.SETTLED;
    const countedStatuses: BetStatus[] = settled ? [BetStatus.WON, BetStatus.LOST] : [BetStatus.OPEN];

    // Apostas do mercado (deduplicadas por bet) — base de tudo.
    const betItems = await this.prisma.betItem.findMany({
      where: { oddId: { in: market.odds.map((o) => o.id) } },
      include: {
        bet: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const seen = new Set<string>();
    const bets: Array<{
      betId: string;
      oddId: string;
      stake: number;
      status: BetStatus;
      payout: number;
      userName: string;
      userEmail: string;
      createdAt: Date;
    }> = [];
    for (const item of betItems) {
      if (seen.has(item.betId)) continue;
      seen.add(item.betId);
      const b = item.bet;
      if (!countedStatuses.includes(b.status)) continue;
      bets.push({
        betId: b.id,
        oddId: item.oddId,
        stake: Number(b.stake),
        status: b.status,
        payout: b.status === BetStatus.WON ? Number(b.potentialWin) : 0,
        userName: b.user.name,
        userEmail: b.user.email,
        createdAt: b.createdAt,
      });
    }

    const rakePercent = HOUSE_MARGIN_PERCENT;
    const runnersInput = market.odds.map((odd) => {
      const mine = bets.filter((b) => b.oddId === odd.id);
      return {
        oddId: odd.id,
        label: odd.label,
        pool: mine.reduce((s, b) => s + b.stake, 0),
        tickets: mine.length,
      };
    });
    const financials = computeMultiMarketFinancials(runnersInput, rakePercent);

    // Afiliados ficam FORA do sistema: o único afiliado é pago à mão (10% do
    // lucro da casa) após o evento. Dashboards/relatórios não exibem comissão —
    // o "lucro da casa" mostrado é a margem realizada (pote − prêmios pagos).

    const base = {
      marketId: market.id,
      name: market.name,
      type: market.type,
      status: market.status,
      eventId: market.eventId,
      eventName: market.event.name,
      bookingCloseAt: market.bookingCloseAt,
      settledAt: market.settledAt,
      winnerOddId: market.winnerOddId,
      financials,
    };

    if (!settled) return { ...base, settlement: null };

    const winnerOdd = market.odds.find((o) => o.id === market.winnerOddId) ?? null;
    const winners = bets
      .filter((b) => b.status === BetStatus.WON)
      .sort((a, b) => b.payout - a.payout)
      .map((b) => ({
        betId: b.betId,
        userName: b.userName,
        userEmail: b.userEmail,
        stake: Number(b.stake.toFixed(2)),
        payout: Number(b.payout.toFixed(2)),
      }));

    const totalPayout = Number(winners.reduce((s, w) => s + w.payout, 0).toFixed(2));
    const rakeCollected = Number((financials.totalPool * (rakePercent / 100)).toFixed(2));
    // Lucro da casa = margem REALIZADA: tudo que entrou menos os prêmios pagos.
    // Sempre >= 0 (a casa nunca paga do próprio bolso). É sobre ESTE número que
    // os 10% do afiliado único são calculados à mão, fora do sistema.
    const houseNetProfit = Number(
      (financials.totalPool - totalPayout).toFixed(2),
    );

    return {
      ...base,
      settlement: {
        winnerOddId: market.winnerOddId,
        winnerLabel: winnerOdd?.label ?? null,
        totalPool: financials.totalPool,
        rakeCollected,
        totalPayout,
        houseNetProfit,
        winningBets: winners.length,
        losingBets: bets.filter((b) => b.status === BetStatus.LOST).length,
        winners,
      },
    };
  }

  /**
   * "Reiniciar evento": refund de todas as apostas em aberto + reset dos pools
   * dos duelos vinculados + reabertura dos mercados. O evento volta ao estado
   * inicial (como se tivesse acabado de abrir), preservando a estrutura
   * (matchups, mercados e odds).
   *
   * NÃO afeta mercados já SETTLED (auditados) — esses ficam imutáveis.
   */
  async restartEvent(eventId: string, audit: AuditContext = {}) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        markets: { include: { odds: true } },
        duels: { select: { id: true } },
      },
    });
    if (!event) throw new NotFoundException('Evento não encontrado');

    // 1. Anular cada mercado não-SETTLED (refund das apostas em aberto).
    // voidMarket cuida do refund integral via SettlementService — não recriar a roda aqui.
    const marketIds = event.markets
      .filter((m) => m.status !== MarketStatus.SETTLED)
      .map((m) => m.id);

    for (const marketId of marketIds) {
      try {
        await this.settlementService.voidMarket(marketId, audit);
      } catch (e) {
        this.logger.warn(
          `restartEvent: falha ao anular mercado ${marketId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    // 2. Resetar pools e reabrir tudo numa transação só.
    await this.prisma.$transaction(async (tx) => {
      // Pools dos duelos: zerar leftPool/rightPool/leftTickets/rightTickets
      const duelIds = event.duels.map((d) => d.id);
      if (duelIds.length > 0) {
        await tx.duelPoolState.updateMany({
          where: { duelId: { in: duelIds } },
          data: { leftPool: 0, rightPool: 0, leftTickets: 0, rightTickets: 0 },
        });
        // Duels voltam a BOOKING_OPEN se estavam fechados/finalizados (não tocar nos CANCELED)
        await tx.duel.updateMany({
          where: {
            id: { in: duelIds },
            status: { in: [DuelStatus.BOOKING_CLOSED, DuelStatus.FINISHED] },
          },
          data: { status: DuelStatus.BOOKING_OPEN, bookingCloseAt: new Date(Date.now() + 6 * 60 * 60 * 1000) },
        });
      }

      // Mercados voltam a OPEN (voidMarket fechou — agora reabre)
      if (marketIds.length > 0) {
        await tx.market.updateMany({
          where: { id: { in: marketIds } },
          data: {
            status: MarketStatus.OPEN,
            winnerOddId: null,
            settledAt: null,
            bookingCloseAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
          },
        });
        await tx.odd.updateMany({
          where: { marketId: { in: marketIds } },
          data: { status: OddStatus.ACTIVE },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: 'EVENT_RESTART',
          entity: 'Event',
          entityId: eventId,
          payload: {
            refundedMarkets: marketIds.length,
            resetDuels: duelIds.length,
          } as Prisma.InputJsonValue,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });
    });

    // 3. Invalida o estado em memória dos multi-mercados afetados (mesmo
    // padrão do settleMarket/voidMarket). Sem isto, até o próximo refresh o
    // motor exibia potes/odds de apostas que acabaram de ser reembolsadas — e
    // aceitava apostas precificadas nesses potes fantasmas.
    for (const m of event.markets) {
      if (m.type !== MarketType.DUEL && marketIds.includes(m.id)) {
        this.multiRunnerService.removeMarket(m.id);
      }
    }

    return {
      eventId,
      refundedMarkets: marketIds.length,
      resetDuels: event.duels.length,
    };
  }

  async createMultiRunnerMarket(
    payload: { eventId: string; name: string; type: string; runners: string[]; rakePercent?: number; bookingCloseAt?: string; duelId?: string },
    audit: AuditContext = {},
  ) {
    const event = await this.prisma.event.findUnique({ where: { id: payload.eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');

    if (!payload.runners || payload.runners.length < 2) {
      throw new BadRequestException('Informe pelo menos 2 opções/pilotos');
    }

    const validTypes: Record<string, MarketType> = {
      WINNER: MarketType.WINNER,
      BEST_REACTION: MarketType.BEST_REACTION,
      FALSE_START: MarketType.FALSE_START,
    };

    const marketType = validTypes[payload.type];
    if (!marketType) {
      throw new BadRequestException('Tipo de mercado inválido. Use: WINNER, BEST_REACTION ou FALSE_START');
    }

    return this.prisma.$transaction(async (tx) => {
      const market = await tx.market.create({
        data: {
          eventId: payload.eventId,
          name: payload.name.trim(),
          type: marketType,
          status: MarketStatus.OPEN,
          rakePercent: payload.rakePercent ? new Prisma.Decimal(payload.rakePercent) : null,
          bookingCloseAt: payload.bookingCloseAt ? new Date(payload.bookingCloseAt) : null,
          duelId: payload.duelId || null,
          odds: {
            create: payload.runners.map((label) => ({
              label: label.trim(),
              value: new Prisma.Decimal(1),
              status: OddStatus.ACTIVE,
            })),
          },
        },
        include: { odds: true, event: { select: { id: true, name: true } } },
      });

      await this.logAction(tx, 'ADMIN_CREATE_MARKET', 'Market', market.id, {
        name: market.name,
        type: market.type,
        runners: payload.runners,
      }, audit);

      return market;
    });
  }

  async updateMultiRunnerMarket(
    id: string,
    payload: { name?: string; status?: string; rakePercent?: number; bookingCloseAt?: string },
    audit: AuditContext = {},
  ) {
    // Transições de status permitidas via PATCH. SETTLED fica de fora dos dois
    // lados: mercado liquidado é IMUTÁVEL (ganhadores já receberam) — reverter
    // status reabriria apostas num mercado pago e permitiria dupla liquidação.
    // Para estornar um settle existe o fluxo próprio (refundSettledMarket).
    const ALLOWED_STATUS: MarketStatus[] = [MarketStatus.OPEN, MarketStatus.SUSPENDED, MarketStatus.CLOSED];

    let targetStatus: MarketStatus | undefined;
    if (payload.status !== undefined) {
      targetStatus = ALLOWED_STATUS.find((s) => s === payload.status);
      if (!targetStatus) {
        throw new BadRequestException('Status inválido. Use OPEN, SUSPENDED ou CLOSED');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Lock da linha: evita corrida com uma liquidação concorrente (operador A
      // audita enquanto o painel desatualizado do operador B clica em "Pausar").
      const locked = await tx.$queryRaw<Array<{ id: string; status: string; type: string }>>`
        SELECT id, status, type FROM "Market" WHERE id = ${id} FOR UPDATE
      `.then((rows) => rows[0] ?? null);
      if (!locked) throw new NotFoundException('Mercado não encontrado');

      if (targetStatus && locked.type === 'DUEL') {
        throw new BadRequestException('Status de mercado de duelo é controlado pela aba de origem (Listas/Copa/Armageddon)');
      }
      if (targetStatus && locked.status === 'SETTLED') {
        throw new BadRequestException('Mercado já liquidado não pode mudar de status. Use o estorno de liquidação se precisar reverter.');
      }

      const data: Prisma.MarketUpdateInput = {};
      if (payload.name) data.name = payload.name.trim();
      if (targetStatus) data.status = targetStatus;
      if (payload.rakePercent !== undefined) data.rakePercent = new Prisma.Decimal(payload.rakePercent);
      if (payload.bookingCloseAt) data.bookingCloseAt = new Date(payload.bookingCloseAt);

      const updated = await tx.market.update({ where: { id }, data, include: { odds: true } });

      // Reabrir um mercado FECHADO (inclusive um anulado, que fecha odds junto)
      // precisa reativar as odds — senão o motor recarrega o mercado sem
      // nenhuma opção apostável.
      if (targetStatus === MarketStatus.OPEN) {
        await tx.odd.updateMany({
          where: { marketId: id, status: OddStatus.CLOSED },
          data: { status: OddStatus.ACTIVE },
        });
      }

      await this.logAction(tx, 'ADMIN_UPDATE_MARKET', 'Market', id, payload, audit);
      return updated;
    });
  }

  async settleMarket(marketId: string, winnerOddId: string, audit: AuditContext = {}) {
    const result = await this.settlementService.settleMarket(marketId, winnerOddId, audit);
    this.multiRunnerService.removeMarket(marketId);
    return result;
  }

  async voidMarket(marketId: string, audit: AuditContext = {}) {
    const result = await this.settlementService.voidMarket(marketId, audit);
    this.multiRunnerService.removeMarket(marketId);
    return result;
  }

  /**
   * Reabre um mercado JÁ AUDITADO: estorna a liquidação (refund dos stakes,
   * reversão dos pagamentos, mercado volta a OPEN). Cobre embate rápido,
   * personalizado, multi-mercado, Copa e Lista (o refundSettledMarket também
   * desfaz o swap de roster da Lista). Para Armageddon use o reopen da origem
   * (armageddon/matchups/:id/reopen), que reverte o avanço de chave em cascata.
   */
  async reopenSettledMarket(marketId: string, audit: AuditContext = {}) {
    const result = await this.settlementService.refundSettledMarket(marketId, audit);
    // Recarrega os engines em memória para o mercado reaberto (agora OPEN) voltar
    // ao ar no /apostas: drop do estado multi-runner liquidado + refresh dos
    // duelos (o Modo Pista já lê do banco, então lá é imediato).
    this.multiRunnerService.removeMarket(marketId);
    await this.marketService.refreshNow().catch(() => undefined);
    return result;
  }

  async settleDuel(duelId: string, winningSide: 'LEFT' | 'RIGHT', audit: AuditContext = {}) {
    const result = await this.settlementService.settleDuel(duelId, winningSide, audit);
    this.marketService.removeDuel(duelId);
    return result;
  }

  // ── Affiliates ──

  async listAffiliates() {
    return this.prisma.affiliate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { referredUsers: true, commissions: true } },
        commissions: { select: { amount: true } },
      },
    });
  }

  async createAffiliate(
    payload: { name: string; code: string; commissionPct: number },
    audit: AuditContext = {},
  ) {
    const existing = await this.prisma.affiliate.findUnique({ where: { code: payload.code } });
    if (existing) throw new ConflictException('Código de afiliado já existe');

    return this.prisma.$transaction(async (tx) => {
      const affiliate = await tx.affiliate.create({
        data: {
          name: payload.name.trim(),
          code: payload.code.trim().toUpperCase(),
          commissionPct: new Prisma.Decimal(payload.commissionPct),
        },
      });

      await this.logAction(tx, 'ADMIN_CREATE_AFFILIATE', 'Affiliate', affiliate.id, {
        name: affiliate.name, code: affiliate.code, commissionPct: payload.commissionPct,
      }, audit);

      return affiliate;
    });
  }

  async updateAffiliate(
    id: string,
    payload: { name?: string; code?: string; commissionPct?: number; active?: boolean },
    audit: AuditContext = {},
  ) {
    const existing = await this.prisma.affiliate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Afiliado não encontrado');

    if (payload.code) {
      const dup = await this.prisma.affiliate.findUnique({ where: { code: payload.code } });
      if (dup && dup.id !== id) throw new ConflictException('Código de afiliado já existe');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.affiliate.update({
        where: { id },
        data: {
          name: payload.name?.trim(),
          code: payload.code?.trim().toUpperCase(),
          commissionPct: payload.commissionPct !== undefined ? new Prisma.Decimal(payload.commissionPct) : undefined,
          active: payload.active,
        },
      });
      await this.logAction(tx, 'ADMIN_UPDATE_AFFILIATE', 'Affiliate', id, payload, audit);
      return updated;
    });
  }

  async deleteAffiliate(id: string, audit: AuditContext = {}) {
    const existing = await this.prisma.affiliate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Afiliado não encontrado');

    return this.prisma.$transaction(async (tx) => {
      await tx.affiliate.update({ where: { id }, data: { active: false } });
      await this.logAction(tx, 'ADMIN_DEACTIVATE_AFFILIATE', 'Affiliate', id, { active: false }, audit);
      return { id, active: false };
    });
  }

  async getAffiliateCommissions(affiliateId: string) {
    return this.prisma.affiliateCommission.findMany({
      where: { affiliateId },
      orderBy: { createdAt: 'desc' },
      include: {
        bet: { select: { id: true, stake: true, status: true, userId: true } },
        market: { select: { id: true, name: true, type: true } },
      },
    });
  }

  // ── Promoções (QR Code do panfleto) ──

  /** Normaliza o código da campanha para um slug seguro pro link (/login?promo=<code>). */
  private slugifyPromoCode(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // remove acentos (combining marks)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async listPromotions() {
    const campaigns = await this.prisma.promoCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { enrollments: true } },
        enrollments: { select: { bonusStatus: true, bonusAmount: true } },
      },
    });
    return campaigns.map(({ enrollments, _count, ...rest }) => {
      const granted = enrollments.filter((e) => e.bonusStatus === 'GRANTED');
      return {
        ...rest,
        enrolledCount: _count.enrollments,
        grantedCount: granted.length,
        totalPaidOut: granted.reduce((s, e) => s + Number(e.bonusAmount ?? 0), 0),
      };
    });
  }

  async createPromotion(
    payload: { name: string; code?: string; bonusAmount?: number; minDeposit?: number },
    audit: AuditContext = {},
  ) {
    const name = payload.name?.trim();
    if (!name) throw new BadRequestException('Nome da campanha é obrigatório');
    const code = this.slugifyPromoCode(payload.code?.trim() || name);
    if (!code) throw new BadRequestException('Código inválido — use letras ou números');

    const existing = await this.prisma.promoCampaign.findUnique({ where: { code } });
    if (existing) throw new ConflictException('Já existe uma campanha com esse código');

    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.promoCampaign.create({
        data: {
          name,
          code,
          bonusAmount:
            payload.bonusAmount !== undefined ? new Prisma.Decimal(payload.bonusAmount) : undefined,
          minDeposit:
            payload.minDeposit !== undefined ? new Prisma.Decimal(payload.minDeposit) : undefined,
        },
      });
      await this.logAction(tx, 'ADMIN_CREATE_PROMOTION', 'PromoCampaign', campaign.id, {
        name, code, bonusAmount: payload.bonusAmount, minDeposit: payload.minDeposit,
      }, audit);
      return campaign;
    });
  }

  async updatePromotion(
    id: string,
    payload: { name?: string; code?: string; bonusAmount?: number; minDeposit?: number; active?: boolean },
    audit: AuditContext = {},
  ) {
    const existing = await this.prisma.promoCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campanha não encontrada');

    let code: string | undefined;
    if (payload.code !== undefined) {
      code = this.slugifyPromoCode(payload.code);
      if (!code) throw new BadRequestException('Código inválido — use letras ou números');
      const dup = await this.prisma.promoCampaign.findUnique({ where: { code } });
      if (dup && dup.id !== id) throw new ConflictException('Já existe uma campanha com esse código');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.promoCampaign.update({
        where: { id },
        data: {
          name: payload.name?.trim(),
          code,
          bonusAmount:
            payload.bonusAmount !== undefined ? new Prisma.Decimal(payload.bonusAmount) : undefined,
          minDeposit:
            payload.minDeposit !== undefined ? new Prisma.Decimal(payload.minDeposit) : undefined,
          active: payload.active,
        },
      });
      await this.logAction(tx, 'ADMIN_UPDATE_PROMOTION', 'PromoCampaign', id, payload, audit);
      return updated;
    });
  }

  async deletePromotion(id: string, audit: AuditContext = {}) {
    const existing = await this.prisma.promoCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campanha não encontrada');
    return this.prisma.$transaction(async (tx) => {
      await tx.promoCampaign.update({ where: { id }, data: { active: false } });
      await this.logAction(tx, 'ADMIN_DEACTIVATE_PROMOTION', 'PromoCampaign', id, { active: false }, audit);
      return { id, active: false };
    });
  }

  /** Todos os usuários inscritos via QR dessa campanha + status do bônus. */
  async getPromotionEnrollments(campaignId: string) {
    const campaign = await this.prisma.promoCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    return this.prisma.promoEnrollment.findMany({
      where: { campaignId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, createdAt: true } },
      },
    });
  }

  // ── Profit Dashboard ──

  async getProfitByMarket() {
    const settledMarkets = await this.prisma.market.findMany({
      where: { status: MarketStatus.SETTLED },
      orderBy: { settledAt: 'desc' },
      include: {
        event: { select: { name: true } },
        odds: { select: { id: true, label: true } },
      },
    });

    const results: Array<{
      marketId: string; marketName: string; marketType: string; eventName: string;
      winnerLabel: string; totalPool: number; rakePercent: number; rakeCollected: number;
      netProfit: number; settledAt: Date | null;
    }> = [];
    for (const market of settledMarkets) {
      // Pote e prêmios pagos a partir das apostas (deduplicadas por bet).
      const betItems = await this.prisma.betItem.findMany({
        where: { odd: { marketId: market.id } },
        include: { bet: { select: { id: true, stake: true, status: true, potentialWin: true } } },
      });

      const seenBets = new Set<string>();
      let totalPool = 0;
      let totalPayout = 0;
      for (const bi of betItems) {
        if (seenBets.has(bi.bet.id)) continue;
        seenBets.add(bi.bet.id);
        totalPool += Number(bi.bet.stake);
        if (bi.bet.status === BetStatus.WON) totalPayout += Number(bi.bet.potentialWin);
      }

      // Margem fixa de 20% (HOUSE_MARGIN_PERCENT) — a coluna market.rakePercent é ignorada.
      const rakePercent = HOUSE_MARGIN_PERCENT;
      const rakeCollected = totalPool * (rakePercent / 100);
      // Lucro = margem REALIZADA (pote − prêmios pagos), sempre >= 0. Afiliados ficam
      // fora do sistema (10% do lucro pagos à mão), então não entram no relatório.
      const netProfit = totalPool - totalPayout;
      const winnerOdd = market.odds.find((o) => o.id === market.winnerOddId);

      results.push({
        marketId: market.id,
        marketName: market.name,
        marketType: market.type,
        eventName: market.event.name,
        winnerLabel: winnerOdd?.label ?? '—',
        totalPool,
        rakePercent,
        rakeCollected,
        netProfit,
        settledAt: market.settledAt,
      });
    }

    return results;
  }

  async getProfitSummary() {
    const markets = await this.getProfitByMarket();

    const totalPool = markets.reduce((s, m) => s + m.totalPool, 0);
    const totalRake = markets.reduce((s, m) => s + m.rakeCollected, 0);
    const totalNetProfit = markets.reduce((s, m) => s + m.netProfit, 0);

    return {
      settledMarkets: markets.length,
      totalPool,
      totalRake,
      totalNetProfit,
      averageRakePercent: markets.length > 0 ? totalRake / totalPool * 100 : 0,
    };
  }

  /**
   * Lista combinada de ListEvents + ArmageddonEvents pra alimentar o seletor
   * de "Fechamento por evento" no Relatórios. Retorna mínimo de campos.
   */
  async listClosingEligibleEvents() {
    const [listEvents, armageddonEvents] = await Promise.all([
      this.prisma.listEvent.findMany({
        select: {
          id: true,
          name: true,
          scheduledAt: true,
          endsAt: true,
          status: true,
          list: { select: { name: true } },
        },
        orderBy: { scheduledAt: 'desc' },
        take: 200,
      }),
      this.prisma.armageddonEvent.findMany({
        select: { id: true, name: true, scheduledAt: true, endsAt: true, status: true },
        orderBy: { scheduledAt: 'desc' },
        take: 200,
      }),
    ]);

    const items: Array<{
      id: string;
      name: string;
      source: 'list' | 'armageddon';
      scheduledAt: string;
      endsAt: string | null;
      status: string;
      contextName: string | null;
    }> = [];

    for (const e of listEvents) {
      items.push({
        id: e.id,
        name: e.name,
        source: 'list',
        scheduledAt: e.scheduledAt.toISOString(),
        endsAt: e.endsAt?.toISOString() ?? null,
        status: e.status,
        contextName: e.list.name,
      });
    }
    for (const e of armageddonEvents) {
      items.push({
        id: e.id,
        name: e.name,
        source: 'armageddon',
        scheduledAt: e.scheduledAt.toISOString(),
        endsAt: e.endsAt?.toISOString() ?? null,
        status: e.status,
        contextName: null,
      });
    }

    // Ordena por data desc (mais recente primeiro), combinando os dois.
    items.sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
    return items;
  }

  /**
   * Fechamento financeiro de um evento (Lista ou Armageddon).
   *
   * - Apostas, ganhos, perdas e reembolsos são derivados das bets cujos
   *   `BetItem.oddId` apontam pra mercados vinculados a duels dos matchups do
   *   evento.
   * - Depósitos e saques NÃO têm vínculo direto com evento. Usa-se a janela
   *   temporal `scheduledAt → endsAt ?? scheduledAt+24h` como proxy. Documentar
   *   essa aproximação na UI.
   */
  async getEventFinancialClosing(eventId: string, source: 'list' | 'armageddon') {
    // 1. Evento + janela temporal
    const event =
      source === 'list'
        ? await this.prisma.listEvent.findUnique({
            where: { id: eventId },
            select: { id: true, name: true, scheduledAt: true, endsAt: true, eventId: true },
          })
        : await this.prisma.armageddonEvent.findUnique({
            where: { id: eventId },
            select: { id: true, name: true, scheduledAt: true, endsAt: true, eventId: true },
          });

    if (!event) {
      throw new NotFoundException(
        source === 'list' ? 'ListEvent não encontrado' : 'ArmageddonEvent não encontrado',
      );
    }

    const windowStart = event.scheduledAt;
    const windowEnd = event.endsAt ?? new Date(event.scheduledAt.getTime() + 24 * 60 * 60 * 1000);

    // 2. Matchups do evento → duelIds → mercados → odds → betItems → bets
    const matchups =
      source === 'list'
        ? await this.prisma.listMatchup.findMany({
            where: { listEventId: eventId, duelId: { not: null } },
            select: { duelId: true },
          })
        : await this.prisma.armageddonMatchup.findMany({
            where: { eventId, duelId: { not: null } },
            select: { duelId: true },
          });

    const duelIds = matchups.map((m) => m.duelId).filter((id): id is string => !!id);

    let totalStaked = 0;
    let totalWinnings = 0;
    let totalRefunds = 0;
    let betCount = 0;
    let wonBets = 0;
    let lostBets = 0;
    let lostStake = 0;
    let wonStake = 0;
    const bettors = new Set<string>();
    const marketIdsList: string[] = [];

    // Mercados do evento: tanto os 1x1 dos embates (via duelId) QUANTO os
    // multi-mercados (campeão/classificados/reação/queimada), que são ligados ao
    // Event vinculado e NÃO têm duelId. Sem o ramo do eventId vinculado, o
    // fechamento ignorava o mercado de campeão e zerava as apostas.
    const linkedEventId = event.eventId ?? null;
    const marketFilters: Prisma.MarketWhereInput[] = [];
    if (duelIds.length > 0) marketFilters.push({ duelId: { in: duelIds } });
    if (linkedEventId) marketFilters.push({ eventId: linkedEventId });

    if (marketFilters.length > 0) {
      const markets = await this.prisma.market.findMany({
        where: {
          OR: marketFilters,
          // Só mercados que valem para o fechamento real: abertos agora, suspensos
          // (pausa temporária) e liquidados (resultado real). Mercados CLOSED são
          // anulados/cancelados (apostas reembolsadas) — tipicamente lixo de teste —
          // e NÃO podem inflar o relatório com dados irreais.
          status: { in: [MarketStatus.OPEN, MarketStatus.SUSPENDED, MarketStatus.SETTLED] },
        },
        select: { id: true },
      });
      marketIdsList.push(...markets.map((m) => m.id));

      if (marketIdsList.length > 0) {
        // Pegar betIds DISTINCT que tocaram qualquer odd desses mercados.
        const betItems = await this.prisma.betItem.findMany({
          where: { odd: { marketId: { in: marketIdsList } } },
          select: { betId: true },
          distinct: ['betId'],
        });
        const betIds = betItems.map((b) => b.betId);

        if (betIds.length > 0) {
          const bets = await this.prisma.bet.findMany({
            where: { id: { in: betIds } },
            select: { id: true, userId: true, stake: true, status: true },
          });

          for (const b of bets) {
            betCount++;
            bettors.add(b.userId);
            totalStaked += Number(b.stake);
            if (b.status === 'WON') { wonBets++; wonStake += Number(b.stake); }
            else if (b.status === 'LOST') { lostBets++; lostStake += Number(b.stake); }
          }

          const ledger = await this.prisma.walletTransaction.findMany({
            where: {
              reference: { in: betIds },
              type: { in: [WalletTransactionType.BET_WON, WalletTransactionType.BET_REFUND] },
            },
            select: { type: true, amount: true },
          });
          for (const t of ledger) {
            if (t.type === WalletTransactionType.BET_WON) totalWinnings += Number(t.amount);
            else if (t.type === WalletTransactionType.BET_REFUND) totalRefunds += Number(t.amount);
          }
        }
      }
    }

    // 3. Pagamentos na janela (proxy — não há vínculo direto Payment↔Event).
    const payments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.APPROVED,
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      select: { type: true, amount: true },
    });

    let totalDeposits = 0;
    let totalWithdrawals = 0;
    for (const p of payments) {
      if (p.type === PaymentType.DEPOSIT) totalDeposits += Number(p.amount);
      else if (p.type === PaymentType.WITHDRAW) totalWithdrawals += Number(p.amount);
    }

    // 4. Derivados.
    // Perda dos apostadores = soma do stake das apostas REALMENTE perdedoras
    // (status LOST). Apostas abertas (ainda não liquidadas) NÃO entram — são
    // pendentes, não perda. Sem isso, durante o evento o stake aberto inteiro
    // aparecia como "perda" (dado irreal).
    const totalLosses = lostStake;
    // Margem REALIZADA da casa = o que ela de fato embolsou das apostas já
    // liquidadas: (stake vencedor + stake perdedor) − prêmios pagos. Apostas
    // abertas NÃO entram (margem ainda não realizada); reembolsos se anulam
    // (stake devolvido). Valor real, não estimativa — bate 100% no fechamento,
    // inclusive sob o piso de odd, onde os 20% nominais não se realizam.
    const houseMargin = (wonStake + lostStake) - totalWinnings;

    return {
      eventId,
      eventName: event.name,
      source,
      window: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        note: 'Depósitos/saques são filtrados pela janela temporal do evento (não há vínculo direto).',
      },
      bets: {
        count: betCount,
        uniqueBettors: bettors.size,
        wonBets,
        lostBets,
        totalStaked,
        totalWinnings,
        totalRefunds,
        totalLosses,
        houseMargin,
      },
      payments: {
        totalDeposits,
        totalWithdrawals,
        netCashFlow: totalDeposits - totalWithdrawals,
      },
    };
  }

  private async logAction(
    tx: Prisma.TransactionClient,
    action: string,
    entity: string,
    entityId: string | null,
    payload: unknown,
    audit: AuditContext,
  ) {
    await tx.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action,
        entity,
        entityId,
        payload: payload as Prisma.InputJsonValue,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      },
    });
  }

  private toCsv(rows: Record<string, unknown>[]) {
    if (!rows.length) {
      return '';
    }

    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) => {
      if (value === null || value === undefined) return '';
      const raw =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
      const escaped = raw.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map((key) => escape(row[key])).join(','));
    }
    return lines.join('\n');
  }
}
