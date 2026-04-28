import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ArmageddonStatus,
  DuelStatus,
  EventStatus,
  ListFormat,
  ListRoundType,
  MarketStatus,
  OddStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettlementService } from '../settlement.service';
import { buildBracketPairs } from '../brazil-lists/brazil-lists.service';
import {
  CreateArmageddonEventDto,
  UpdateArmageddonEventDto,
} from './dto/armageddon-event.dto';
import {
  ImportRosterFromListsDto,
  UpsertArmageddonRosterDto,
} from './dto/armageddon-roster.dto';
import {
  GenerateArmageddonMatchupsDto,
  SettleArmageddonMatchupDto,
} from './dto/armageddon-matchup.dto';

type AuditContext = {
  actorUserId?: string;
  actorRole?: UserRole;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class ArmageddonService {
  private readonly logger = new Logger(ArmageddonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: SettlementService,
  ) {}

  // ── Public ────────────────────────────────────────────

  async listPublic() {
    const events = await this.prisma.armageddonEvent.findMany({
      where: { status: { in: [ArmageddonStatus.IN_PROGRESS, ArmageddonStatus.FINISHED] } },
      orderBy: { scheduledAt: 'desc' },
      include: {
        roster: {
          include: { driver: true },
          orderBy: { position: 'asc' },
        },
        matchups: {
          orderBy: [{ roundNumber: 'asc' }, { order: 'asc' }],
          include: { leftDriver: true, rightDriver: true },
        },
      },
    });
    return events.map((e) => this.serializeEvent(e));
  }

  async getPublicById(id: string) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id },
      include: {
        roster: { include: { driver: true }, orderBy: { position: 'asc' } },
        matchups: {
          orderBy: [{ roundNumber: 'asc' }, { order: 'asc' }],
          include: { leftDriver: true, rightDriver: true },
        },
      },
    });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');
    return this.serializeEvent(event);
  }

  // ── Admin: events ─────────────────────────────────────

  async adminListAll() {
    const events = await this.prisma.armageddonEvent.findMany({
      orderBy: { scheduledAt: 'desc' },
      include: {
        roster: { include: { driver: true }, orderBy: { position: 'asc' } },
        matchups: {
          orderBy: [{ roundNumber: 'asc' }, { order: 'asc' }],
          include: { leftDriver: true, rightDriver: true },
        },
      },
    });
    return events.map((e) => this.serializeEvent(e));
  }

  async adminGetById(id: string) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id },
      include: {
        roster: { include: { driver: true }, orderBy: { position: 'asc' } },
        matchups: {
          orderBy: [{ roundNumber: 'asc' }, { order: 'asc' }],
          include: { leftDriver: true, rightDriver: true },
        },
      },
    });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');
    return this.serializeEvent(event);
  }

  async adminCreate(dto: CreateArmageddonEventDto, audit: AuditContext) {
    const startDate = new Date(dto.scheduledAt);
    const endDate = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endDate && endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException('A data de fim deve ser posterior à data de início');
    }

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.armageddonEvent.create({
        data: {
          name: dto.name,
          description: dto.description,
          bannerUrl: dto.bannerUrl,
          featured: dto.featured ?? false,
          format: dto.format ?? ListFormat.TOP_20,
          scheduledAt: startDate,
          endsAt: endDate,
          notes: dto.notes,
          status: ArmageddonStatus.DRAFT,
        },
      });
      await this.logAudit(tx, 'ARMAGEDDON_EVENT_CREATE', 'ArmageddonEvent', event.id, dto, audit);
      return event;
    });
  }

  async adminUpdate(id: string, dto: UpdateArmageddonEventDto, audit: AuditContext) {
    const existing = await this.prisma.armageddonEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Evento Armageddon não encontrado');

    const finalStart = dto.scheduledAt ? new Date(dto.scheduledAt) : existing.scheduledAt;
    const finalEnd = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    if (finalEnd && finalEnd.getTime() <= finalStart.getTime()) {
      throw new BadRequestException('A data de fim deve ser posterior à data de início');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.armageddonEvent.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          bannerUrl: dto.bannerUrl,
          featured: dto.featured,
          format: dto.format,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          status: dto.status,
          notes: dto.notes,
        },
      });
      // Propaga banner+featured se ja existe Event vinculado
      if (updated.eventId && (dto.bannerUrl !== undefined || dto.featured !== undefined)) {
        await tx.event.update({
          where: { id: updated.eventId },
          data: {
            bannerUrl: dto.bannerUrl !== undefined ? dto.bannerUrl : undefined,
            featured: dto.featured !== undefined ? dto.featured : undefined,
          },
        }).catch(() => undefined);
      }
      await this.logAudit(tx, 'ARMAGEDDON_EVENT_UPDATE', 'ArmageddonEvent', id, dto, audit);
      return updated;
    });
  }

  async adminDelete(id: string, audit: AuditContext) {
    const existing = await this.prisma.armageddonEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Evento Armageddon não encontrado');

    return this.prisma.$transaction(async (tx) => {
      await tx.armageddonEvent.delete({ where: { id } });
      await this.logAudit(tx, 'ARMAGEDDON_EVENT_DELETE', 'ArmageddonEvent', id, null, audit);
      return { success: true };
    });
  }

  // ── Admin: roster (snapshot from multiple Brazil Lists) ──

  // Item 70 do regulamento: listas mais antigas iniciam com teto maximo de 50% do TOP 10/20
  async adminImportFromLists(eventId: string, dto: ImportRosterFromListsDto, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id: eventId },
      include: { roster: true },
    });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');

    if (event.status === ArmageddonStatus.FINISHED || event.status === ArmageddonStatus.CANCELED) {
      throw new BadRequestException('Não é possível importar pilotos em um evento finalizado ou cancelado');
    }

    const maxPositions = event.format === ListFormat.TOP_10 ? 10 : 20;

    // Validar selecoes e computar totais
    const listIds = dto.selections.map((s) => s.listId);
    const lists = await this.prisma.brazilList.findMany({
      where: { id: { in: listIds }, active: true },
      include: {
        roster: {
          include: { driver: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (lists.length !== listIds.length) {
      throw new BadRequestException('Uma ou mais listas selecionadas não existem ou não estão ativas');
    }

    // Validar item 70: maximo 50% por lista (a menos que haja sobra de vagas)
    const totalRequested = dto.selections.reduce((sum, s) => sum + s.count, 0);
    if (totalRequested > maxPositions) {
      throw new BadRequestException(
        `Total de pilotos selecionados (${totalRequested}) excede o tamanho do evento (${maxPositions}). Ajuste as quantidades.`,
      );
    }

    for (const sel of dto.selections) {
      const list = lists.find((l) => l.id === sel.listId);
      if (!list) continue;
      const listMax = list.format === ListFormat.TOP_10 ? 10 : 20;
      const half = Math.ceil(listMax / 2);
      if (sel.count > half && totalRequested >= maxPositions) {
        throw new BadRequestException(
          `Lista ${list.name} (DDD ${list.areaCode}): item 70 do regulamento limita a 50% do TOP (${half}) quando não há sobra de vagas.`,
        );
      }
      if (sel.count > list.roster.length) {
        throw new BadRequestException(
          `Lista ${list.name}: foram solicitados ${sel.count} pilotos, mas só há ${list.roster.length} no roster atual.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.replaceExisting) {
        await tx.armageddonRoster.deleteMany({ where: { eventId } });
      }

      const existing = await tx.armageddonRoster.findMany({ where: { eventId } });
      const usedPositions = new Set(existing.map((r) => r.position));
      const usedDriverIds = new Set(existing.map((r) => r.driverId));

      let nextPos = 1;
      const findNextPosition = () => {
        while (nextPos <= maxPositions && usedPositions.has(nextPos)) nextPos += 1;
        return nextPos <= maxPositions ? nextPos : null;
      };

      const imported: Array<{ position: number; driverName: string; fromArea: number }> = [];

      for (const sel of dto.selections) {
        const list = lists.find((l) => l.id === sel.listId);
        if (!list) continue;
        const topN = [...list.roster].sort((a, b) => a.position - b.position).slice(0, sel.count);

        for (const r of topN) {
          if (usedDriverIds.has(r.driverId)) {
            // Piloto ja importado de outra lista - regulamento item 23 nao se aplica aqui
            // (Armageddon eh standalone), mas ainda assim duplicar nao faz sentido
            continue;
          }
          const pos = findNextPosition();
          if (!pos) break;
          usedPositions.add(pos);
          usedDriverIds.add(r.driverId);

          await tx.armageddonRoster.create({
            data: {
              eventId,
              driverId: r.driverId,
              position: pos,
              fromListId: list.id,
              fromAreaCode: list.areaCode,
              fromPosition: r.position,
              isKing: false,
            },
          });

          imported.push({ position: pos, driverName: r.driver.name, fromArea: list.areaCode });
        }
      }

      // Marca o ROSTER_OPEN se ainda DRAFT
      if (event.status === ArmageddonStatus.DRAFT) {
        await tx.armageddonEvent.update({
          where: { id: eventId },
          data: { status: ArmageddonStatus.ROSTER_OPEN },
        });
      }

      await this.logAudit(tx, 'ARMAGEDDON_ROSTER_IMPORT', 'ArmageddonEvent', eventId, {
        selections: dto.selections,
        imported: imported.length,
      }, audit);

      return { imported: imported.length, entries: imported };
    }, { timeout: 30000, maxWait: 5000 });
  }

  async adminUpsertRoster(eventId: string, dto: UpsertArmageddonRosterDto, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');

    const maxPositions = event.format === ListFormat.TOP_10 ? 10 : 20;
    if (dto.position > maxPositions) {
      throw new BadRequestException(`Posição máxima para este evento é ${maxPositions}`);
    }

    return this.prisma.$transaction(async (tx) => {
      let driverId = dto.driverId;
      if (!driverId) {
        if (!dto.driverName) {
          throw new BadRequestException('Informe driverId ou driverName');
        }
        const driver = await tx.driver.create({ data: { name: dto.driverName } });
        driverId = driver.id;
      }

      const existingAtPosition = await tx.armageddonRoster.findUnique({
        where: { eventId_position: { eventId, position: dto.position } },
      });
      const existingDriver = await tx.armageddonRoster.findUnique({
        where: { eventId_driverId: { eventId, driverId } },
      });

      if (existingDriver && existingDriver.position !== dto.position) {
        if (existingAtPosition) {
          throw new ConflictException('Piloto já está em outra posição deste evento');
        }
        await tx.armageddonRoster.delete({ where: { id: existingDriver.id } });
      }

      const data = {
        eventId,
        driverId,
        position: dto.position,
        isKing: dto.isKing ?? false,
        fromListId: dto.fromListId,
        fromAreaCode: dto.fromAreaCode,
        fromPosition: dto.fromPosition,
        notes: dto.notes,
      };

      const roster = existingAtPosition
        ? await tx.armageddonRoster.update({
            where: { id: existingAtPosition.id },
            data,
            include: { driver: true },
          })
        : await tx.armageddonRoster.create({ data, include: { driver: true } });

      if (dto.isKing === true) {
        await tx.armageddonRoster.updateMany({
          where: { eventId, id: { not: roster.id } },
          data: { isKing: false },
        });
      }

      await this.logAudit(tx, 'ARMAGEDDON_ROSTER_UPSERT', 'ArmageddonRoster', roster.id, dto, audit);
      return roster;
    });
  }

  async adminRemoveRoster(eventId: string, rosterId: string, audit: AuditContext) {
    const roster = await this.prisma.armageddonRoster.findFirst({
      where: { id: rosterId, eventId },
    });
    if (!roster) throw new NotFoundException('Entrada de roster não encontrada');

    return this.prisma.$transaction(async (tx) => {
      await tx.armageddonRoster.delete({ where: { id: rosterId } });
      await this.logAudit(tx, 'ARMAGEDDON_ROSTER_DELETE', 'ArmageddonRoster', rosterId, null, audit);
      return { success: true };
    });
  }

  async adminClearRoster(eventId: string, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');

    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.armageddonRoster.deleteMany({ where: { eventId } });
      await this.logAudit(tx, 'ARMAGEDDON_ROSTER_CLEAR', 'ArmageddonEvent', eventId, { count: removed.count }, audit);
      return { success: true, removed: removed.count };
    });
  }

  // ── Admin: matchup bracketing ────────────────────────

  async adminGenerateMatchups(eventId: string, dto: GenerateArmageddonMatchupsDto, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id: eventId },
      include: { roster: { include: { driver: true } } },
    });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');
    if (dto.roundType === ListRoundType.SHARK_TANK) {
      throw new BadRequestException('Armageddon não possui rodada Shark Tank');
    }

    if (event.roster.length < 2) {
      throw new BadRequestException('Importe os pilotos antes de gerar a chave');
    }

    const rosterByPosition = new Map<number, { driverId: string }>();
    for (const r of event.roster) {
      rosterByPosition.set(r.position, { driverId: r.driverId });
    }

    const pairs = buildBracketPairs(event.format, dto.roundType);
    if (!pairs.length) {
      throw new BadRequestException('Nenhum confronto pôde ser gerado');
    }

    const roundNumber = dto.roundNumber ?? (await this.nextRoundNumber(eventId));

    return this.prisma.$transaction(async (tx) => {
      await tx.armageddonMatchup.deleteMany({
        where: { eventId, roundNumber, roundType: dto.roundType },
      });

      const created: Array<{ id: string }> = [];
      for (const pair of pairs) {
        const leftDriverId = rosterByPosition.get(pair.leftPosition)?.driverId;
        const rightDriverId = rosterByPosition.get(pair.rightPosition)?.driverId;
        const matchup = await tx.armageddonMatchup.create({
          data: {
            eventId,
            roundNumber,
            roundType: dto.roundType,
            order: pair.order,
            leftPosition: pair.leftPosition,
            rightPosition: pair.rightPosition,
            leftDriverId,
            rightDriverId,
          },
        });
        created.push({ id: matchup.id });
      }

      if (event.status === ArmageddonStatus.DRAFT || event.status === ArmageddonStatus.ROSTER_OPEN) {
        await tx.armageddonEvent.update({
          where: { id: eventId },
          data: { status: ArmageddonStatus.IN_PROGRESS },
        });
      }

      await this.logAudit(tx, 'ARMAGEDDON_MATCHUPS_GENERATE', 'ArmageddonEvent', eventId, {
        roundNumber,
        roundType: dto.roundType,
        count: created.length,
      }, audit);

      return { roundNumber, roundType: dto.roundType, count: created.length };
    });
  }

  async adminToggleMatchupMarket(matchupId: string, open: boolean, audit: AuditContext) {
    const matchup = await this.prisma.armageddonMatchup.findUnique({
      where: { id: matchupId },
      include: {
        leftDriver: { include: { cars: { where: { active: true }, take: 1 } } },
        rightDriver: { include: { cars: { where: { active: true }, take: 1 } } },
        event: true,
      },
    });
    if (!matchup) throw new NotFoundException('Confronto não encontrado');
    if (matchup.winnerSide) throw new BadRequestException('Confronto já liquidado');
    if (!matchup.leftDriver || !matchup.rightDriver) {
      throw new BadRequestException('Confronto sem pilotos definidos dos dois lados');
    }
    const leftDriver = matchup.leftDriver;
    const rightDriver = matchup.rightDriver;

    return this.prisma.$transaction(async (tx) => {
      if (open) {
        // Garantir que so um mercado fica aberto por evento Armageddon
        const siblings = await tx.armageddonMatchup.findMany({
          where: {
            eventId: matchup.eventId,
            marketOpen: true,
            id: { not: matchupId },
          },
          select: { id: true, duelId: true },
        });
        for (const sibling of siblings) {
          await tx.armageddonMatchup.update({
            where: { id: sibling.id },
            data: { marketOpen: false },
          });
          if (sibling.duelId) {
            await tx.duel.update({
              where: { id: sibling.duelId },
              data: { status: DuelStatus.BOOKING_CLOSED },
            }).catch(() => undefined);
          }
        }
      }

      let duelId = matchup.duelId;
      let eventId = matchup.event.eventId;

      if (open) {
        // 1. Event (criado uma vez por ArmageddonEvent)
        if (!eventId) {
          const createdEvent = await tx.event.create({
            data: {
              sport: 'DRAG_RACE',
              name: `Armageddon — ${matchup.event.name}`,
              bannerUrl: matchup.event.bannerUrl ?? null,
              featured: matchup.event.featured ?? false,
              startAt: matchup.event.scheduledAt,
              status: EventStatus.SCHEDULED,
            },
          });
          eventId = createdEvent.id;
          await tx.armageddonEvent.update({
            where: { id: matchup.eventId },
            data: { eventId },
          });
        }

        // 2. Cars
        const leftCarId = await this.ensureDriverCar(tx, leftDriver);
        const rightCarId = await this.ensureDriverCar(tx, rightDriver);

        // 3. Duel
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
              startsAt: matchup.event.scheduledAt,
              bookingCloseAt,
              status: DuelStatus.BOOKING_OPEN,
              notes: `Armageddon ${matchup.event.name} — Rodada ${matchup.roundNumber} #${matchup.order}`,
            },
          });
          duelId = createdDuel.id;
          await tx.armageddonMatchup.update({
            where: { id: matchupId },
            data: { duelId },
          });
        }

        await tx.duelPoolState.upsert({
          where: { duelId },
          create: { duelId, leftPool: 0, rightPool: 0, leftTickets: 0, rightTickets: 0 },
          update: { leftPool: 0, rightPool: 0, leftTickets: 0, rightTickets: 0 },
        });

        // 4. Market + Odds
        const existingMarket = await tx.market.findFirst({ where: { duelId } });
        if (!existingMarket) {
          const market = await tx.market.create({
            data: {
              eventId,
              duelId,
              name: `${leftDriver.name} x ${rightDriver.name}`,
              status: MarketStatus.OPEN,
              bookingCloseAt,
            },
          });
          await tx.odd.create({
            data: {
              marketId: market.id,
              label: leftDriver.name,
              value: new Prisma.Decimal('1.90'),
              status: OddStatus.ACTIVE,
            },
          });
          await tx.odd.create({
            data: {
              marketId: market.id,
              label: rightDriver.name,
              value: new Prisma.Decimal('1.90'),
              status: OddStatus.ACTIVE,
            },
          });
        } else {
          await tx.market.update({
            where: { id: existingMarket.id },
            data: { status: MarketStatus.OPEN, bookingCloseAt },
          });
        }

        if (matchup.event.status !== ArmageddonStatus.IN_PROGRESS) {
          await tx.armageddonEvent.update({
            where: { id: matchup.eventId },
            data: { status: ArmageddonStatus.IN_PROGRESS },
          });
        }
      } else if (duelId) {
        await tx.duel.update({
          where: { id: duelId },
          data: { status: DuelStatus.BOOKING_CLOSED },
        });
        await tx.market.updateMany({
          where: { duelId },
          data: { status: MarketStatus.SUSPENDED },
        });
      }

      const updated = await tx.armageddonMatchup.update({
        where: { id: matchupId },
        data: {
          marketOpen: open,
          ...(duelId && !matchup.duelId ? { duelId } : {}),
        },
      });

      await this.logAudit(
        tx,
        open ? 'ARMAGEDDON_MATCHUP_MARKET_OPEN' : 'ARMAGEDDON_MATCHUP_MARKET_CLOSE',
        'ArmageddonMatchup',
        matchupId,
        { open, duelId, eventId },
        audit,
      );
      return updated;
    }, { timeout: 20000, maxWait: 5000 });
  }

  async adminSettleMatchup(matchupId: string, dto: SettleArmageddonMatchupDto, audit: AuditContext) {
    const matchup = await this.prisma.armageddonMatchup.findUnique({
      where: { id: matchupId },
      include: { event: true },
    });
    if (!matchup) throw new NotFoundException('Confronto não encontrado');

    if (matchup.winnerSide && matchup.settledAt) {
      throw new BadRequestException('Esta rodada ja foi auditada e o vencedor e imutavel');
    }

    if (!dto.winnerSide || (dto.winnerSide !== 'LEFT' && dto.winnerSide !== 'RIGHT')) {
      throw new BadRequestException('winnerSide deve ser LEFT ou RIGHT');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.armageddonMatchup.update({
        where: { id: matchupId },
        data: {
          winnerSide: dto.winnerSide,
          settledAt: new Date(),
          notes: dto.notes ?? matchup.notes,
        },
      });

      // Swap roster positions WITHIN ArmageddonRoster only (standalone - nao toca ListRoster)
      if (
        dto.winnerSide === 'LEFT' &&
        matchup.leftPosition && matchup.rightPosition &&
        matchup.leftDriverId && matchup.rightDriverId &&
        matchup.roundType !== 'SHARK_TANK'
      ) {
        const challengerPos = matchup.leftPosition;
        const defenderPos = matchup.rightPosition;
        const challengerDriverId = matchup.leftDriverId;
        const defenderDriverId = matchup.rightDriverId;

        // Swap em 3 passos (mesmo padrao de brazil-lists)
        await tx.armageddonRoster.updateMany({
          where: { eventId: matchup.eventId, driverId: defenderDriverId },
          data: { position: -1 },
        });
        await tx.armageddonRoster.updateMany({
          where: { eventId: matchup.eventId, driverId: challengerDriverId },
          data: { position: defenderPos, isKing: defenderPos === 1 },
        });
        await tx.armageddonRoster.updateMany({
          where: { eventId: matchup.eventId, driverId: defenderDriverId },
          data: { position: challengerPos, isKing: false },
        });

        await this.logAudit(tx, 'ARMAGEDDON_ROSTER_SWAP', 'ArmageddonEvent', matchup.eventId, {
          matchupId, challengerPos, defenderPos, challengerDriverId, defenderDriverId,
        }, audit);
      }

      await this.logAudit(tx, 'ARMAGEDDON_MATCHUP_SETTLE', 'ArmageddonMatchup', matchupId, dto, audit);
      return updated;
    }, { timeout: 20000, maxWait: 5000 }).then(async (result) => {
      // Settle Duel/Market (paga apostas)
      let payoutError: string | null = null;
      if (matchup.duelId) {
        const hasMarket = await this.prisma.market.findFirst({
          where: { duelId: matchup.duelId, status: { in: ['OPEN', 'CLOSED', 'SUSPENDED'] } },
          select: { id: true },
        });
        if (hasMarket) {
          try {
            await this.settlementService.settleDuel(matchup.duelId, dto.winnerSide as 'LEFT' | 'RIGHT', audit);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`[CRITICAL] Settle do duel ${matchup.duelId} falhou: ${msg}`);
            payoutError = msg;
            await this.prisma.auditLog.create({
              data: {
                actorUserId: audit.actorUserId,
                action: 'ARMAGEDDON_SETTLE_DUEL_FAILED',
                entity: 'Duel',
                entityId: matchup.duelId,
                payload: { matchupId, winnerSide: dto.winnerSide, error: msg } as Prisma.InputJsonValue,
              },
            }).catch(() => undefined);
          }
        }
        try {
          await this.prisma.duel.update({
            where: { id: matchup.duelId },
            data: { status: DuelStatus.FINISHED },
          });
        } catch (e) {
          this.logger.warn(`Falha ao marcar duel ${matchup.duelId} como FINISHED: ${e instanceof Error ? e.message : e}`);
        }
      }

      // Auto-abrir proximo confronto pendente
      try {
        const nextMatchup = await this.prisma.armageddonMatchup.findFirst({
          where: {
            eventId: matchup.eventId,
            winnerSide: null,
            marketOpen: false,
            id: { not: matchupId },
          },
          orderBy: [{ roundNumber: 'asc' }, { order: 'asc' }],
        });
        if (nextMatchup && nextMatchup.leftDriverId && nextMatchup.rightDriverId) {
          await this.adminToggleMatchupMarket(nextMatchup.id, true, audit);
        }
      } catch (e) {
        this.logger.warn(`Falha ao abrir proximo confronto Armageddon: ${e instanceof Error ? e.message : e}`);
      }

      if (payoutError) {
        throw new BadRequestException(
          `Vencedor auditado mas LIQUIDACAO DAS APOSTAS FALHOU: ${payoutError}. Reconcilie manualmente em /admin/audit-logs.`,
        );
      }

      return result;
    });
  }

  async adminDeleteMatchup(matchupId: string, audit: AuditContext) {
    const matchup = await this.prisma.armageddonMatchup.findUnique({ where: { id: matchupId } });
    if (!matchup) throw new NotFoundException('Confronto não encontrado');

    return this.prisma.$transaction(async (tx) => {
      await tx.armageddonMatchup.delete({ where: { id: matchupId } });
      await this.logAudit(tx, 'ARMAGEDDON_MATCHUP_DELETE', 'ArmageddonMatchup', matchupId, null, audit);
      return { success: true };
    });
  }

  // ── helpers ────────────────────────────────────────────

  private async nextRoundNumber(eventId: string) {
    const last = await this.prisma.armageddonMatchup.findFirst({
      where: { eventId },
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    });
    return (last?.roundNumber ?? 0) + 1;
  }

  private async ensureDriverCar(
    tx: Prisma.TransactionClient,
    driver: { id: string; name: string; carNumber: string | null; team: string | null; cars: Array<{ id: string }> },
  ): Promise<string> {
    const existing = driver.cars[0];
    if (existing) return existing.id;
    const created = await tx.car.create({
      data: {
        driverId: driver.id,
        name: driver.team ? `${driver.name} — ${driver.team}` : driver.name,
        category: 'ARMAGEDDON',
        number: driver.carNumber ?? undefined,
      },
    });
    return created.id;
  }

  private serializeEvent(event: any) {
    const roster = (event.roster ?? []).map((r: any) => ({
      id: r.id,
      position: r.position,
      isKing: r.isKing,
      driverId: r.driverId,
      driverName: r.driver?.name,
      driverNickname: r.driver?.nickname,
      driverCarNumber: r.driver?.carNumber,
      driverTeam: r.driver?.team,
      driverHometown: r.driver?.hometown,
      fromListId: r.fromListId,
      fromAreaCode: r.fromAreaCode,
      fromPosition: r.fromPosition,
    }));
    const king = roster.find((r: any) => r.isKing) ?? null;

    return {
      id: event.id,
      name: event.name,
      description: event.description,
      bannerUrl: event.bannerUrl,
      featured: event.featured,
      format: event.format,
      scheduledAt: event.scheduledAt,
      endsAt: event.endsAt,
      status: event.status,
      eventId: event.eventId,
      notes: event.notes,
      roster,
      kingName: king?.driverName ?? null,
      rosterCount: roster.length,
      matchups: (event.matchups ?? []).map((m: any) => ({
        id: m.id,
        roundNumber: m.roundNumber,
        roundType: m.roundType,
        order: m.order,
        leftPosition: m.leftPosition,
        rightPosition: m.rightPosition,
        leftDriverId: m.leftDriverId,
        rightDriverId: m.rightDriverId,
        leftDriverName: m.leftDriver?.name ?? null,
        rightDriverName: m.rightDriver?.name ?? null,
        winnerSide: m.winnerSide,
        marketOpen: m.marketOpen,
        duelId: m.duelId,
        settledAt: m.settledAt,
        notes: m.notes,
      })),
    };
  }

  private async logAudit(
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
        payload: (payload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      },
    });
  }
}
