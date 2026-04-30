import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CategoryEventStatus, CategoryMatchupStatus, DuelStatus, EventStatus, MarketStatus, MatchupSide, OddStatus, Prisma, TimeCategory } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettlementService } from '../settlement.service';
import { CreateCategoryEventDto } from './dto/create-category-event.dto';
import { UpdateCategoryEventDto } from './dto/update-category-event.dto';
import { CreateBracketDto, SaveBracketLayoutDto, SettleCategoryMatchupDto, UpdateCompetitorDto, UpsertCompetitorDto } from './dto/bracket.dto';

type AuditContext = { actorUserId?: string; ipAddress?: string; userAgent?: string };

// Min track time in seconds for each category. TUDOKIDA has no minimum.
const CATEGORY_MIN_TIME: Record<TimeCategory, number | null> = {
  ORIGINAL_10S: 10.0,
  CAT_9S: 9.0,
  CAT_8_5S: 8.5,
  CAT_8S: 8.0,
  CAT_7_5S: 7.5,
  CAT_7S: 7.0,
  CAT_6_5S: 6.5,
  CAT_6S: 6.0,
  CAT_5_5S: 5.5,
  TUDOKIDA: null,
};

@Injectable()
export class CategoryEventsService {
  private readonly logger = new Logger(CategoryEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: SettlementService,
  ) {}

  // ── Public ─────────────────────────────────────────

  async listPublic() {
    return this.prisma.categoryEvent.findMany({
      where: { status: { in: [CategoryEventStatus.REGISTRATION_OPEN, CategoryEventStatus.QUALIFYING, CategoryEventStatus.IN_PROGRESS, CategoryEventStatus.FINISHED] } },
      orderBy: { scheduledAt: 'desc' },
      include: {
        brackets: {
          include: {
            competitors: { include: { driver: true }, orderBy: { qualifyingPosition: 'asc' } },
            matchups: { orderBy: [{ roundNumber: 'asc' }, { position: 'asc' }] },
          },
        },
      },
    });
  }

  async getPublic(id: string) {
    const event = await this.prisma.categoryEvent.findUnique({
      where: { id },
      include: {
        brackets: {
          include: {
            competitors: { include: { driver: true }, orderBy: { qualifyingPosition: 'asc' } },
            matchups: {
              orderBy: [{ roundNumber: 'asc' }, { position: 'asc' }],
              include: {
                leftCompetitor: { include: { driver: true } },
                rightCompetitor: { include: { driver: true } },
              },
            },
          },
        },
      },
    });
    if (!event) throw new NotFoundException('Evento não encontrado');
    return event;
  }

  // ── Admin: Events ──────────────────────────────────

  async adminList() {
    return this.prisma.categoryEvent.findMany({
      orderBy: { scheduledAt: 'desc' },
      include: {
        brackets: {
          include: {
            _count: { select: { competitors: true, matchups: true } },
          },
        },
      },
    });
  }

  async adminGet(id: string) {
    return this.getPublic(id);
  }

