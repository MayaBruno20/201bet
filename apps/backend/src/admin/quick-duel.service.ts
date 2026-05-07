import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DuelStatus,
  EventStatus,
  MarketStatus,
  OddStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettlementService } from '../settlement.service';

type AuditContext = {
  actorUserId?: string;
  actorRole?: UserRole;
  ipAddress?: string;
  userAgent?: string;
};

type DriverInput = {
  id?: string;
  name?: string;
  team?: string;
  carNumber?: string;
};

export type CreateQuickDuelDto = {
  leftDriver: DriverInput;
  rightDriver: DriverInput;
  scheduledAt: string;
  bookingCloseAt?: string;
  notes?: string;
};

const QUICK_EVENT_NAME = '⚡ Embates Rápidos';

/**
 * Orquestra o fluxo completo de "embate rápido": cria/encontra event genérico
 * "Embates Rápidos", cria/encontra pilotos (com `isGuest=true` para nomes novos),
 * cria/encontra carros, cria o duelo com BOOKING_OPEN e gera o mercado +
 * 2 odds em uma única transação. Pensado para o painel de embates rápidos
 * do admin, separado do fluxo formal de bracket de Listas Brasil.
 */
@Injectable()
export class QuickDuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
  ) {}

  /** Encontra (ou cria) o evento curinga onde duelos rápidos são pendurados. */
  private async ensureQuickEvent(tx: Prisma.TransactionClient): Promise<string> {
    const existing = await tx.event.findFirst({
      where: { name: QUICK_EVENT_NAME, status: { not: EventStatus.CANCELED } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing.id;
    const created = await tx.event.create({
      data: {
        sport: 'DRAG_RACE',
        name: QUICK_EVENT_NAME,
        description: 'Container automático de embates rápidos. Não editar manualmente.',
        startAt: new Date(),
        status: EventStatus.LIVE,
        featured: false,
      },
    });
    return created.id;
  }

  private async resolveDriver(tx: Prisma.TransactionClient, input: DriverInput) {
    if (input.id) {
      const found = await tx.driver.findUnique({ where: { id: input.id } });
      if (!found) throw new NotFoundException(`Piloto ${input.id} não encontrado`);
      return found;
    }
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('Informe `id` (existente) ou `name` (cria piloto convidado).');
    }
    return tx.driver.create({
      data: {
        name,
        team: input.team?.trim() || undefined,
        carNumber: input.carNumber?.trim() || undefined,
        isGuest: true,
      },
    });
  }

  private async ensureCar(
    tx: Prisma.TransactionClient,
    driver: { id: string; name: string; team: string | null; carNumber: string | null },
  ): Promise<string> {
    const existing = await tx.car.findFirst({
      where: { driverId: driver.id, active: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing.id;
    const created = await tx.car.create({
      data: {
        driverId: driver.id,
        name: driver.team ? `${driver.name} — ${driver.team}` : driver.name,
        category: 'QUICK',
        number: driver.carNumber ?? undefined,
      },
    });
    return created.id;
  }

  async create(dto: CreateQuickDuelDto, _audit: AuditContext = {}) {
    if (!dto.leftDriver || !dto.rightDriver) {
      throw new BadRequestException('Informe leftDriver e rightDriver');
    }
    const startsAt = new Date(dto.scheduledAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('scheduledAt inválido');
    }
    const bookingCloseAt = dto.bookingCloseAt
      ? new Date(dto.bookingCloseAt)
      : new Date(startsAt.getTime() + 60 * 60 * 1000); // default: 1h após início

    return this.prisma.$transaction(async (tx) => {
      const eventId = await this.ensureQuickEvent(tx);

      const left = await this.resolveDriver(tx, dto.leftDriver);
      const right = await this.resolveDriver(tx, dto.rightDriver);
      if (left.id === right.id) {
        throw new BadRequestException('Pilotos esquerda e direita devem ser diferentes.');
      }

      const leftCarId = await this.ensureCar(tx, left);
      const rightCarId = await this.ensureCar(tx, right);

      const duel = await tx.duel.create({
        data: {
          eventId,
          leftCarId,
          rightCarId,
          startsAt,
          bookingCloseAt,
          status: DuelStatus.BOOKING_OPEN,
          notes: dto.notes?.trim() || `Embate rápido — ${left.name} x ${right.name}`,
        },
      });

      await tx.duelPoolState.create({
        data: {
          duelId: duel.id,
          leftPool: 0,
          rightPool: 0,
          leftTickets: 0,
          rightTickets: 0,
        },
      });

      const market = await tx.market.create({
        data: {
          eventId,
          duelId: duel.id,
          name: `${left.name} x ${right.name}`,
          status: MarketStatus.OPEN,
          bookingCloseAt,
        },
      });

      await tx.odd.createMany({
        data: [
          { marketId: market.id, label: left.name, value: new Prisma.Decimal('1.90'), status: OddStatus.ACTIVE },
          { marketId: market.id, label: right.name, value: new Prisma.Decimal('1.90'), status: OddStatus.ACTIVE },
        ],
      });

      return {
        duelId: duel.id,
        marketId: market.id,
        eventId,
        leftDriver: { id: left.id, name: left.name, isGuest: left.isGuest },
        rightDriver: { id: right.id, name: right.name, isGuest: right.isGuest },
        scheduledAt: duel.startsAt,
        bookingCloseAt: duel.bookingCloseAt,
        status: duel.status,
      };
    });
  }

  async list(): Promise<unknown[]> {
    // Lista os duelos rápidos (apenas no evento curinga). Mais novos primeiro.
    const event = await this.prisma.event.findFirst({
      where: { name: QUICK_EVENT_NAME },
      orderBy: { createdAt: 'desc' },
    });
    if (!event) return [];

    const duels = await this.prisma.duel.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        leftCar: { include: { driver: true } },
        rightCar: { include: { driver: true } },
        markets: { include: { odds: true } },
        poolState: true,
      },
    });

    return duels.map((d) => {
      const market = d.markets[0];
      return {
        id: d.id,
        status: d.status,
        startsAt: d.startsAt,
        bookingCloseAt: d.bookingCloseAt,
        notes: d.notes,
        leftDriver: {
          id: d.leftCar.driverId,
          name: d.leftCar.driver.name,
          isGuest: d.leftCar.driver.isGuest,
        },
        rightDriver: {
          id: d.rightCar.driverId,
          name: d.rightCar.driver.name,
          isGuest: d.rightCar.driver.isGuest,
        },
        market: market
          ? {
              id: market.id,
              status: market.status,
              winnerOddId: market.winnerOddId,
              odds: market.odds.map((o) => ({ id: o.id, label: o.label, value: Number(o.value), status: o.status })),
            }
          : null,
        pool: d.poolState
          ? {
              left: Number(d.poolState.leftPool),
              right: Number(d.poolState.rightPool),
              tickets: d.poolState.leftTickets + d.poolState.rightTickets,
            }
          : null,
        createdAt: d.createdAt,
      };
    });
  }

  async closeBooking(duelId: string) {
    const duel = await this.prisma.duel.findUnique({ where: { id: duelId } });
    if (!duel) throw new NotFoundException('Embate não encontrado');
    if (duel.status === DuelStatus.FINISHED || duel.status === DuelStatus.CANCELED) {
      throw new BadRequestException('Embate já encerrado');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.duel.update({
        where: { id: duelId },
        data: { status: DuelStatus.BOOKING_CLOSED },
      });
      await tx.market.updateMany({
        where: { duelId },
        data: { status: MarketStatus.SUSPENDED },
      });
      return { id: duelId, status: DuelStatus.BOOKING_CLOSED };
    });
  }

  async settle(duelId: string, winningSide: 'LEFT' | 'RIGHT', audit: AuditContext = {}) {
    const duel = await this.prisma.duel.findUnique({ where: { id: duelId } });
    if (!duel) throw new NotFoundException('Embate não encontrado');
    if (duel.status === DuelStatus.FINISHED) {
      throw new BadRequestException('Embate já auditado');
    }
    return this.settlement.settleDuel(duelId, winningSide, audit);
  }

  async cancel(duelId: string, audit: AuditContext = {}) {
    const duel = await this.prisma.duel.findUnique({ where: { id: duelId } });
    if (!duel) throw new NotFoundException('Embate não encontrado');
    if (duel.status === DuelStatus.FINISHED) {
      throw new BadRequestException('Embate já auditado, não pode ser cancelado');
    }
    return this.prisma.$transaction(async (tx) => {
      // Anula mercados do duelo (reembolsa apostas) — chama o serviço de settlement
      const markets = await tx.market.findMany({ where: { duelId, status: { not: MarketStatus.SETTLED } } });
      for (const m of markets) {
        try { await this.settlement.voidMarket(m.id, audit); } catch { /* ignorar */ }
      }
      await tx.duel.update({
        where: { id: duelId },
        data: { status: DuelStatus.CANCELED },
      });
      return { id: duelId, status: DuelStatus.CANCELED };
    });
  }
}
