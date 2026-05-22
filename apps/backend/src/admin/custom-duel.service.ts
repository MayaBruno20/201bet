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

export type CreateCustomDuelDto = {
  leftCarId: string;
  rightCarId: string;
  scheduledAt: string;
  bookingCloseAt?: string;
  /** Se informado, pendura o embate nesse Event. Se vazio, cai num Event "curinga". */
  eventId?: string;
  customTitle?: string;
  /** URL externa ou caminho /api/uploads/banners/... — pode ser preenchido depois via upload. */
  bannerUrl?: string;
  notes?: string;
  /** Só permitido quando `eventId` está preenchido (não funciona com o curinga). */
  isFeatured?: boolean;
};

export type UpdateCustomDuelDto = {
  scheduledAt?: string;
  bookingCloseAt?: string;
  customTitle?: string | null;
  bannerUrl?: string | null;
  notes?: string | null;
  eventId?: string | null;
  isFeatured?: boolean;
};

const CUSTOM_EVENT_NAME = '✨ Embates Personalizados';

/**
 * Orquestra o fluxo de "embate personalizado": um duelo entre dois carros
 * específicos, geralmente dentro de um evento existente, com banner próprio
 * (link ou upload). Quando `eventId` não é informado, o duelo é pendurado num
 * Event curinga compartilhado (igual ao padrão de Embates Rápidos), mas o
 * duelo carrega `isCustom=true` e segue listado separadamente do feed rápido.
 */
