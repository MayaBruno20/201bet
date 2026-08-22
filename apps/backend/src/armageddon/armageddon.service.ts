import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ArmageddonBracketType,
  ArmageddonStage,
  ArmageddonStatus,
  BetStatus,
  DuelStatus,
  EventStatus,
  ListFormat,
  ListRoundType,
  MarketStatus,
  MarketType,
  MatchupSide,
  OddStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettlementService } from '../settlement.service';
import { CacheService } from '../cache/cache.service';
import { aggregatePoolsByOdd, computeMultiMarketFinancials } from '../multi-market-financials';
import { HOUSE_MARGIN_PERCENT } from '../market.service';
import { buildBracketPairs } from '../brazil-lists/brazil-lists.service';
import {
  buildArmageddonFirstDraw,
  buildArmageddonSecondDraw,
  buildSharkTankBracket,
  buildLevaTudoBracket,
  bracketSize,
  keysForBracketType,
  FIRST_DRAW_KEYS,
  MatchupSpec,
} from './armageddon-bracket.util';
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
  SaveSecondDrawLayoutDto,
  SettleArmageddonMatchupDto,
} from './dto/armageddon-matchup.dto';
import { CreateArmageddonMultiMarketDto } from './dto/armageddon-multi-market.dto';

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
    private readonly cache: CacheService,
  ) {}

  // ── Public ────────────────────────────────────────────

  async listPublic() {
    const events = await this.prisma.armageddonEvent.findMany({
      where: {
        status: { in: [ArmageddonStatus.IN_PROGRESS, ArmageddonStatus.FINISHED] },
        // Shark Tank tem hub público próprio (/shark-tank) — fora do Armageddon.
        bracketType: { notIn: [ArmageddonBracketType.SHARK_TANK, ArmageddonBracketType.LEVA_TUDO] },
      },
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

  /** Hub público do Shark Tank (só eventos SHARK_TANK em andamento/encerrados). */
  async listPublicSharkTank() {
    const events = await this.prisma.armageddonEvent.findMany({
      where: {
        status: { in: [ArmageddonStatus.IN_PROGRESS, ArmageddonStatus.FINISHED] },
        bracketType: ArmageddonBracketType.SHARK_TANK,
      },
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

  /** Hub público do Leva Tudo (só eventos LEVA_TUDO em andamento/encerrados). */
  async listPublicLevaTudo() {
    const events = await this.prisma.armageddonEvent.findMany({
      where: {
        status: { in: [ArmageddonStatus.IN_PROGRESS, ArmageddonStatus.FINISHED] },
        bracketType: ArmageddonBracketType.LEVA_TUDO,
      },
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
      // Shark Tank tem módulo admin próprio (/internal-admin/shark-tank).
      where: { bracketType: { notIn: [ArmageddonBracketType.SHARK_TANK, ArmageddonBracketType.LEVA_TUDO] } },
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

  /** Lista (admin) só os eventos SHARK_TANK — para o módulo Shark Tank. */
  async adminListSharkTank() {
    const events = await this.prisma.armageddonEvent.findMany({
      where: { bracketType: ArmageddonBracketType.SHARK_TANK },
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

  /** Lista (admin) só os eventos LEVA_TUDO — para o módulo Leva Tudo. */
  async adminListLevaTudo() {
    const events = await this.prisma.armageddonEvent.findMany({
      where: { bracketType: ArmageddonBracketType.LEVA_TUDO },
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
      // Cria Event de apostas EAGER para que o evento apareça em /admin/events
      // (dropdown do Multi-Runner) já no momento da criação, antes de qualquer
      // matchup abrir mercado.
      const linkedEvent = await tx.event.create({
        data: {
          sport: 'DRAG_RACE',
          name: dto.name,
          description: dto.description,
          bannerUrl: dto.bannerUrl ?? null,
          featured: dto.featured ?? false,
          startAt: startDate,
          status: EventStatus.SCHEDULED,
        },
      });

      const event = await tx.armageddonEvent.create({
        data: {
          name: dto.name,
          description: dto.description,
          bannerUrl: dto.bannerUrl,
          featured: dto.featured ?? false,
          format: dto.format ?? ListFormat.TOP_20,
          bracketType: dto.bracketType ?? ArmageddonBracketType.LADDER,
          streamUrl: dto.streamUrl,
          scheduledAt: startDate,
          endsAt: endDate,
          notes: dto.notes,
          status: ArmageddonStatus.DRAFT,
          eventId: linkedEvent.id,
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
          streamUrl: dto.streamUrl,
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

    // Anula mercados abertos do Event linkado antes da transação.
    if (existing.eventId) {
      const openMarkets = await this.prisma.market.findMany({
        where: { eventId: existing.eventId, status: { in: [MarketStatus.OPEN, MarketStatus.SUSPENDED] } },
        select: { id: true },
      });
      for (const m of openMarkets) {
        try { await this.settlementService.voidMarket(m.id, audit); }
        catch (e) {
          this.logger.warn(`Falha ao anular mercado ${m.id} ao cancelar ArmageddonEvent ${id}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Marca como CANCELED em vez de deletar — preserva histórico.
      await tx.armageddonEvent.update({
        where: { id },
        data: { status: ArmageddonStatus.CANCELED },
      });

      // Propaga cancel pro Event linkado.
      if (existing.eventId) {
        await tx.duel.updateMany({
          where: {
            eventId: existing.eventId,
            status: { in: [DuelStatus.SCHEDULED, DuelStatus.BOOKING_OPEN, DuelStatus.BOOKING_CLOSED] },
          },
          data: { status: DuelStatus.CANCELED },
        });
        await tx.market.updateMany({
          where: { eventId: existing.eventId, status: { not: MarketStatus.SETTLED } },
          data: { status: MarketStatus.CLOSED },
        });
        await tx.event.update({
          where: { id: existing.eventId },
          data: { status: EventStatus.CANCELED },
        });
      }

      await this.logAudit(tx, 'ARMAGEDDON_EVENT_CANCEL', 'ArmageddonEvent', id, { eventId: existing.eventId }, audit);
      return { success: true, status: 'CANCELED' };
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

    const isBracketed =
      event.bracketType === ArmageddonBracketType.ELIMINATION_144 ||
      event.bracketType === ArmageddonBracketType.SHARK_TANK ||
      event.bracketType === ArmageddonBracketType.LEVA_TUDO;
    let bracketKey: string | null = null;
    let maxPositions: number;

    if (isBracketed) {
      // Eliminação (144: chaves A-E de 32/28; Shark Tank: chaves A-D de 8): o
      // piloto entra numa chave, posição limitada ao tamanho dela.
      const keys = keysForBracketType(event.bracketType);
      bracketKey = (dto.bracketKey ?? '').toUpperCase();
      const size = bracketKey ? bracketSize(bracketKey, keys) : null;
      if (!size) {
        throw new BadRequestException(
          `Informe a chave (${keys.map((k) => k.key).join(', ')}) para este piloto`,
        );
      }
      maxPositions = size;
    } else {
      maxPositions = event.format === ListFormat.TOP_10 ? 10 : 20;
    }

    if (dto.position < 1 || dto.position > maxPositions) {
      throw new BadRequestException(
        `Posição inválida. ${isBracketed ? `Chave ${bracketKey}` : 'Este evento'} aceita posições 1–${maxPositions}.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const nickname = dto.driverNickname?.trim() || null;
      let driverId = dto.driverId;
      if (!driverId) {
        if (!dto.driverName) {
          throw new BadRequestException('Informe driverId ou driverName');
        }
        const driver = await tx.driver.create({
          data: { name: dto.driverName.trim(), nickname },
        });
        driverId = driver.id;
      } else if (nickname) {
        // Piloto existente: atualiza o apelido se o operador preencheu o campo.
        await tx.driver.update({ where: { id: driverId }, data: { nickname } });
      }

      // findFirst (não findUnique) porque a unicidade agora é (eventId, bracketKey, position)
      // e Prisma não casa findUnique com componente nulo em LADDER.
      const existingAtPosition = await tx.armageddonRoster.findFirst({
        where: { eventId, bracketKey, position: dto.position },
      });
      const existingDriver = await tx.armageddonRoster.findUnique({
        where: { eventId_driverId: { eventId, driverId } },
      });

      // Piloto já está no evento e foi movido (de outra chave/posição).
      if (existingDriver && (existingDriver.position !== dto.position || existingDriver.bracketKey !== bracketKey)) {
        if (existingAtPosition && existingAtPosition.id !== existingDriver.id) {
          // SWAP automático: ocupante do destino assume a origem do piloto movido.
          await tx.armageddonRoster.update({ where: { id: existingDriver.id }, data: { position: -1, bracketKey: null } });
          await tx.armageddonRoster.update({
            where: { id: existingAtPosition.id },
            data: { position: existingDriver.position, bracketKey: existingDriver.bracketKey, isKing: false },
          });
          const moved = await tx.armageddonRoster.update({
            where: { id: existingDriver.id },
            data: {
              position: dto.position,
              bracketKey,
              isKing: dto.isKing ?? false,
              notes: dto.notes ?? existingDriver.notes,
            },
            include: { driver: true },
          });
          await this.logAudit(tx, 'ARMAGEDDON_ROSTER_SWAP_MANUAL', 'ArmageddonEvent', eventId, {
            driverId, to: { bracketKey, position: dto.position }, swappedWithDriverId: existingAtPosition.driverId,
          }, audit);
          return moved;
        }
        await tx.armageddonRoster.delete({ where: { id: existingDriver.id } });
      }

      const data = {
        eventId,
        driverId,
        bracketKey,
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

  /**
   * Busca pilotos já cadastrados por nome/sobrenome (case-insensitive) e devolve,
   * para cada um, a(s) lista(s) Brasil a que pertence (DDD + posição). Usado no
   * cadastro do Armageddon: ao digitar o nome, já puxa a lista do piloto.
   */
  async adminSearchDrivers(q: string) {
    const query = (q ?? '').trim();
    if (query.length < 2) return [];
    const drivers = await this.prisma.driver.findMany({
      where: { name: { contains: query, mode: 'insensitive' }, active: true },
      take: 12,
      orderBy: { name: 'asc' },
      include: {
        rosters: {
          include: { list: { select: { id: true, areaCode: true, name: true } } },
          orderBy: { position: 'asc' },
        },
      },
    });
    return drivers.map((d) => ({
      driverId: d.id,
      name: d.name,
      team: d.team ?? null,
      lists: d.rosters.map((r) => ({
        listId: r.listId,
        areaCode: r.list.areaCode,
        listName: r.list.name,
        position: r.position,
      })),
    }));
  }

  // ── Admin: ELIMINATION_144 (5 chaves → Top 32 → campeão + 3º lugar) ──

  /**
   * Persiste uma árvore de eliminação numa única createMany. Os ids são gerados
   * na app (randomUUID) para que os ponteiros de avanço (next/loser) já saiam
   * resolvidos — sem 2º passo de update e sem 100+ round-trips no Neon.
   */
  private async persistBracket(
    tx: Prisma.TransactionClient,
    eventId: string,
    specs: MatchupSpec[],
    driverAt: (bracketKey: string | null, position: number) => string | undefined,
  ) {
    const idByKey = new Map<string, string>();
    for (const s of specs) idByKey.set(s.key, randomUUID());

    const data = specs.map((s) => ({
      id: idByKey.get(s.key)!,
      eventId,
      stage: s.stage as ArmageddonStage,
      bracketKey: s.bracketKey,
      roundNumber: s.roundNumber,
      order: s.order,
      leftPosition: s.leftPosition,
      rightPosition: s.rightPosition,
      leftDriverId: s.leftPosition != null ? driverAt(s.bracketKey, s.leftPosition) ?? null : null,
      rightDriverId: s.rightPosition != null ? driverAt(s.bracketKey, s.rightPosition) ?? null : null,
      nextMatchupId: s.nextKey ? idByKey.get(s.nextKey) ?? null : null,
      nextSlotSide: s.nextSlotSide as MatchupSide | null,
      loserToMatchupId: s.loserKey ? idByKey.get(s.loserKey) ?? null : null,
      loserToSlotSide: s.loserSlotSide as MatchupSide | null,
      isThirdPlace: s.isThirdPlace,
      isFinal: s.isFinal,
    }));

    await tx.armageddonMatchup.createMany({ data });
    return idByKey;
  }

  private requireElimination(event: { bracketType: ArmageddonBracketType }) {
    if (event.bracketType !== ArmageddonBracketType.ELIMINATION_144) {
      throw new BadRequestException('Disponível apenas para eventos de eliminação (144 pilotos)');
    }
  }

  private requireSharkTank(event: { bracketType: ArmageddonBracketType }) {
    if (event.bracketType !== ArmageddonBracketType.SHARK_TANK) {
      throw new BadRequestException('Disponível apenas para eventos Shark Tank');
    }
  }

  private requireLevaTudo(event: { bracketType: ArmageddonBracketType }) {
    if (event.bracketType !== ArmageddonBracketType.LEVA_TUDO) {
      throw new BadRequestException('Disponível apenas para eventos Leva Tudo');
    }
  }

  /** Aceita qualquer torneio de eliminação por árvore (144 ou Shark Tank). */
  private requireBracketed(event: { bracketType: ArmageddonBracketType }) {
    if (event.bracketType === ArmageddonBracketType.LADDER) {
      throw new BadRequestException('Disponível apenas para eventos de eliminação por chaves');
    }
  }

  // ── Admin: SHARK_TANK (4 chaves de 8 → Fase Final: finalista x Top 20) ──

  /**
   * Gera o chaveamento do Shark Tank: 4 chaves (A-D) de 8, eliminação 8→4→2→1,
   * + os 4 desafios da Fase Final. A 1ª rodada das chaves é preenchida a partir
   * do roster (bracketKey + posição). O finalista de cada chave avança sozinho
   * (LEFT) para o desafio; o rival (RIGHT) é definido depois no admin.
   */
  async adminGenerateSharkTankBracket(eventId: string, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id: eventId },
      include: { roster: true },
    });
    if (!event) throw new NotFoundException('Evento Shark Tank não encontrado');
    this.requireSharkTank(event);

    const settled = await this.prisma.armageddonMatchup.count({
      where: { eventId, winnerSide: { not: null } },
    });
    if (settled > 0) {
      throw new BadRequestException('Já há embates auditados — use "Reiniciar evento" para estornar e recomeçar.');
    }
    const withMarket = await this.prisma.armageddonMatchup.count({
      where: { eventId, OR: [{ marketOpen: true }, { duelId: { not: null } }] },
    });
    if (withMarket > 0) {
      throw new BadRequestException('Há mercados abertos/criados — feche-os antes de regerar as chaves.');
    }

    const driverAt = (bk: string | null, pos: number) =>
      event.roster.find((r) => r.bracketKey === bk && r.position === pos)?.driverId;
    const specs = buildSharkTankBracket();

    return this.prisma.$transaction(async (tx) => {
      await tx.armageddonMatchup.deleteMany({ where: { eventId } });
      await this.persistBracket(tx, eventId, specs, driverAt);
      if (event.status === ArmageddonStatus.DRAFT || event.status === ArmageddonStatus.ROSTER_OPEN) {
        await tx.armageddonEvent.update({ where: { id: eventId }, data: { status: ArmageddonStatus.IN_PROGRESS } });
      }
      await this.logAudit(tx, 'ARMAGEDDON_SHARK_TANK_GENERATE', 'ArmageddonEvent', eventId, {
        count: specs.length, rosterFilled: event.roster.length,
      }, audit);
      return { stage: 'SHARK_TANK', matchups: specs.length, rosterFilled: event.roster.length };
    }, { timeout: 30000, maxWait: 10000 });
  }

  // ── Admin: LEVA_TUDO (2 chaves de 32 → semi/final/3º) ──

  /**
   * Gera o chaveamento do Leva Tudo: 2 chaves (A-B) de 32 (eliminação 32→…→1)
   * + Grande Final (Campeão/Vice) e 3º lugar. A 1ª rodada de cada chave é
   * preenchida a partir do roster; vencedor/perdedor da final de cada chave
   * (semifinal) avançam automaticamente pra Grande Final e 3º lugar.
   */
  async adminGenerateLevaTudoBracket(eventId: string, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id: eventId },
      include: { roster: true },
    });
    if (!event) throw new NotFoundException('Evento Leva Tudo não encontrado');
    this.requireLevaTudo(event);

    const settled = await this.prisma.armageddonMatchup.count({
      where: { eventId, winnerSide: { not: null } },
    });
    if (settled > 0) {
      throw new BadRequestException('Já há embates auditados — use "Reiniciar evento" para estornar e recomeçar.');
    }
    const withMarket = await this.prisma.armageddonMatchup.count({
      where: { eventId, OR: [{ marketOpen: true }, { duelId: { not: null } }] },
    });
    if (withMarket > 0) {
      throw new BadRequestException('Há mercados abertos/criados — feche-os antes de regerar as chaves.');
    }

    const driverAt = (bk: string | null, pos: number) =>
      event.roster.find((r) => r.bracketKey === bk && r.position === pos)?.driverId;
    const specs = buildLevaTudoBracket();

    return this.prisma.$transaction(async (tx) => {
      await tx.armageddonMatchup.deleteMany({ where: { eventId } });
      await this.persistBracket(tx, eventId, specs, driverAt);
      // Pilotos que ficaram sem adversário na 1ª rodada (roster < 32) já sobem
      // sozinhos — senão a chave trava em "Aguardando…" esperando um rival que
      // nunca existiu.
      await this.autoAdvanceByes(tx, eventId);
      if (event.status === ArmageddonStatus.DRAFT || event.status === ArmageddonStatus.ROSTER_OPEN) {
        await tx.armageddonEvent.update({ where: { id: eventId }, data: { status: ArmageddonStatus.IN_PROGRESS } });
      }
      await this.logAudit(tx, 'ARMAGEDDON_LEVA_TUDO_GENERATE', 'ArmageddonEvent', eventId, {
        count: specs.length, rosterFilled: event.roster.length,
      }, audit);
      return { stage: 'LEVA_TUDO', matchups: specs.length, rosterFilled: event.roster.length };
    }, { timeout: 30000, maxWait: 10000 });
  }

  /**
   * Avança automaticamente os byes: embate com UM piloto só, cujo lado vazio não
   * recebe classificado de ninguém (roster < tamanho da chave). O piloto sobe
   * para a próxima bateria e o bye é marcado como decidido. Roda em loop porque
   * um bye pode habilitar outro nível acima (raro, mas coberto). Sem mercado/
   * aposta envolvidos (byes existem antes de abrir mercado).
   */
  private async autoAdvanceByes(tx: Prisma.TransactionClient, eventId: string) {
    const ms = await tx.armageddonMatchup.findMany({
      where: { eventId },
      select: {
        id: true, leftDriverId: true, rightDriverId: true, winnerSide: true,
        nextMatchupId: true, nextSlotSide: true, loserToMatchupId: true, loserToSlotSide: true,
      },
    });
    const byId = new Map(ms.map((m) => [m.id, m]));
    const fed = new Set<string>();
    for (const m of ms) {
      if (m.nextMatchupId && m.nextSlotSide) fed.add(`${m.nextMatchupId}:${m.nextSlotSide}`);
      if (m.loserToMatchupId && m.loserToSlotSide) fed.add(`${m.loserToMatchupId}:${m.loserToSlotSide}`);
    }
    let advanced = true;
    let guard = 0;
    while (advanced && guard++ < 20) {
      advanced = false;
      for (const m of ms) {
        if (m.winnerSide) continue;
        const hasLeft = !!m.leftDriverId;
        const hasRight = !!m.rightDriverId;
        if (hasLeft === hasRight) continue; // 0 ou 2 pilotos: não é bye
        const emptySide = hasLeft ? MatchupSide.RIGHT : MatchupSide.LEFT;
        if (fed.has(`${m.id}:${emptySide}`)) continue; // aguarda classificado → não é bye
        const presentSide = hasLeft ? MatchupSide.LEFT : MatchupSide.RIGHT;
        const driverId = hasLeft ? m.leftDriverId : m.rightDriverId;
        if (m.nextMatchupId && m.nextSlotSide) {
          const next = byId.get(m.nextMatchupId);
          if (next) {
            if (m.nextSlotSide === MatchupSide.LEFT) next.leftDriverId = driverId;
            else next.rightDriverId = driverId;
          }
          await tx.armageddonMatchup.update({
            where: { id: m.nextMatchupId },
            data: m.nextSlotSide === MatchupSide.LEFT
              ? { leftDriverId: driverId }
              : { rightDriverId: driverId },
          });
        }
        await tx.armageddonMatchup.update({
          where: { id: m.id },
          data: { winnerSide: presentSide, settledAt: new Date(), notes: 'Passou sem adversário (bye)' },
        });
        m.winnerSide = presentSide;
        advanced = true;
      }
    }
  }

  /**
   * WO / não compareceu ("acesso rápido" da cabeceira): fecha o mercado (se
   * aberto) e audita o piloto PRESENTE como vencedor — ele avança na chave e
   * paga quem apostou nele (rateio normal). Para imprevistos (quebra sem
   * substituto, falta) depois do embate já aberto — substituição só vale antes.
   */
  async adminWalkover(matchupId: string, presentSide: MatchupSide, audit: AuditContext) {
    const m = await this.prisma.armageddonMatchup.findUnique({ where: { id: matchupId } });
    if (!m) throw new NotFoundException('Confronto não encontrado');
    if (m.winnerSide && m.settledAt) {
      throw new BadRequestException('Esta bateria já foi auditada.');
    }
    if (presentSide !== MatchupSide.LEFT && presentSide !== MatchupSide.RIGHT) {
      throw new BadRequestException('Informe o lado presente (LEFT ou RIGHT).');
    }
    const presentDriver = presentSide === MatchupSide.LEFT ? m.leftDriverId : m.rightDriverId;
    if (!presentDriver) {
      throw new BadRequestException('O lado presente não tem piloto definido.');
    }
    // Se o oponente está VAZIO, só deixa avançar quando é um bye de verdade —
    // ou seja, o lado vazio não recebe classificado de nenhum outro embate.
    // Sem isso, o operador poderia adiantar um piloto cujo rival ainda vem.
    const opponentDriver = presentSide === MatchupSide.LEFT ? m.rightDriverId : m.leftDriverId;
    if (!opponentDriver) {
      const emptySide = presentSide === MatchupSide.LEFT ? MatchupSide.RIGHT : MatchupSide.LEFT;
      const feeder = await this.prisma.armageddonMatchup.findFirst({
        where: {
          eventId: m.eventId,
          OR: [
            { nextMatchupId: m.id, nextSlotSide: emptySide },
            { loserToMatchupId: m.id, loserToSlotSide: emptySide },
          ],
        },
        select: { id: true },
      });
      if (feeder) {
        throw new BadRequestException('O lado vazio ainda aguarda o classificado de outro embate — não dá pra avançar por bye.');
      }
    }
    // Fecha o mercado antes de auditar (evita aposta nova no meio do WO).
    if (m.marketOpen) {
      await this.adminToggleMatchupMarket(matchupId, false, audit).catch(() => undefined);
    }
    return this.adminSettleMatchup(
      matchupId,
      { winnerSide: presentSide, notes: 'WO / não compareceu' },
      audit,
    );
  }

  /**
   * Define o rival (RIGHT) de um desafio da Fase Final — um piloto do Top 20 da
   * Lista escolhido pelo admin. O finalista (LEFT) entra por avanço quando a
   * chave termina. Recusa se o desafio já tem mercado aberto ou foi auditado.
   */
  async adminSetChallengeOpponent(
    matchupId: string,
    dto: { driverId?: string; driverName?: string; driverNickname?: string },
    audit: AuditContext,
  ) {
    const m = await this.prisma.armageddonMatchup.findUnique({
      where: { id: matchupId },
      include: { event: { select: { bracketType: true } } },
    });
    if (!m) throw new NotFoundException('Desafio não encontrado');
    if (
      m.event.bracketType !== ArmageddonBracketType.SHARK_TANK ||
      m.stage !== ArmageddonStage.SECOND_DRAW
    ) {
      throw new BadRequestException('Este confronto não é um desafio da Fase Final do Shark Tank');
    }
    if (m.winnerSide || m.marketOpen) {
      throw new BadRequestException('Não dá pra trocar o rival de um desafio com mercado aberto ou já auditado.');
    }

    return this.prisma.$transaction(async (tx) => {
      const nickname = dto.driverNickname?.trim() || null;
      let driverId = dto.driverId;
      if (!driverId) {
        if (!dto.driverName?.trim()) throw new BadRequestException('Informe driverId ou driverName');
        const driver = await tx.driver.create({ data: { name: dto.driverName.trim(), nickname } });
        driverId = driver.id;
      } else if (nickname) {
        await tx.driver.update({ where: { id: driverId }, data: { nickname } });
      }
      const updated = await tx.armageddonMatchup.update({
        where: { id: matchupId },
        data: { rightDriverId: driverId },
      });
      await this.logAudit(tx, 'ARMAGEDDON_SHARK_CHALLENGE_OPPONENT', 'ArmageddonMatchup', matchupId, { driverId }, audit);
      return updated;
    });
  }

  /** Driver vencedor de um embate terminal (classificado do 1º sorteio). */
  private winnerDriverId(m: { winnerSide: MatchupSide | null; leftDriverId: string | null; rightDriverId: string | null }) {
    if (!m.winnerSide) return null;
    return m.winnerSide === 'LEFT' ? m.leftDriverId : m.rightDriverId;
  }

  /** Gera as 5 chaves do 1º sorteio a partir do roster (chave A-E + posição). */
  async adminGenerateFirstDraw(eventId: string, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id: eventId },
      include: { roster: true },
    });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');
    this.requireElimination(event);

    const settled = await this.prisma.armageddonMatchup.count({
      where: { eventId, stage: ArmageddonStage.FIRST_DRAW, winnerSide: { not: null } },
    });
    if (settled > 0) {
      throw new BadRequestException('Já há embates auditados no 1º sorteio — não é possível regerar.');
    }

    const driverAt = (bk: string | null, pos: number) =>
      event.roster.find((r) => r.bracketKey === bk && r.position === pos)?.driverId;

    const specs = buildArmageddonFirstDraw();

    return this.prisma.$transaction(async (tx) => {
      await tx.armageddonMatchup.deleteMany({ where: { eventId, stage: ArmageddonStage.FIRST_DRAW } });
      await this.persistBracket(tx, eventId, specs, driverAt);

      if (event.status === ArmageddonStatus.DRAFT || event.status === ArmageddonStatus.ROSTER_OPEN) {
        await tx.armageddonEvent.update({ where: { id: eventId }, data: { status: ArmageddonStatus.IN_PROGRESS } });
      }
      const filled = event.roster.length;
      await this.logAudit(tx, 'ARMAGEDDON_FIRST_DRAW_GENERATE', 'ArmageddonEvent', eventId, {
        count: specs.length, rosterFilled: filled,
      }, audit);
      return { stage: 'FIRST_DRAW', matchups: specs.length, rosterFilled: filled };
    }, { timeout: 30000, maxWait: 10000 });
  }

  /**
   * "Refazer chaves": zera os matchups do evento para regerar o sorteio.
   * Operação ESTRUTURAL pura — NÃO mexe em dinheiro. Por isso recusa se houver
   * embate auditado ou mercado aberto/criado (esses casos vão para "Reiniciar evento",
   * que estorna). Assim nenhum Duel/Market/Bet fica órfão.
   */
  async adminClearKeys(eventId: string, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');
    this.requireBracketed(event);

    const settled = await this.prisma.armageddonMatchup.count({
      where: { eventId, winnerSide: { not: null } },
    });
    if (settled > 0) {
      throw new BadRequestException(
        'Há embates auditados neste evento. Use "Reiniciar evento" para estornar as apostas e recomeçar.',
      );
    }
    const withMarket = await this.prisma.armageddonMatchup.count({
      where: { eventId, OR: [{ marketOpen: true }, { duelId: { not: null } }] },
    });
    if (withMarket > 0) {
      throw new BadRequestException(
        'Há mercados abertos/criados. Feche os mercados (ou use "Reiniciar evento") antes de refazer as chaves.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.armageddonMatchup.deleteMany({ where: { eventId } });
      await tx.armageddonEvent.update({
        where: { id: eventId },
        data: { status: ArmageddonStatus.ROSTER_OPEN },
      });
      await this.logAudit(tx, 'ARMAGEDDON_KEYS_CLEARED', 'ArmageddonEvent', eventId, {
        removed: removed.count,
      }, audit);
      return { success: true, removed: removed.count };
    }, { timeout: 30000, maxWait: 10000 });
  }

  /**
   * "Reiniciar evento": estorna TODAS as apostas (mercados liquidados são
   * reembolsados via refundSettledMarket; abertos via voidMarket) e regenera o
   * 1º sorteio (a chave volta à original a partir do roster intacto). Move dinheiro
   * — exige confirmação dupla no front.
   */
  async adminResetEvent(eventId: string, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id: eventId },
      include: { roster: true, matchups: { select: { id: true, duelId: true } } },
    });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');
    this.requireBracketed(event);

    // 1) Reembolsa/anula mercado a mercado (fora da tx estrutural, isolando falhas).
    const duelIds = event.matchups.map((m) => m.duelId).filter((id): id is string => !!id);
    let refunded = 0;
    let voided = 0;
    const failures: Array<{ marketId: string; error: string }> = [];
    if (duelIds.length) {
      const markets = await this.prisma.market.findMany({
        where: { duelId: { in: duelIds } },
        select: { id: true, status: true },
      });
      for (const mk of markets) {
        try {
          if (mk.status === MarketStatus.SETTLED) {
            await this.settlementService.refundSettledMarket(mk.id, audit);
            refunded += 1;
          } else if ([MarketStatus.OPEN, MarketStatus.SUSPENDED, MarketStatus.CLOSED].includes(mk.status)) {
            await this.settlementService.voidMarket(mk.id, audit);
            voided += 1;
          }
        } catch (e) {
          failures.push({ marketId: mk.id, error: e instanceof Error ? e.message : String(e) });
          this.logger.error(`Reset: falha ao estornar/anular mercado ${mk.id}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    // 2) Reset estrutural: cancela duelos, fecha mercados, apaga matchups e regenera as chaves.
    const driverAt = (bk: string | null, pos: number) =>
      event.roster.find((r) => r.bracketKey === bk && r.position === pos)?.driverId;
    const specs =
      event.bracketType === ArmageddonBracketType.SHARK_TANK
        ? buildSharkTankBracket()
        : event.bracketType === ArmageddonBracketType.LEVA_TUDO
          ? buildLevaTudoBracket()
          : buildArmageddonFirstDraw();

    await this.prisma.$transaction(async (tx) => {
      if (event.eventId) {
        await tx.duel.updateMany({
          where: { eventId: event.eventId, status: { in: [DuelStatus.SCHEDULED, DuelStatus.BOOKING_OPEN, DuelStatus.BOOKING_CLOSED] } },
          data: { status: DuelStatus.CANCELED },
        });
        await tx.market.updateMany({
          where: { eventId: event.eventId, status: { not: MarketStatus.SETTLED } },
          data: { status: MarketStatus.CLOSED },
        });
      }
      await tx.armageddonMatchup.deleteMany({ where: { eventId } });
      await this.persistBracket(tx, eventId, specs, driverAt);
      await tx.armageddonEvent.update({ where: { id: eventId }, data: { status: ArmageddonStatus.IN_PROGRESS } });
      await this.logAudit(tx, 'ARMAGEDDON_EVENT_RESET', 'ArmageddonEvent', eventId, {
        refunded, voided, failures, matchups: specs.length,
      }, audit);
    }, { timeout: 60000, maxWait: 10000 });

    // 3) Invalida o cache público (senão /eventos e destaque mostram estado velho).
    await this.cache.del('events:public:v4').catch(() => undefined);
    await this.cache.del('events:featured:v2').catch(() => undefined);

    return { reset: true, refunded, voided, failures, matchups: specs.length };
  }

  /** Gera a chave única do 2º sorteio (Top 32 → final + 3º lugar), slots vazios para o DnD. */
  async adminGenerateSecondDraw(eventId: string, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id: eventId },
      include: { matchups: { include: { leftDriver: true, rightDriver: true } } },
    });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');
    this.requireElimination(event);

    const firstDraw = event.matchups.filter((m) => m.stage === ArmageddonStage.FIRST_DRAW);
    const terminals = firstDraw.filter((m) => m.nextMatchupId === null);
    const decided = terminals.filter((m) => m.winnerSide);
    if (terminals.length === 0) {
      throw new BadRequestException('Gere o 1º sorteio antes do 2º.');
    }
    if (decided.length < terminals.length) {
      throw new BadRequestException(
        `1º sorteio incompleto: ${decided.length}/${terminals.length} classificados decididos.`,
      );
    }

    const qualifiers = terminals
      .map((m) => {
        const driverId = this.winnerDriverId(m);
        const driver = m.winnerSide === 'LEFT' ? m.leftDriver : m.rightDriver;
        return driverId ? { driverId, driverName: driver?.name ?? null, bracketKey: m.bracketKey } : null;
      })
      .filter((q): q is { driverId: string; driverName: string | null; bracketKey: string | null } => !!q);

    const specs = buildArmageddonSecondDraw();

    const out = await this.prisma.$transaction(async (tx) => {
      const settled2 = await tx.armageddonMatchup.count({
        where: { eventId, stage: ArmageddonStage.SECOND_DRAW, winnerSide: { not: null } },
      });
      if (settled2 > 0) throw new BadRequestException('2º sorteio já tem embates auditados — não é possível regerar.');

      await tx.armageddonMatchup.deleteMany({ where: { eventId, stage: ArmageddonStage.SECOND_DRAW } });
      await this.persistBracket(tx, eventId, specs, () => undefined); // slots vazios → DnD preenche

      await this.logAudit(tx, 'ARMAGEDDON_SECOND_DRAW_GENERATE', 'ArmageddonEvent', eventId, {
        count: specs.length, qualifiers: qualifiers.length,
      }, audit);
      return { stage: 'SECOND_DRAW', matchups: specs.length, qualifiers };
    }, { timeout: 30000, maxWait: 10000 });

    // Os 32 classificados estão definidos → apura automaticamente os mercados de
    // resorteio (QUALIFY). Falha aqui NÃO desfaz o 2º sorteio: o admin pode
    // reapurar manualmente (POST :id/settle-qualify).
    let qualifySettled = 0;
    try {
      const r = await this.settleQualifyMarketsForEvent(eventId, audit);
      qualifySettled = r.settled;
    } catch (e) {
      this.logger.warn(`Auto-apuração dos classificados falhou (apure manualmente): ${e instanceof Error ? e.message : e}`);
    }
    return { ...out, qualifySettled };
  }

  /**
   * Apura os mercados de classificados (QUALIFY) do evento: paga TODOS que
   * bancaram os pilotos que venceram as baterias terminais do 1º sorteio — os
   * que vão ao resorteio. Idempotente (mercados já liquidados são ignorados).
   * Disparado ao gerar o 2º sorteio; também exposto para reapuração manual.
   */
  async settleQualifyMarketsForEvent(eventId: string, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id: eventId },
      include: { matchups: { include: { leftDriver: true, rightDriver: true } } },
    });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');
    if (!event.eventId) return { settled: 0, markets: [] as Array<{ marketId: string; winners: number }> };

    const terminals = event.matchups.filter(
      (m) => m.stage === ArmageddonStage.FIRST_DRAW && m.nextMatchupId === null,
    );
    const decided = terminals.filter((m) => m.winnerSide);
    if (terminals.length === 0 || decided.length < terminals.length) {
      throw new BadRequestException('1º sorteio incompleto — não dá para apurar os classificados.');
    }
    const qualifierDriverIds = new Set(
      decided.map((m) => this.winnerDriverId(m)).filter((id): id is string => !!id),
    );
    if (qualifierDriverIds.size === 0) throw new BadRequestException('Nenhum classificado identificado.');

    const markets = await this.prisma.market.findMany({
      where: { eventId: event.eventId, type: MarketType.QUALIFY, status: { not: MarketStatus.SETTLED } },
      include: { odds: true },
    });

    const results: Array<{ marketId: string; winners: number }> = [];
    for (const m of markets) {
      const winnerOddIds = m.odds
        .filter((o) => o.driverId && qualifierDriverIds.has(o.driverId))
        .map((o) => o.id);
      if (winnerOddIds.length === 0) continue;
      await this.settlementService.settleMultiWinnerMarket(m.id, winnerOddIds, audit);
      results.push({ marketId: m.id, winners: winnerOddIds.length });
    }

    await this.prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: 'ARMAGEDDON_QUALIFY_AUTO_SETTLE',
        entity: 'ArmageddonEvent',
        entityId: eventId,
        payload: { qualifiers: qualifierDriverIds.size, marketsSettled: results.length } as Prisma.InputJsonValue,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      },
    });
    return { settled: results.length, markets: results };
  }

  /** Salva o posicionamento (arrasta-e-solta) da 1ª rodada do 2º sorteio. */
  async adminSaveSecondDrawLayout(eventId: string, dto: SaveSecondDrawLayoutDto, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');
    this.requireElimination(event);

    return this.prisma.$transaction(async (tx) => {
      let saved = 0;
      for (const slot of dto.slots) {
        const m = await tx.armageddonMatchup.findFirst({
          where: { id: slot.matchupId, eventId, stage: ArmageddonStage.SECOND_DRAW, roundNumber: 1 },
        });
        if (!m) continue;
        if (m.winnerSide || m.marketOpen) {
          throw new BadRequestException('Não é possível reposicionar um embate com mercado aberto ou já auditado.');
        }
        await tx.armageddonMatchup.update({
          where: { id: m.id },
          data: { leftDriverId: slot.leftDriverId ?? null, rightDriverId: slot.rightDriverId ?? null },
        });
        saved += 1;
      }
      await this.logAudit(tx, 'ARMAGEDDON_SECOND_DRAW_LAYOUT', 'ArmageddonEvent', eventId, { saved }, audit);
      return { saved };
    }, { timeout: 30000, maxWait: 10000 });
  }

  /**
   * Abre o mercado de TODOS os embates prontos (ambos os pilotos definidos, sem
   * mercado/auditoria). Filtrável por chave (`bracketKey`), rodada (`roundNumber`)
   * e/ou fase (`stage`) — usado pelo "abrir todos da rodada".
   */
  async adminOpenAllReady(
    eventId: string,
    audit: AuditContext,
    filter?: { bracketKey?: string; roundNumber?: number; stage?: ArmageddonStage },
  ) {
    const ready = await this.prisma.armageddonMatchup.findMany({
      where: {
        eventId,
        winnerSide: null,
        marketOpen: false,
        leftDriverId: { not: null },
        rightDriverId: { not: null },
        ...(filter?.bracketKey ? { bracketKey: filter.bracketKey } : {}),
        ...(filter?.roundNumber ? { roundNumber: filter.roundNumber } : {}),
        ...(filter?.stage ? { stage: filter.stage } : {}),
      },
      orderBy: [{ stage: 'asc' }, { bracketKey: 'asc' }, { roundNumber: 'asc' }, { order: 'asc' }],
      select: { id: true },
    });

    let opened = 0;
    const failures: Array<{ id: string; error: string }> = [];
    for (const m of ready) {
      try {
        await this.adminToggleMatchupMarket(m.id, true, audit);
        opened += 1;
      } catch (e) {
        failures.push({ id: m.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    await this.logAudit(this.prisma as unknown as Prisma.TransactionClient, 'ARMAGEDDON_OPEN_ALL_READY', 'ArmageddonEvent', eventId, {
      total: ready.length, opened, failures, filter,
    }, audit);
    return { total: ready.length, opened, failures };
  }

  /**
   * Fecha o mercado de TODOS os embates abertos e ainda não auditados. Filtrável
   * por chave (`bracketKey`), rodada (`roundNumber`) e/ou fase (`stage`).
   */
  async adminCloseAllOpen(
    eventId: string,
    audit: AuditContext,
    filter?: { bracketKey?: string; roundNumber?: number; stage?: ArmageddonStage },
  ) {
    const open = await this.prisma.armageddonMatchup.findMany({
      where: {
        eventId,
        marketOpen: true,
        winnerSide: null,
        ...(filter?.bracketKey ? { bracketKey: filter.bracketKey } : {}),
        ...(filter?.roundNumber ? { roundNumber: filter.roundNumber } : {}),
        ...(filter?.stage ? { stage: filter.stage } : {}),
      },
      orderBy: [{ stage: 'asc' }, { bracketKey: 'asc' }, { roundNumber: 'asc' }, { order: 'asc' }],
      select: { id: true },
    });

    let closed = 0;
    const failures: Array<{ id: string; error: string }> = [];
    for (const m of open) {
      try {
        await this.adminToggleMatchupMarket(m.id, false, audit);
        closed += 1;
      } catch (e) {
        failures.push({ id: m.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    await this.logAudit(this.prisma as unknown as Prisma.TransactionClient, 'ARMAGEDDON_CLOSE_ALL_OPEN', 'ArmageddonEvent', eventId, {
      total: open.length, closed, failures, filter,
    }, audit);
    return { total: open.length, closed, failures };
  }

  /** Resumo financeiro do evento (pote total + por embate) para a sessão de auditoria. */
  async adminGetFinancialSummary(eventId: string) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id: eventId },
      include: {
        matchups: {
          orderBy: [{ stage: 'asc' }, { bracketKey: 'asc' }, { roundNumber: 'asc' }, { order: 'asc' }],
          include: { leftDriver: true, rightDriver: true },
        },
      },
    });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');

    const duelIds = event.matchups.map((m) => m.duelId).filter((id): id is string => !!id);
    const poolStates = duelIds.length
      ? await this.prisma.duelPoolState.findMany({ where: { duelId: { in: duelIds } } })
      : [];
    const poolByDuel = new Map(poolStates.map((p) => [p.duelId, p]));

    let totalPool = 0;
    let openMarkets = 0;
    let settledCount = 0;
    const matchups = event.matchups.map((m) => {
      const p = m.duelId ? poolByDuel.get(m.duelId) : undefined;
      const leftPool = Number(p?.leftPool ?? 0);
      const rightPool = Number(p?.rightPool ?? 0);
      const passPool = leftPool + rightPool;
      totalPool += passPool;
      if (m.marketOpen) openMarkets += 1;
      if (m.winnerSide) settledCount += 1;
      return {
        id: m.id,
        stage: m.stage,
        bracketKey: m.bracketKey,
        roundNumber: m.roundNumber,
        order: m.order,
        isThirdPlace: m.isThirdPlace,
        isFinal: m.isFinal,
        leftDriverName: m.leftDriver?.name ?? null,
        rightDriverName: m.rightDriver?.name ?? null,
        winnerSide: m.winnerSide,
        marketOpen: m.marketOpen,
        leftPool,
        rightPool,
        totalPool: passPool,
        leftPercent: passPool > 0 ? (leftPool / passPool) * 100 : 0,
        rightPercent: passPool > 0 ? (rightPool / passPool) * 100 : 0,
      };
    });

    return {
      eventId: event.id,
      name: event.name,
      status: event.status,
      bracketType: event.bracketType,
      totalPool,
      openMarkets,
      settledCount,
      totalMatchups: event.matchups.length,
      matchups,
    };
  }

  // ── Admin: multi-mercados (campeão / reação / queimada do evento) ──
  //
  // Motor pari-mutuel de N opções sobre o Event vinculado ao Armageddon.
  // NÃO toca no motor dos embates 1x1 (Duel/DuelPoolState): mercados aqui são
  // type != DUEL, vivem no MultiRunnerMarketService e liquidam pelo
  // settleMarket genérico (rake fixo de 20%, casa nunca paga do próprio bolso).

  /**
   * Garante o Event de apostas vinculado. Eventos antigos (criados antes do
   * vínculo eager no adminCreate) podem não ter — cria sob demanda.
   */
  private async ensureLinkedEvent(
    tx: Prisma.TransactionClient,
    armaEvent: { id: string; eventId: string | null; name: string; description: string | null; bannerUrl: string | null; featured: boolean; scheduledAt: Date },
  ): Promise<string> {
    // Lock + releitura DENTRO da transação: o snapshot recebido veio de fora,
    // e duas criações concorrentes num evento legado (eventId null) criariam
    // dois Events — o mercado do "perdedor" ficaria órfão, invisível na aba
    // do Armageddon mas ainda apostável no site.
    const fresh = await tx.$queryRaw<Array<{ eventId: string | null }>>`
      SELECT "eventId" FROM "ArmageddonEvent" WHERE id = ${armaEvent.id} FOR UPDATE
    `.then((rows) => rows[0] ?? null);
    if (!fresh) throw new NotFoundException('Evento Armageddon não encontrado');
    if (fresh.eventId) return fresh.eventId;

    const linkedEvent = await tx.event.create({
      data: {
        sport: 'DRAG_RACE',
        name: armaEvent.name,
        description: armaEvent.description,
        bannerUrl: armaEvent.bannerUrl,
        featured: armaEvent.featured,
        startAt: armaEvent.scheduledAt,
        status: EventStatus.SCHEDULED,
      },
    });
    await tx.armageddonEvent.update({
      where: { id: armaEvent.id },
      data: { eventId: linkedEvent.id },
    });
    return linkedEvent.id;
  }

  async adminCreateMultiMarket(eventId: string, dto: CreateArmageddonMultiMarketDto, audit: AuditContext) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id: eventId },
      include: { roster: { include: { driver: true }, orderBy: { position: 'asc' } } },
    });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');
    if (event.status === ArmageddonStatus.CANCELED || event.status === ArmageddonStatus.FINISHED) {
      throw new BadRequestException('Evento encerrado/cancelado não pode abrir novos mercados');
    }
    if (event.roster.length < 2) {
      throw new BadRequestException('Cadastre o roster antes de criar um multi-mercado');
    }

    // Opções do mercado = pilotos do roster (todos, ou o subconjunto pedido).
    // Dedupe defensivo: driverIds repetidos criariam duas odds idênticas para
    // o mesmo piloto, rachando o pote dele em opções indistinguíveis.
    let rosterEntries = event.roster;
    if (dto.driverIds?.length) {
      const uniqueIds = [...new Set(dto.driverIds)];
      const byDriver = new Map(event.roster.map((r) => [r.driverId, r]));
      const missing = uniqueIds.filter((id) => !byDriver.has(id));
      if (missing.length > 0) {
        throw new BadRequestException('Há pilotos selecionados que não estão no roster deste evento');
      }
      rosterEntries = uniqueIds.map((id) => byDriver.get(id)!);
    }
    if (rosterEntries.length < 2) {
      throw new BadRequestException('O mercado precisa de pelo menos 2 pilotos');
    }

    const marketType = MarketType[dto.type];
    // Resorteio (QUALIFY) depende da chave (A-E) de cada piloto pra agrupar e travar
    // o nº de finalistas apostáveis por chave. Sem chave o limite falharia aberto —
    // então recusamos criar o mercado com roster incompleto (defense-in-depth).
    if (marketType === MarketType.QUALIFY && rosterEntries.some((r) => !r.bracketKey)) {
      throw new BadRequestException(
        'Mercado de resorteio (QUALIFY) exige que todos os pilotos tenham chave (A-E) definida no roster.',
      );
    }
    const bookingCloseAt = dto.bookingCloseAt ? new Date(dto.bookingCloseAt) : null;

    const market = await this.prisma.$transaction(async (tx) => {
      const linkedEventId = await this.ensureLinkedEvent(tx, event);

      const created = await tx.market.create({
        data: {
          eventId: linkedEventId,
          name: dto.name.trim(),
          type: marketType,
          status: MarketStatus.OPEN,
          bookingCloseAt,
          autoCloseAtSemifinal: dto.autoCloseAtSemifinal ?? false,
          odds: {
            create: rosterEntries.map((r) => ({
              label: r.driver.name,
              // Liga a opção ao piloto → apuração por driverId (resorteio).
              driverId: r.driverId,
              // Copia a chave (A-E) do roster → agrupar runners por chave e travar
              // o nº de finalistas apostáveis por chave no resorteio (QUALIFY).
              bracketKey: r.bracketKey ?? null,
              value: new Prisma.Decimal(1),
              status: OddStatus.ACTIVE,
            })),
          },
        },
        include: { odds: { orderBy: { createdAt: 'asc' } }, event: { select: { id: true, name: true } } },
      });

      await this.logAudit(tx, 'ARMAGEDDON_MULTI_MARKET_CREATE', 'Market', created.id, {
        armageddonEventId: eventId,
        name: created.name,
        type: created.type,
        runners: rosterEntries.map((r) => r.driver.name),
      }, audit);

      return created;
    });

    return market;
  }

  /**
   * Multi-mercados do evento com pote por piloto, odds projetadas e fechamento
   * financeiro (projeção quando vivo; valores reais quando liquidado).
   */
  async adminListMultiMarkets(eventId: string) {
    const event = await this.prisma.armageddonEvent.findUnique({
      where: { id: eventId },
      select: { id: true, eventId: true, name: true },
    });
    if (!event) throw new NotFoundException('Evento Armageddon não encontrado');
    if (!event.eventId) return { armageddonEventId: eventId, linkedEventId: null, markets: [] };

    const markets = await this.prisma.market.findMany({
      where: { eventId: event.eventId, type: { not: MarketType.DUEL } },
      orderBy: { createdAt: 'desc' },
      include: { odds: { orderBy: { createdAt: 'asc' } } },
    });

    const liveOddIds = markets.filter((m) => m.status !== MarketStatus.SETTLED).flatMap((m) => m.odds.map((o) => o.id));
    const settledOddIds = markets.filter((m) => m.status === MarketStatus.SETTLED).flatMap((m) => m.odds.map((o) => o.id));
    const [livePools, settledPools] = await Promise.all([
      aggregatePoolsByOdd(this.prisma, liveOddIds, [BetStatus.OPEN]),
      aggregatePoolsByOdd(this.prisma, settledOddIds, [BetStatus.WON, BetStatus.LOST]),
    ]);

    return {
      armageddonEventId: eventId,
      linkedEventId: event.eventId,
      markets: markets.map((m) => {
        const source = m.status === MarketStatus.SETTLED ? settledPools : livePools;
        const runners = m.odds.map((o) => {
          const agg = source.get(o.id);
          return { oddId: o.id, label: o.label, pool: agg?.pool ?? 0, tickets: agg?.tickets ?? 0 };
        });
        const financials = computeMultiMarketFinancials(runners, HOUSE_MARGIN_PERCENT);
        return {
          id: m.id,
          name: m.name,
          type: m.type,
          status: m.status,
          bookingCloseAt: m.bookingCloseAt,
          settledAt: m.settledAt,
          winnerOddId: m.winnerOddId,
          financials,
        };
      }),
    };
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

    const result = await this.prisma.$transaction(async (tx) => {
      // Múltiplos mercados podem ficar abertos simultaneamente neste evento Armageddon.

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

        // Pote recomputado das apostas OPEN — reabrir mercado NÃO pode zerar
        // dinheiro em jogo (fechar não reembolsa nada).
        await this.settlementService.recomputeDuelPoolState(tx, duelId);

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
              value: new Prisma.Decimal('1.00'),
              status: OddStatus.ACTIVE,
            },
          });
          await tx.odd.create({
            data: {
              marketId: market.id,
              label: rightDriver.name,
              value: new Prisma.Decimal('1.00'),
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

    // Leva Tudo: ao ABRIR a semifinal (final de chave que alimenta a Grande
    // Final), fecha os multi-mercados marcados (2º/3º) — não recebem mais aposta.
    if (
      open &&
      matchup.event.bracketType === ArmageddonBracketType.LEVA_TUDO &&
      matchup.stage === ArmageddonStage.FIRST_DRAW &&
      matchup.nextMatchupId &&
      matchup.event.eventId
    ) {
      const next = await this.prisma.armageddonMatchup.findUnique({
        where: { id: matchup.nextMatchupId },
        select: { isFinal: true },
      });
      if (next?.isFinal) {
        await this.prisma.market
          .updateMany({
            where: {
              eventId: matchup.event.eventId,
              autoCloseAtSemifinal: true,
              status: MarketStatus.OPEN,
            },
            data: { status: MarketStatus.SUSPENDED },
          })
          .catch(() => undefined);
      }
    }
    return result;
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

      if (matchup.event.bracketType !== ArmageddonBracketType.LADDER) {
        // ELIMINAÇÃO (144 e SHARK_TANK) → AVANÇO DE ÁRVORE: grava o vencedor no
        // slot (next*) da próxima bateria. O perdedor da semi vai para o jogo de
        // 3º lugar (loser*). O nome do piloto já aparece na bateria seguinte —
        // sem swap de ladder.
        const winnerDriverId = dto.winnerSide === 'LEFT' ? matchup.leftDriverId : matchup.rightDriverId;
        const loserDriverId = dto.winnerSide === 'LEFT' ? matchup.rightDriverId : matchup.leftDriverId;

        if (matchup.nextMatchupId && winnerDriverId) {
          await tx.armageddonMatchup.update({
            where: { id: matchup.nextMatchupId },
            data: matchup.nextSlotSide === 'LEFT'
              ? { leftDriverId: winnerDriverId }
              : { rightDriverId: winnerDriverId },
          });
        }
        if (matchup.loserToMatchupId && loserDriverId) {
          await tx.armageddonMatchup.update({
            where: { id: matchup.loserToMatchupId },
            data: matchup.loserToSlotSide === 'LEFT'
              ? { leftDriverId: loserDriverId }
              : { rightDriverId: loserDriverId },
          });
        }

        // Final auditada → evento encerrado.
        if (matchup.isFinal) {
          await tx.armageddonEvent.update({
            where: { id: matchup.eventId },
            data: { status: ArmageddonStatus.FINISHED },
          });
        } else if (
          matchup.event.bracketType === ArmageddonBracketType.SHARK_TANK &&
          matchup.stage === ArmageddonStage.SECOND_DRAW
        ) {
          // Shark Tank: encerra o evento quando os 4 desafios da Fase Final
          // (SECOND_DRAW) tiverem sido todos auditados.
          const pending = await tx.armageddonMatchup.count({
            where: {
              eventId: matchup.eventId,
              stage: ArmageddonStage.SECOND_DRAW,
              id: { not: matchupId },
              winnerSide: null,
            },
          });
          if (pending === 0) {
            await tx.armageddonEvent.update({
              where: { id: matchup.eventId },
              data: { status: ArmageddonStatus.FINISHED },
            });
          }
        }

        await this.logAudit(tx, 'ARMAGEDDON_ADVANCE', 'ArmageddonMatchup', matchupId, {
          winnerDriverId, nextMatchupId: matchup.nextMatchupId, loserToMatchupId: matchup.loserToMatchupId,
        }, audit);
      } else if (
        // LADDER legado: swap de posições no roster quando o desafiante (LEFT) vence.
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

      // Auto-abrir a(s) próxima(s) bateria(s)
      try {
        if (matchup.event.bracketType !== ArmageddonBracketType.LADDER) {
          // Eliminação (144 e SHARK_TANK): as baterias-alvo (vencedor e 3º lugar)
          // que ficaram com os dois pilotos definidos agora abrem mercado
          // automaticamente. No Shark Tank, o desafio da Fase Final só tem o
          // finalista (LEFT); só abre depois que o admin define o rival (RIGHT).
          const targetIds = [matchup.nextMatchupId, matchup.loserToMatchupId].filter(
            (id): id is string => !!id,
          );
          for (const id of targetIds) {
            const target = await this.prisma.armageddonMatchup.findUnique({ where: { id } });
            if (target && !target.winnerSide && !target.marketOpen && target.leftDriverId && target.rightDriverId) {
              await this.adminToggleMatchupMarket(target.id, true, audit);
            }
          }
        } else {
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

  /**
   * REABRE uma bateria já auditada (Modo Pista → "Reembolsar e reabrir").
   *
   * Reverte a auditoria EM CASCATA: como o vencedor desta bateria já foi
   * escrito no slot da próxima (e o perdedor no 3º lugar), reabrir precisa
   * desfazer esse avanço. Ordem:
   *   1. Para cada bateria de baixo que recebeu este resultado:
   *      - se ela já foi auditada, reabre-a primeiro (recursivo);
   *      - remove o piloto que ESTA bateria colocou no slot dela;
   *      - anula (refund das apostas abertas) e fecha o mercado dela — fica
   *        incompleta, não pode receber apostas.
   *   2. Reverte ESTA bateria via refundSettledMarket (refund dos stakes,
   *      estorno dos pagamentos, mercado volta a OPEN, matchup volta a
   *      não-auditado).
   *   3. Desfaz o swap de roster do LADDER legado, se houve.
   *   4. Se era a final, reabre o evento (FINISHED → IN_PROGRESS).
   *
   * Não é uma única transação: cada refund/void é atômico e idempotente
   * (refundSettledMarket pula mercado não-SETTLED), então um retry após falha
   * parcial completa com segurança. Escolha do dono: cascata destrutiva
   * (estorna apostas das baterias seguintes).
   */
  async reopenSettledMatchup(matchupId: string, audit: AuditContext): Promise<{
    matchupId: string; reopened: boolean; cascade: string[]; refundedMarketIds: string[];
  }> {
    const m = await this.prisma.armageddonMatchup.findUnique({
      where: { id: matchupId },
      include: { event: { select: { id: true, bracketType: true } } },
    });
    if (!m) throw new NotFoundException('Confronto não encontrado');
    if (!m.settledAt && !m.winnerSide) {
      return { matchupId, reopened: false, cascade: [], refundedMarketIds: [] };
    }

    const winnerDriverId = m.winnerSide === MatchupSide.LEFT ? m.leftDriverId : m.rightDriverId;
    const loserDriverId = m.winnerSide === MatchupSide.LEFT ? m.rightDriverId : m.leftDriverId;
    const cascade: string[] = [];
    const refundedMarketIds: string[] = [];

    // 1) Cascata: reverte o avanço nas baterias de baixo
    const downstream: Array<{ id: string | null; slot: MatchupSide | null; driverId: string | null }> = [
      { id: m.nextMatchupId, slot: m.nextSlotSide, driverId: winnerDriverId },
      { id: m.loserToMatchupId, slot: m.loserToSlotSide, driverId: loserDriverId },
    ];
    for (const d of downstream) {
      if (!d.id || !d.slot || !d.driverId) continue;
      const down = await this.prisma.armageddonMatchup.findUnique({
        where: { id: d.id },
        select: { id: true, leftDriverId: true, rightDriverId: true, duelId: true, settledAt: true, winnerSide: true },
      });
      if (!down) continue;
      // 1a) se a de baixo já foi auditada, reverte ela primeiro (recursivo)
      if (down.settledAt || down.winnerSide) {
        const r = await this.reopenSettledMatchup(d.id, audit);
        cascade.push(d.id, ...r.cascade);
        refundedMarketIds.push(...r.refundedMarketIds);
      }
      // 1b) só age se o slot ainda tem o piloto que ESTA bateria colocou
      const slotDriver = d.slot === MatchupSide.LEFT ? down.leftDriverId : down.rightDriverId;
      if (slotDriver && slotDriver === d.driverId) {
        // 1c) mercado da de baixo (auto-aberto) fica inválido → void (refund) + fecha
        if (down.duelId) {
          const dm = await this.prisma.market.findFirst({
            where: { duelId: down.duelId, status: { in: [MarketStatus.OPEN, MarketStatus.CLOSED, MarketStatus.SUSPENDED] } },
            select: { id: true },
          });
          if (dm) {
            await this.settlementService.voidMarket(dm.id, audit);
            refundedMarketIds.push(dm.id);
          }
        }
        await this.prisma.armageddonMatchup.update({
          where: { id: d.id },
          data: { [d.slot === MatchupSide.LEFT ? 'leftDriverId' : 'rightDriverId']: null, marketOpen: false },
        });
      }
    }

    // 2) Reverte ESTA bateria (refund + reabre mercado + limpa winnerSide)
    if (m.duelId) {
      const myMarket = await this.prisma.market.findFirst({
        where: { duelId: m.duelId, status: MarketStatus.SETTLED },
        select: { id: true },
      });
      if (myMarket) {
        await this.settlementService.refundSettledMarket(myMarket.id, audit);
        refundedMarketIds.push(myMarket.id);
      } else {
        await this.prisma.armageddonMatchup.update({
          where: { id: matchupId },
          data: { winnerSide: null, settledAt: null, marketOpen: true },
        });
      }
    } else {
      await this.prisma.armageddonMatchup.update({
        where: { id: matchupId },
        data: { winnerSide: null, settledAt: null },
      });
    }

    // 3) LADDER legado: desfaz o swap de posições do roster (só no LADDER; no
    //    SHARK_TANK/144 o avanço é por árvore e já foi revertido na cascata acima)
    if (
      m.event.bracketType === ArmageddonBracketType.LADDER &&
      m.winnerSide === MatchupSide.LEFT &&
      m.leftPosition && m.rightPosition && m.leftDriverId && m.rightDriverId &&
      m.roundType !== 'SHARK_TANK'
    ) {
      const challengerPos = m.leftPosition, defenderPos = m.rightPosition;
      const challengerDriverId = m.leftDriverId, defenderDriverId = m.rightDriverId;
      await this.prisma.$transaction(async (tx) => {
        await tx.armageddonRoster.updateMany({ where: { eventId: m.eventId, driverId: challengerDriverId }, data: { position: -1 } });
        await tx.armageddonRoster.updateMany({ where: { eventId: m.eventId, driverId: defenderDriverId }, data: { position: defenderPos, isKing: defenderPos === 1 } });
        await tx.armageddonRoster.updateMany({ where: { eventId: m.eventId, driverId: challengerDriverId }, data: { position: challengerPos, isKing: challengerPos === 1 } });
      });
    }

    // 4) Final reaberta → evento volta a IN_PROGRESS. No Shark Tank não há final
    //    única: reabrir qualquer desafio da Fase Final destrava o evento se ele
    //    havia sido encerrado.
    if (m.isFinal) {
      await this.prisma.armageddonEvent.updateMany({
        where: { id: m.eventId, status: ArmageddonStatus.FINISHED },
        data: { status: ArmageddonStatus.IN_PROGRESS },
      });
    } else if (
      m.event.bracketType === ArmageddonBracketType.SHARK_TANK &&
      m.stage === ArmageddonStage.SECOND_DRAW
    ) {
      await this.prisma.armageddonEvent.updateMany({
        where: { id: m.eventId, status: ArmageddonStatus.FINISHED },
        data: { status: ArmageddonStatus.IN_PROGRESS },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: 'ARMAGEDDON_MATCHUP_REOPEN',
        entity: 'ArmageddonMatchup',
        entityId: matchupId,
        payload: { cascade, refundedMarketIds } as Prisma.InputJsonValue,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      },
    }).catch(() => undefined);

    return { matchupId, reopened: true, cascade, refundedMarketIds };
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
        // Car.name fica vazio — admin preenche o veículo via /carros se quiser
        // exibir no card de embate. Antes concatenava piloto+equipe aqui, o que
        // duplicava o nome do piloto na UI pública.
        name: '',
        category: 'ARMAGEDDON',
        number: driver.carNumber ?? undefined,
      },
    });
    return created.id;
  }

  private serializeEvent(event: any) {
    const roster = (event.roster ?? []).map((r: any) => ({
      id: r.id,
      bracketKey: r.bracketKey,
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

    // Slots que RECEBEM um classificado de outro embate (vencedor→next, perdedor→3º).
    // Um lado vazio que está neste conjunto está "aguardando classificado" — NÃO é bye.
    const fedSlots = new Set<string>();
    for (const mm of (event.matchups ?? [])) {
      if (mm.nextMatchupId && mm.nextSlotSide) fedSlots.add(`${mm.nextMatchupId}:${mm.nextSlotSide}`);
      if (mm.loserToMatchupId && mm.loserToSlotSide) fedSlots.add(`${mm.loserToMatchupId}:${mm.loserToSlotSide}`);
    }

    return {
      id: event.id,
      name: event.name,
      description: event.description,
      bannerUrl: event.bannerUrl,
      streamUrl: event.streamUrl,
      featured: event.featured,
      format: event.format,
      bracketType: event.bracketType,
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
        stage: m.stage,
        bracketKey: m.bracketKey,
        nextMatchupId: m.nextMatchupId,
        nextSlotSide: m.nextSlotSide,
        loserToMatchupId: m.loserToMatchupId,
        loserToSlotSide: m.loserToSlotSide,
        isThirdPlace: m.isThirdPlace,
        isFinal: m.isFinal,
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
        // Bye avançável: exatamente um lado tem piloto, não está auditado e o
        // lado vazio NÃO recebe classificado de ninguém (senão é "aguardando").
        canAdvanceBye:
          (!!m.leftDriverId !== !!m.rightDriverId) &&
          !m.winnerSide &&
          !fedSlots.has(`${m.id}:${m.leftDriverId ? 'RIGHT' : 'LEFT'}`),
        byePresentSide:
          (!!m.leftDriverId !== !!m.rightDriverId)
            ? (m.leftDriverId ? 'LEFT' : 'RIGHT')
            : null,
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
