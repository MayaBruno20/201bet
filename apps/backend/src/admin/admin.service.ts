import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DuelStatus,
  EventStatus,
  MarketStatus,
  MarketType,
  OddStatus,
  PaymentType,
  Prisma,
  UserRole,
  UserStatus,
  WalletTransactionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { MarketService } from '../market.service';
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

const PRIVILEGED_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.OPERATOR,
  UserRole.AUDITOR,
];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: SettlementService,
    private readonly multiRunnerService: MultiRunnerMarketService,
    private readonly marketService: MarketService,
  ) {}

  async getDashboardSummary() {
    const [
      usersTotal,
      activeUsers,
      eventsTotal,
      duelsTotal,
      openMarkets,
      pendingPayments,
      ledgerVolume,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.event.count(),
      this.prisma.duel.count(),
      this.prisma.market.count({ where: { status: 'OPEN' } }),
      this.prisma.payment.count({ where: { status: 'PENDING' } }),
      this.prisma.walletTransaction.aggregate({ _sum: { amount: true } }),
    ]);

    return {
      usersTotal,
      activeUsers,
      eventsTotal,
      duelsTotal,
      openMarkets,
      pendingPayments,
      ledgerVolume: Number(ledgerVolume._sum.amount ?? 0),
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

    return this.prisma.$transaction(async (tx) => {
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
        },
      });

      await this.logAction(
        tx,
        'ADMIN_CREATE_DRIVER',
        'Driver',
        created.id,
        { name: created.name, nickname: created.nickname },
        audit,
      );
      return created;
    });
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
          active: payload.active,
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

    return this.prisma.$transaction(async (tx) => {
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

  async listAuditLogs(limit = 100) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      include: {
        actorUser: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
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
    return this.prisma.market.findMany({
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
    const existing = await this.prisma.market.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Mercado não encontrado');

    const data: Prisma.MarketUpdateInput = {};
    if (payload.name) data.name = payload.name.trim();
    if (payload.status) data.status = payload.status as MarketStatus;
    if (payload.rakePercent !== undefined) data.rakePercent = new Prisma.Decimal(payload.rakePercent);
    if (payload.bookingCloseAt) data.bookingCloseAt = new Date(payload.bookingCloseAt);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.market.update({ where: { id }, data, include: { odds: true } });
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

  // ── Profit Dashboard ──

  async getProfitByMarket() {
    const settledMarkets = await this.prisma.market.findMany({
      where: { status: MarketStatus.SETTLED },
      orderBy: { settledAt: 'desc' },
      include: {
        event: { select: { name: true } },
        odds: { select: { id: true, label: true } },
        commissions: { select: { amount: true } },
      },
    });

    const results: Array<{
      marketId: string; marketName: string; marketType: string; eventName: string;
      winnerLabel: string; totalPool: number; rakePercent: number; rakeCollected: number;
      affiliatePayouts: number; netProfit: number; settledAt: Date | null;
    }> = [];
    for (const market of settledMarkets) {
      // Get total pool from bets
      const bets = await this.prisma.betItem.findMany({
        where: { odd: { marketId: market.id } },
        include: { bet: { select: { stake: true } } },
      });

      const totalPool = bets.reduce((sum, bi) => sum + Number(bi.bet.stake), 0);
      const rakePercent = market.rakePercent ? Number(market.rakePercent) : 6;
      const rakeCollected = totalPool * (rakePercent / 100);
      const affiliatePayouts = market.commissions.reduce((sum, c) => sum + Number(c.amount), 0);
      const netProfit = rakeCollected - affiliatePayouts;
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
        affiliatePayouts,
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
    const totalAffiliatePayouts = markets.reduce((s, m) => s + m.affiliatePayouts, 0);
    const totalNetProfit = markets.reduce((s, m) => s + m.netProfit, 0);

    return {
      settledMarkets: markets.length,
      totalPool,
      totalRake,
      totalAffiliatePayouts,
      totalNetProfit,
      averageRakePercent: markets.length > 0 ? totalRake / totalPool * 100 : 0,
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