@Injectable()
export class CustomDuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
  ) {}

  /** Garante o Event curinga para embates personalizados sem vínculo explícito. */
  private async ensureCustomEvent(tx: Prisma.TransactionClient): Promise<string> {
    const existing = await tx.event.findFirst({
      where: { name: CUSTOM_EVENT_NAME, status: { not: EventStatus.CANCELED } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing.id;
    const created = await tx.event.create({
      data: {
        sport: 'DRAG_RACE',
        name: CUSTOM_EVENT_NAME,
        description: 'Container automático de embates personalizados sem vínculo a evento explícito.',
        startAt: new Date(),
        status: EventStatus.LIVE,
        featured: false,
      },
    });
    return created.id;
  }

  async create(dto: CreateCustomDuelDto, _audit: AuditContext = {}) {
    if (!dto.leftCarId || !dto.rightCarId) {
      throw new BadRequestException('Informe leftCarId e rightCarId.');
    }
    if (dto.leftCarId === dto.rightCarId) {
      throw new BadRequestException('Os dois carros devem ser diferentes.');
    }
    const startsAt = new Date(dto.scheduledAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('scheduledAt inválido.');
    }
    const bookingCloseAt = dto.bookingCloseAt
      ? new Date(dto.bookingCloseAt)
      : new Date(startsAt.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(bookingCloseAt.getTime())) {
      throw new BadRequestException('bookingCloseAt inválido.');
    }

    return this.prisma.$transaction(async (tx) => {
      const [leftCar, rightCar] = await Promise.all([
        tx.car.findUnique({ where: { id: dto.leftCarId }, include: { driver: true } }),
        tx.car.findUnique({ where: { id: dto.rightCarId }, include: { driver: true } }),
      ]);
      if (!leftCar) throw new NotFoundException(`Carro ${dto.leftCarId} não encontrado.`);
      if (!rightCar) throw new NotFoundException(`Carro ${dto.rightCarId} não encontrado.`);

      let eventId = dto.eventId?.trim() || '';
      const hasExplicitEvent = Boolean(eventId);
      if (eventId) {
        const event = await tx.event.findUnique({ where: { id: eventId } });
        if (!event) throw new NotFoundException(`Evento ${eventId} não encontrado.`);
      } else {
        eventId = await this.ensureCustomEvent(tx);
      }
      // Destaque só faz sentido quando o embate está vinculado a um Event real —
      // mostrar embates pendurados no curinga não agrega valor pro apostador.
      if (dto.isFeatured && !hasExplicitEvent) {
        throw new BadRequestException('Só é possível destacar embates vinculados a um evento.');
      }

      const leftLabel = leftCar.name?.trim() || leftCar.driver.name;
      const rightLabel = rightCar.name?.trim() || rightCar.driver.name;
      const title = dto.customTitle?.trim() || `${leftLabel} x ${rightLabel}`;

      const duel = await tx.duel.create({
        data: {
          eventId,
          leftCarId: leftCar.id,
          rightCarId: rightCar.id,
          startsAt,
          bookingCloseAt,
          status: DuelStatus.BOOKING_OPEN,
          isCustom: true,
          isFeatured: Boolean(dto.isFeatured && hasExplicitEvent),
          customTitle: dto.customTitle?.trim() || null,
          bannerUrl: dto.bannerUrl?.trim() || null,
          notes: dto.notes?.trim() || `Embate personalizado — ${title}`,
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
          name: title,
          status: MarketStatus.OPEN,
          bookingCloseAt,
        },
      });

      await tx.odd.createMany({
        data: [
          { marketId: market.id, label: leftLabel, value: new Prisma.Decimal('1.00'), status: OddStatus.ACTIVE },
          { marketId: market.id, label: rightLabel, value: new Prisma.Decimal('1.00'), status: OddStatus.ACTIVE },
        ],
      });

      return { duelId: duel.id, marketId: market.id, eventId };
    });
  }

  async list(): Promise<unknown[]> {
    const duels = await this.prisma.duel.findMany({
      where: { isCustom: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        event: { select: { id: true, name: true } },
        leftCar: { include: { driver: true } },
        rightCar: { include: { driver: true } },
        markets: { include: { odds: true } },
        poolState: true,
      },
    });

    return duels.map((d) => {
      const market = d.markets[0];
      const linkedEvent = d.event.name === CUSTOM_EVENT_NAME ? null : d.event;
      return {
        id: d.id,
        status: d.status,
        startsAt: d.startsAt,
        bookingCloseAt: d.bookingCloseAt,
        customTitle: d.customTitle,
        bannerUrl: d.bannerUrl,
        isFeatured: d.isFeatured,
        notes: d.notes,
        event: linkedEvent,
        leftCar: {
          id: d.leftCar.id,
          name: d.leftCar.name,
          number: d.leftCar.number,
          photoUrl: d.leftCar.photoUrl,
          driver: { id: d.leftCar.driver.id, name: d.leftCar.driver.name, isGuest: d.leftCar.driver.isGuest },
        },
        rightCar: {
          id: d.rightCar.id,
          name: d.rightCar.name,
          number: d.rightCar.number,
          photoUrl: d.rightCar.photoUrl,
          driver: { id: d.rightCar.driver.id, name: d.rightCar.driver.name, isGuest: d.rightCar.driver.isGuest },
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

  async update(duelId: string, dto: UpdateCustomDuelDto, _audit: AuditContext = {}) {
    const duel = await this.prisma.duel.findUnique({ where: { id: duelId } });
    if (!duel || !duel.isCustom) throw new NotFoundException('Embate personalizado não encontrado.');
    if (duel.status === DuelStatus.FINISHED || duel.status === DuelStatus.CANCELED) {
      throw new BadRequestException('Embate encerrado não pode ser editado.');
    }

    const data: Prisma.DuelUpdateInput = {};

    if (dto.scheduledAt !== undefined) {
      const startsAt = new Date(dto.scheduledAt);
      if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('scheduledAt inválido.');
      data.startsAt = startsAt;
    }
    if (dto.bookingCloseAt !== undefined) {
      const close = new Date(dto.bookingCloseAt);
      if (Number.isNaN(close.getTime())) throw new BadRequestException('bookingCloseAt inválido.');
      data.bookingCloseAt = close;
    }
    if (dto.customTitle !== undefined) {
      const v = dto.customTitle?.toString().trim();
      data.customTitle = v ? v : null;
    }
    if (dto.bannerUrl !== undefined) {
      const v = dto.bannerUrl?.toString().trim();
      data.bannerUrl = v ? v : null;
    }
    if (dto.notes !== undefined) {
      const v = dto.notes?.toString().trim();
      data.notes = v ? v : null;
    }
    // Calcula o estado final do vínculo de evento ANTES de validar destaque,
    // pra que o update possa, na mesma chamada, desvincular evento + tirar destaque.
    let willHaveExplicitEvent = !!(duel.eventId);
    if (dto.eventId !== undefined) {
      const target = dto.eventId?.toString().trim();
      if (target) {
        const event = await this.prisma.event.findUnique({ where: { id: target } });
        if (!event) throw new NotFoundException('Evento não encontrado.');
        data.event = { connect: { id: target } };
        willHaveExplicitEvent = true;
      } else {
        const curingaId = await this.prisma.$transaction((tx) => this.ensureCustomEvent(tx));
        data.event = { connect: { id: curingaId } };
        willHaveExplicitEvent = false;
      }
    } else {
      // Sem mudança de evento — descobre se o atual é o curinga
      const current = await this.prisma.event.findUnique({ where: { id: duel.eventId }, select: { name: true } });
      willHaveExplicitEvent = current?.name !== CUSTOM_EVENT_NAME;
    }

    if (dto.isFeatured !== undefined) {
      if (dto.isFeatured && !willHaveExplicitEvent) {
        throw new BadRequestException('Só é possível destacar embates vinculados a um evento.');
      }
      data.isFeatured = dto.isFeatured;
    } else if (!willHaveExplicitEvent && duel.isFeatured) {
      // Desvinculando do evento → automaticamente tira o destaque pra manter invariante.
      data.isFeatured = false;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.duel.update({ where: { id: duelId }, data });
      if (dto.bookingCloseAt !== undefined && data.bookingCloseAt instanceof Date) {
        await tx.market.updateMany({
          where: { duelId, status: { not: MarketStatus.SETTLED } },
          data: { bookingCloseAt: data.bookingCloseAt },
        });
      }
      return updated;
    });
  }

  /**
   * Listagem pública dos embates personalizados marcados como destaque. Usado
   * pela faixa "Embates em Destaque" no topo de /apostas. Filtra por:
   *   - isCustom=true, isFeatured=true
   *   - status com booking aberto/fechado (não exibe os auditados/cancelados)
   *   - evento ainda ativo (não CANCELED/FINISHED)
   */
  async listFeaturedPublic(): Promise<unknown[]> {
    const duels = await this.prisma.duel.findMany({
      where: {
        isCustom: true,
        isFeatured: true,
        status: { in: [DuelStatus.BOOKING_OPEN, DuelStatus.BOOKING_CLOSED, DuelStatus.SCHEDULED] },
        event: { status: { notIn: [EventStatus.CANCELED, EventStatus.FINISHED] } },
      },
      orderBy: [{ startsAt: 'asc' }],
      take: 12,
      include: {
        event: { select: { id: true, name: true } },
        leftCar: { include: { driver: true } },
        rightCar: { include: { driver: true } },
        markets: { include: { odds: true } },
        poolState: true,
      },
    });

    return duels.map((d) => {
      const market = d.markets[0];
      const leftLabel = d.leftCar.name?.trim() || d.leftCar.driver.name;
      const rightLabel = d.rightCar.name?.trim() || d.rightCar.driver.name;
      const title = d.customTitle?.trim() || `${leftLabel} x ${rightLabel}`;
      return {
        id: d.id,
        eventId: d.eventId,
        eventName: d.event.name,
        title,
        bannerUrl: d.bannerUrl,
        startsAt: d.startsAt,
        bookingCloseAt: d.bookingCloseAt,
        status: d.status,
        leftCar: {
          label: leftLabel,
          photoUrl: d.leftCar.photoUrl,
          driverName: d.leftCar.driver.name,
        },
        rightCar: {
          label: rightLabel,
          photoUrl: d.rightCar.photoUrl,
          driverName: d.rightCar.driver.name,
        },
        market: market
          ? {
              id: market.id,
              status: market.status,
              odds: market.odds.map((o) => ({ id: o.id, label: o.label, value: Number(o.value) })),
            }
          : null,
        pool: d.poolState
          ? {
              left: Number(d.poolState.leftPool),
              right: Number(d.poolState.rightPool),
              tickets: d.poolState.leftTickets + d.poolState.rightTickets,
            }
          : null,
      };
    });
  }

  async setBanner(duelId: string, bannerUrl: string | null) {
    const duel = await this.prisma.duel.findUnique({ where: { id: duelId } });
    if (!duel || !duel.isCustom) throw new NotFoundException('Embate personalizado não encontrado.');
    return this.prisma.duel.update({
      where: { id: duelId },
      data: { bannerUrl: bannerUrl?.trim() || null },
      select: { id: true, bannerUrl: true },
    });
  }

  async closeBooking(duelId: string) {
    const duel = await this.prisma.duel.findUnique({ where: { id: duelId } });
    if (!duel || !duel.isCustom) throw new NotFoundException('Embate personalizado não encontrado.');
    if (duel.status === DuelStatus.FINISHED || duel.status === DuelStatus.CANCELED) {
      throw new BadRequestException('Embate já encerrado.');
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
    if (!duel || !duel.isCustom) throw new NotFoundException('Embate personalizado não encontrado.');
    if (duel.status === DuelStatus.FINISHED) {
      throw new BadRequestException('Embate já auditado.');
    }
    return this.settlement.settleDuel(duelId, winningSide, audit);
  }

  async cancel(duelId: string, audit: AuditContext = {}) {
    const duel = await this.prisma.duel.findUnique({ where: { id: duelId } });
    if (!duel || !duel.isCustom) throw new NotFoundException('Embate personalizado não encontrado.');
    if (duel.status === DuelStatus.FINISHED) {
      throw new BadRequestException('Embate já auditado, não pode ser cancelado.');
    }
    return this.prisma.$transaction(async (tx) => {
      const markets = await tx.market.findMany({
        where: { duelId, status: { not: MarketStatus.SETTLED } },
      });
      for (const m of markets) {
        try { await this.settlement.voidMarket(m.id, audit); } catch { /* swallow — segue cancelando */ }
      }
      await tx.duel.update({
        where: { id: duelId },
        data: { status: DuelStatus.CANCELED },
      });
      return { id: duelId, status: DuelStatus.CANCELED };
    });
  }
}