  async adminCreateEvent(dto: CreateCategoryEventDto, audit: AuditContext = {}) {
    const startDate = new Date(dto.scheduledAt);
    const endDate = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endDate && endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException('A data de fim deve ser posterior à data de início');
    }

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.categoryEvent.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim(),
          scheduledAt: startDate,
          endsAt: endDate,
          bannerUrl: dto.bannerUrl,
          featured: dto.featured ?? false,
          status: CategoryEventStatus.DRAFT,
          notes: dto.notes,
        },
      });

      // Cria brackets para categorias informadas
      if (dto.categories?.length) {
        for (const cat of dto.categories) {
          await tx.categoryBracket.create({
            data: { categoryEventId: event.id, category: cat, size: 8 },
          });
        }
      }

      await this.logAudit(tx, 'CATEGORY_EVENT_CREATE', 'CategoryEvent', event.id, dto, audit);
      return tx.categoryEvent.findUnique({
        where: { id: event.id },
        include: { brackets: { include: { _count: { select: { competitors: true, matchups: true } } } } },
      });
    });
  }

  async adminUpdateEvent(id: string, dto: UpdateCategoryEventDto, audit: AuditContext = {}) {
    const event = await this.prisma.categoryEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Evento não encontrado');

    const finalStart = dto.scheduledAt ? new Date(dto.scheduledAt) : event.scheduledAt;
    const finalEnd = dto.endsAt ? new Date(dto.endsAt) : event.endsAt;
    if (finalEnd && finalEnd.getTime() <= finalStart.getTime()) {
      throw new BadRequestException('A data de fim deve ser posterior à data de início');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.categoryEvent.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          description: dto.description?.trim(),
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          bannerUrl: dto.bannerUrl,
          featured: dto.featured,
          status: dto.status,
          notes: dto.notes,
        },
      });
      await this.logAudit(tx, 'CATEGORY_EVENT_UPDATE', 'CategoryEvent', id, dto, audit);
      return updated;
    });
  }

  async adminDeleteEvent(id: string, audit: AuditContext = {}) {
    const event = await this.prisma.categoryEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Evento não encontrado');
    return this.prisma.$transaction(async (tx) => {
      await tx.categoryEvent.update({ where: { id }, data: { status: CategoryEventStatus.CANCELED } });
      await this.logAudit(tx, 'CATEGORY_EVENT_CANCEL', 'CategoryEvent', id, {}, audit);
      return { id, status: CategoryEventStatus.CANCELED };
    });
  }

  // ── Admin: Brackets ────────────────────────────────

  async adminCreateBracket(eventId: string, dto: CreateBracketDto, audit: AuditContext = {}) {
    const event = await this.prisma.categoryEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');

    const existing = await this.prisma.categoryBracket.findUnique({
      where: { categoryEventId_category: { categoryEventId: eventId, category: dto.category } },
    });
    if (existing) throw new ConflictException('Já existe uma chave para esta categoria neste evento');

    return this.prisma.$transaction(async (tx) => {
      const bracket = await tx.categoryBracket.create({
        data: { categoryEventId: eventId, category: dto.category, size: dto.size ?? 8 },
      });
      await this.logAudit(tx, 'CATEGORY_BRACKET_CREATE', 'CategoryBracket', bracket.id, dto, audit);
      return bracket;
    });
  }

  async adminDeleteBracket(bracketId: string, audit: AuditContext = {}) {
    const bracket = await this.prisma.categoryBracket.findUnique({ where: { id: bracketId } });
    if (!bracket) throw new NotFoundException('Chave não encontrada');
    return this.prisma.$transaction(async (tx) => {
      await tx.categoryBracket.delete({ where: { id: bracketId } });
      await this.logAudit(tx, 'CATEGORY_BRACKET_DELETE', 'CategoryBracket', bracketId, {}, audit);
      return { id: bracketId };
    });
  }

  async adminUpdateBracketSize(bracketId: string, size: number, audit: AuditContext = {}) {
    const bracket = await this.prisma.categoryBracket.findUnique({ where: { id: bracketId } });
    if (!bracket) throw new NotFoundException('Chave não encontrada');
    if (size < 2 || size > 64) throw new BadRequestException('Tamanho da chave deve estar entre 2 e 64');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.categoryBracket.update({ where: { id: bracketId }, data: { size } });
      await this.logAudit(tx, 'CATEGORY_BRACKET_UPDATE', 'CategoryBracket', bracketId, { size }, audit);
      return updated;
    });
  }

  // ── Admin: Competitors ─────────────────────────────

  async adminUpsertCompetitor(bracketId: string, dto: UpsertCompetitorDto, audit: AuditContext = {}) {
    const bracket = await this.prisma.categoryBracket.findUnique({ where: { id: bracketId } });
    if (!bracket) throw new NotFoundException('Chave não encontrada');

    return this.prisma.$transaction(async (tx) => {
      // Resolve driver
      let driverId = dto.driverId;
      if (!driverId) {
        if (!dto.driverName) throw new BadRequestException('Informe driverId ou driverName');
        const driver = await tx.driver.create({
          data: {
            name: dto.driverName.trim(),
            nickname: dto.driverNickname?.trim() ?? null,
            carNumber: dto.carNumber ?? null,
            team: dto.driverTeam ?? null,
            hometown: dto.driverHometown ?? null,
          },
        });
        driverId = driver.id;
      }

      // Compute total
      const reaction = dto.qualifyingReaction !== undefined ? new Prisma.Decimal(dto.qualifyingReaction) : null;
      const track = dto.qualifyingTrack !== undefined ? new Prisma.Decimal(dto.qualifyingTrack) : null;
      const total = reaction && track ? reaction.add(track) : null;

      const competitor = await tx.categoryCompetitor.upsert({
        where: { bracketId_driverId: { bracketId, driverId } },
        create: {
          bracketId,
          driverId,
          carName: dto.carName.trim(),
          carNumber: dto.carNumber ?? null,
          qualifyingReaction: reaction,
          qualifyingTrack: track,
          qualifyingTotal: total,
          qualifyingPosition: dto.qualifyingPosition,
        },
        update: {
          carName: dto.carName.trim(),
          carNumber: dto.carNumber ?? null,
          qualifyingReaction: reaction ?? undefined,
          qualifyingTrack: track ?? undefined,
          qualifyingTotal: total ?? undefined,
          qualifyingPosition: dto.qualifyingPosition,
        },
        include: { driver: true },
      });

      await this.logAudit(tx, 'CATEGORY_COMPETITOR_UPSERT', 'CategoryCompetitor', competitor.id, dto, audit);
      return competitor;
    });
  }

  async adminUpdateCompetitor(competitorId: string, dto: UpdateCompetitorDto, audit: AuditContext = {}) {
    const competitor = await this.prisma.categoryCompetitor.findUnique({ where: { id: competitorId } });
    if (!competitor) throw new NotFoundException('Competidor não encontrado');

    return this.prisma.$transaction(async (tx) => {
      const reaction = dto.qualifyingReaction !== undefined ? new Prisma.Decimal(dto.qualifyingReaction) : undefined;
      const track = dto.qualifyingTrack !== undefined ? new Prisma.Decimal(dto.qualifyingTrack) : undefined;
      const totalSrc = (dto.qualifyingReaction !== undefined ? dto.qualifyingReaction : Number(competitor.qualifyingReaction ?? 0))
        + (dto.qualifyingTrack !== undefined ? dto.qualifyingTrack : Number(competitor.qualifyingTrack ?? 0));
      const total = reaction !== undefined || track !== undefined ? new Prisma.Decimal(totalSrc) : undefined;

      const updated = await tx.categoryCompetitor.update({
        where: { id: competitorId },
        data: {
          carName: dto.carName?.trim(),
          carNumber: dto.carNumber,
          qualifyingReaction: reaction,
          qualifyingTrack: track,
          qualifyingTotal: total,
          qualifyingPosition: dto.qualifyingPosition,
        },
      });
      await this.logAudit(tx, 'CATEGORY_COMPETITOR_UPDATE', 'CategoryCompetitor', competitorId, dto, audit);
      return updated;
    });
  }

  async adminRemoveCompetitor(competitorId: string, audit: AuditContext = {}) {
    const competitor = await this.prisma.categoryCompetitor.findUnique({ where: { id: competitorId } });
    if (!competitor) throw new NotFoundException('Competidor não encontrado');

    // Refusa remocao se ja foi vencedor de algum matchup liquidado
    const wonMatchups = await this.prisma.categoryMatchup.count({
      where: {
        OR: [
          { leftCompetitorId: competitorId, winnerSide: 'LEFT' },
          { rightCompetitorId: competitorId, winnerSide: 'RIGHT' },
        ],
        settledAt: { not: null },
      },
    });
    if (wonMatchups > 0) {
      throw new BadRequestException('Não é possível remover competidor que já venceu uma rodada auditada');
    }

    return this.prisma.$transaction(async (tx) => {
      // Limpa winnerSide caso o competidor seja vencedor pendente nao auditado (defensivo)
      await tx.categoryMatchup.updateMany({
        where: {
          OR: [
            { leftCompetitorId: competitorId, winnerSide: 'LEFT' },
            { rightCompetitorId: competitorId, winnerSide: 'RIGHT' },
          ],
        },
        data: { winnerSide: null, settledAt: null },
      });
      // Limpa referencias em matchups
      await tx.categoryMatchup.updateMany({
        where: { leftCompetitorId: competitorId },
        data: { leftCompetitorId: null },
      });
      await tx.categoryMatchup.updateMany({
        where: { rightCompetitorId: competitorId },
        data: { rightCompetitorId: null },
      });
      await tx.categoryCompetitor.delete({ where: { id: competitorId } });
      await this.logAudit(tx, 'CATEGORY_COMPETITOR_DELETE', 'CategoryCompetitor', competitorId, {}, audit);
      return { id: competitorId };
    });
  }

  // ── Admin: Bracket layout (drag-and-drop save) ─────

  async adminSaveBracketLayout(bracketId: string, dto: SaveBracketLayoutDto, audit: AuditContext = {}) {
    const bracket = await this.prisma.categoryBracket.findUnique({
      where: { id: bracketId },
      include: { competitors: true },
    });
    if (!bracket) throw new NotFoundException('Chave não encontrada');

    // Validar que todos os competitorIds sao desta chave
    const validIds = new Set(bracket.competitors.map((c) => c.id));
    for (const slot of dto.slots) {
      if (slot.leftCompetitorId && !validIds.has(slot.leftCompetitorId)) {
        throw new BadRequestException('Competidor inválido para esta chave');
      }
      if (slot.rightCompetitorId && !validIds.has(slot.rightCompetitorId)) {
        throw new BadRequestException('Competidor inválido para esta chave');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Apaga matchups pendentes (não auditados) e recria
      await tx.categoryMatchup.deleteMany({
        where: { bracketId, status: CategoryMatchupStatus.PENDING },
      });

      for (const slot of dto.slots) {
        const existing = await tx.categoryMatchup.findUnique({
          where: { bracketId_roundNumber_position: { bracketId, roundNumber: slot.roundNumber, position: slot.position } },
        });
        if (existing) {
          // Já liquidado - não sobrescreve competidores
          continue;
        }
        await tx.categoryMatchup.create({
          data: {
            bracketId,
            roundNumber: slot.roundNumber,
            position: slot.position,
            leftCompetitorId: slot.leftCompetitorId ?? null,
            rightCompetitorId: slot.rightCompetitorId ?? null,
            status: CategoryMatchupStatus.PENDING,
          },
        });
      }

      await this.logAudit(tx, 'CATEGORY_BRACKET_LAYOUT_SAVE', 'CategoryBracket', bracketId, { slotCount: dto.slots.length }, audit);
      return tx.categoryBracket.findUnique({
        where: { id: bracketId },
        include: {
          competitors: { include: { driver: true } },
          matchups: { orderBy: [{ roundNumber: 'asc' }, { position: 'asc' }] },
        },
      });
    }, { timeout: 20000, maxWait: 5000 });
  }

  // ── Admin: Toggle market (abre/fecha apostas para o matchup) ──────

  async adminToggleMatchupMarket(matchupId: string, open: boolean, audit: AuditContext = {}) {
    const matchup = await this.prisma.categoryMatchup.findUnique({
      where: { id: matchupId },
      include: {
        bracket: { include: { categoryEvent: true } },
        leftCompetitor: { include: { driver: { include: { cars: { where: { active: true }, take: 1 } } } } },
        rightCompetitor: { include: { driver: { include: { cars: { where: { active: true }, take: 1 } } } } },
      },
    });
    if (!matchup) throw new NotFoundException('Confronto não encontrado');
    if (matchup.winnerSide) throw new BadRequestException('Confronto já liquidado');
    if (!matchup.leftCompetitor || !matchup.rightCompetitor) {
      throw new BadRequestException('Confronto sem competidores nos dois lados');
    }
    const leftComp = matchup.leftCompetitor;
    const rightComp = matchup.rightCompetitor;

    return this.prisma.$transaction(async (tx) => {
      // Garante apenas 1 mercado aberto por bracket
      if (open) {
        const siblings = await tx.categoryMatchup.findMany({
          where: { bracketId: matchup.bracketId, marketOpen: true, id: { not: matchupId } },
          select: { id: true, duelId: true },
        });
        for (const s of siblings) {
          await tx.categoryMatchup.update({ where: { id: s.id }, data: { marketOpen: false } });
          if (s.duelId) {
            await tx.duel.update({ where: { id: s.duelId }, data: { status: DuelStatus.BOOKING_CLOSED } }).catch(() => undefined);
          }
        }
      }

      let duelId = matchup.duelId;

      if (open) {
        // 1) Garante Event do CategoryEvent (link persistido em CategoryEvent.eventId)
        let eventId: string;
        if (matchup.bracket.categoryEvent.eventId) {
          eventId = matchup.bracket.categoryEvent.eventId;
        } else {
          const created = await tx.event.create({
            data: {
              sport: 'DRAG_RACE',
              name: `Copa ${matchup.bracket.category} — ${matchup.bracket.categoryEvent.name}`,
              bannerUrl: matchup.bracket.categoryEvent.bannerUrl ?? null,
              featured: matchup.bracket.categoryEvent.featured ?? false,
              startAt: matchup.bracket.categoryEvent.scheduledAt,
              status: EventStatus.SCHEDULED,
            },
          });
          eventId = created.id;
          // Persiste o link no CategoryEvent para reuso futuro
          await tx.categoryEvent.update({
            where: { id: matchup.bracket.categoryEventId },
            data: { eventId },
          });
        }

        // 2) Cars dos competidores
        const leftCarId = await this.ensureDriverCar(tx, leftComp.driver, leftComp.carName, leftComp.carNumber);
        const rightCarId = await this.ensureDriverCar(tx, rightComp.driver, rightComp.carName, rightComp.carNumber);

        // 3) Duel
        const bookingCloseAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
        if (duelId) {
          await tx.duel.update({
            where: { id: duelId },
            data: { status: DuelStatus.BOOKING_OPEN, bookingCloseAt },
          });
        } else {
          const createdDuel = await tx.duel.create({
            data: {
              eventId,
              leftCarId,
              rightCarId,
              startsAt: matchup.bracket.categoryEvent.scheduledAt,
              bookingCloseAt,
              status: DuelStatus.BOOKING_OPEN,
              notes: `Copa ${matchup.bracket.category} — Rodada ${matchup.roundNumber} #${matchup.position}`,
            },
          });
          duelId = createdDuel.id;
          await tx.categoryMatchup.update({ where: { id: matchupId }, data: { duelId } });
        }

        // Pool zera ao abrir
        await tx.duelPoolState.upsert({
          where: { duelId },
          create: { duelId, leftPool: 0, rightPool: 0, leftTickets: 0, rightTickets: 0 },
          update: { leftPool: 0, rightPool: 0, leftTickets: 0, rightTickets: 0 },
        });

        // 4) Market + Odds
        const existingMarket = await tx.market.findFirst({ where: { duelId } });
        if (!existingMarket) {
          const market = await tx.market.create({
            data: {
              eventId,
              duelId,
              name: `${leftComp.driver.name} x ${rightComp.driver.name}`,
              status: MarketStatus.OPEN,
              bookingCloseAt,
            },
          });
          await tx.odd.create({
            data: { marketId: market.id, label: leftComp.driver.name, value: new Prisma.Decimal('1.90'), status: OddStatus.ACTIVE },
          });
          await tx.odd.create({
            data: { marketId: market.id, label: rightComp.driver.name, value: new Prisma.Decimal('1.90'), status: OddStatus.ACTIVE },
          });
        } else {
          await tx.market.update({ where: { id: existingMarket.id }, data: { status: MarketStatus.OPEN, bookingCloseAt } });
        }
      } else if (duelId) {
        await tx.duel.update({ where: { id: duelId }, data: { status: DuelStatus.BOOKING_CLOSED } });
        await tx.market.updateMany({ where: { duelId }, data: { status: MarketStatus.SUSPENDED } });
      }

      const updated = await tx.categoryMatchup.update({
        where: { id: matchupId },
        data: { marketOpen: open, ...(duelId && !matchup.duelId ? { duelId } : {}) },
      });

      await this.logAudit(
        tx,
        open ? 'CATEGORY_MATCHUP_MARKET_OPEN' : 'CATEGORY_MATCHUP_MARKET_CLOSE',
        'CategoryMatchup', matchupId, { open, duelId }, audit,
      );
      return updated;
    }, { timeout: 20000, maxWait: 5000 });
  }

  private async ensureDriverCar(
    tx: Prisma.TransactionClient,
    driver: { id: string; cars: Array<{ id: string }> },
    carName: string,
    carNumber: string | null,
  ): Promise<string> {
    const existing = driver.cars[0];
    if (existing) return existing.id;
    const created = await tx.car.create({
      data: {
        driverId: driver.id,
        name: carName,
        category: 'COPA_CATEGORIAS',
        number: carNumber ?? null,
      },
    });
    return created.id;
  }

  // ── Admin: Settle matchup ──────────────────────────

  async adminSettleMatchup(matchupId: string, dto: SettleCategoryMatchupDto, audit: AuditContext = {}) {
    const matchup = await this.prisma.categoryMatchup.findUnique({
      where: { id: matchupId },
      include: { bracket: true },
    });
    if (!matchup) throw new NotFoundException('Confronto não encontrado');
    if (matchup.winnerSide && matchup.settledAt) {
      throw new BadRequestException('Esta rodada já foi auditada e o vencedor é imutável');
    }

    const minTime = CATEGORY_MIN_TIME[matchup.bracket.category];

    // Detectar passada inválida automaticamente se tempo < minimo
    let leftInvalid = !!dto.leftInvalid;
    let rightInvalid = !!dto.rightInvalid;
    if (minTime !== null) {
      if (dto.leftTrack !== undefined && dto.leftTrack < minTime) leftInvalid = true;
      if (dto.rightTrack !== undefined && dto.rightTrack < minTime) rightInvalid = true;
    }

    // Regras: queimada invalida automaticamente. Se ambos queimaram + sem reaction valida = INVALIDATED.
    let resolvedWinner: MatchupSide = dto.winnerSide;
    const leftQ = !!dto.leftQueimou;
    const rightQ = !!dto.rightQueimou;
    let bothInvalidatedNoData = false;

    if (leftQ && rightQ) {
      const lr = dto.leftReaction;
      const rr = dto.rightReaction;
      if (lr === undefined && rr === undefined) {
        // Sem dado de reacao -> nao da pra desempatar -> INVALIDATED
        bothInvalidatedNoData = true;
      } else {
        const leftR = lr ?? Infinity;
        const rightR = rr ?? Infinity;
        resolvedWinner = leftR <= rightR ? MatchupSide.LEFT : MatchupSide.RIGHT;
      }
    } else if (leftQ) {
      resolvedWinner = MatchupSide.RIGHT;
    } else if (rightQ) {
      resolvedWinner = MatchupSide.LEFT;
    } else if (leftInvalid && rightInvalid) {
      // Ambos invalidos - usa winnerSide informado
    } else if (leftInvalid) {
      resolvedWinner = MatchupSide.RIGHT;
    } else if (rightInvalid) {
      resolvedWinner = MatchupSide.LEFT;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.categoryMatchup.update({
        where: { id: matchupId },
        data: {
          winnerSide: bothInvalidatedNoData ? null : resolvedWinner,
          leftReaction: dto.leftReaction !== undefined ? new Prisma.Decimal(dto.leftReaction) : undefined,
          leftTrack: dto.leftTrack !== undefined ? new Prisma.Decimal(dto.leftTrack) : undefined,
          leftQueimou: leftQ,
          leftInvalid,
          rightReaction: dto.rightReaction !== undefined ? new Prisma.Decimal(dto.rightReaction) : undefined,
          rightTrack: dto.rightTrack !== undefined ? new Prisma.Decimal(dto.rightTrack) : undefined,
          rightQueimou: rightQ,
          rightInvalid,
          status: bothInvalidatedNoData || (leftInvalid && rightInvalid)
            ? CategoryMatchupStatus.INVALIDATED
            : CategoryMatchupStatus.COMPLETED,
          settledAt: new Date(),
          notes: dto.notes ?? matchup.notes,
        },
      });
      await this.logAudit(tx, 'CATEGORY_MATCHUP_SETTLE', 'CategoryMatchup', matchupId, { resolvedWinner, leftInvalid, rightInvalid, bothInvalidatedNoData }, audit);
      return updated;
    }, { timeout: 20000, maxWait: 5000 });

    // Liquida apostas no Duel/Market vinculado (paga vencedores ou refunda em INVALIDATED)
    if (matchup.duelId) {
      try {
        if (bothInvalidatedNoData || (leftInvalid && rightInvalid)) {
          // Ambos invalidos sem vencedor -> void market (refund)
          const market = await this.prisma.market.findFirst({
            where: { duelId: matchup.duelId, status: { in: [MarketStatus.OPEN, MarketStatus.CLOSED, MarketStatus.SUSPENDED] } },
            select: { id: true },
          });
          if (market) {
            await this.settlementService.voidMarket(market.id, audit);
          }
        } else {
          // Vencedor definido -> settleDuel
          const hasMarket = await this.prisma.market.findFirst({
            where: { duelId: matchup.duelId, status: { in: [MarketStatus.OPEN, MarketStatus.CLOSED, MarketStatus.SUSPENDED] } },
            select: { id: true },
          });
          if (hasMarket) {
            await this.settlementService.settleDuel(matchup.duelId, resolvedWinner as 'LEFT' | 'RIGHT', audit);
          }
        }
        await this.prisma.duel.update({
          where: { id: matchup.duelId },
          data: { status: DuelStatus.FINISHED },
        }).catch(() => undefined);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`[CRITICAL] Settle do duel ${matchup.duelId} (Copa Categorias) falhou: ${msg}`);
        await this.prisma.auditLog.create({
          data: {
            actorUserId: audit.actorUserId,
            action: 'COPA_SETTLE_DUEL_FAILED',
            entity: 'Duel',
            entityId: matchup.duelId,
            payload: { matchupId, resolvedWinner, error: msg } as Prisma.InputJsonValue,
          },
        }).catch(() => undefined);
        throw new BadRequestException(
          `Vencedor auditado mas LIQUIDACAO DAS APOSTAS FALHOU: ${msg}. Reconcilie em /admin/audit-logs (COPA_SETTLE_DUEL_FAILED).`,
        );
      }
    }

    return result;
  }

  // ── Helpers ────────────────────────────────────────

  private async logAudit(
    tx: Prisma.TransactionClient,
    action: string,
    entity: string,
    entityId: string,
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
}
