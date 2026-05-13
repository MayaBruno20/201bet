import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DuelStatus,
  EventStatus,
  ListEventStatus,
  ListFormat,
  ListRoundType,
  MarketStatus,
  MatchupSide,
  OddStatus,
  Prisma,
  SharkTankStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateBrazilListDto } from './dto/create-brazil-list.dto';
import { UpdateBrazilListDto } from './dto/update-brazil-list.dto';
import { UpsertRosterEntryDto } from './dto/upsert-roster.dto';
import { CreateListEventDto } from './dto/create-list-event.dto';
import { UpdateListEventDto } from './dto/update-list-event.dto';
import { GenerateMatchupsDto } from './dto/generate-matchups.dto';
import {
  SettleMatchupDto,
  UpdateMatchupDto,
  UpsertMatchupDto,
} from './dto/upsert-matchup.dto';
import {
  CreateSharkTankEntryDto,
  UpdateSharkTankEntryDto,
} from './dto/shark-tank.dto';
import { SettlementService } from '../settlement.service';
import { ParsedRosterEntry, RosterParserService } from './roster-parser.service';

type AuditContext = {
  actorUserId?: string;
  actorRole?: UserRole;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class BrazilListsService {
  private readonly logger = new Logger(BrazilListsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: SettlementService,
    private readonly rosterParser: RosterParserService,
  ) {}

  // ── Public ─────────────────────────────────────────────

  async listPublic() {
    const lists = await this.prisma.brazilList.findMany({
      where: { active: true },
      orderBy: { areaCode: 'asc' },
      include: {
        roster: {
          include: { driver: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    return lists.map((list) => this.serializeList(list));
  }

  async listLiveEvents() {
    // Público vê: ao vivo, recém encerrados (últimos 7 dias para histórico curto).
    // DRAFT/CANCELED ficam invisíveis. Admin precisa mudar de DRAFT → IN_PROGRESS para publicar.
    const finishedWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const events = await this.prisma.listEvent.findMany({
      where: {
        list: { active: true },
        OR: [
          { status: ListEventStatus.IN_PROGRESS },
          { status: ListEventStatus.FINISHED, scheduledAt: { gte: finishedWindow } },
        ],
      },
      orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }],
      include: {
        list: true,
        matchups: {
          orderBy: [{ roundNumber: 'asc' }, { order: 'asc' }],
          include: { leftDriver: true, rightDriver: true },
        },
      },
    });

    return events.map((event) => ({
      id: event.id,
      eventId: event.eventId,
      name: event.name,
      scheduledAt: event.scheduledAt,
      endsAt: event.endsAt,
      status: event.status,
      type: event.type,
      featured: event.featured,
      bannerUrl: event.bannerUrl,
      list: {
        id: event.list.id,
        areaCode: event.list.areaCode,
        name: event.list.name,
        format: event.list.format,
      },
      matchups: event.matchups.map((m) => ({
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
        settledAt: m.settledAt,
      })),
    }));
  }

  async getPublicByArea(areaCode: number) {
    const list = await this.prisma.brazilList.findFirst({
      where: { areaCode, active: true },
      include: {
        roster: {
          include: { driver: true },
          orderBy: { position: 'asc' },
        },
        events: {
          // Público NÃO vê eventos CANCELED — eles existem só pra trilha de auditoria.
          where: { status: { not: ListEventStatus.CANCELED } },
          orderBy: { scheduledAt: 'desc' },
          take: 5,
          include: {
            matchups: {
              orderBy: [{ roundNumber: 'asc' }, { order: 'asc' }],
              include: {
                leftDriver: true,
                rightDriver: true,
              },
            },
          },
        },
      },
    });

    if (!list) throw new NotFoundException('Lista não encontrada');
    return this.serializeList(list, { includeEvents: true });
  }

  // ── Admin: lists ───────────────────────────────────────

  async adminListAll() {
    const lists = await this.prisma.brazilList.findMany({
      orderBy: { areaCode: 'asc' },
      include: {
        roster: {
          include: { driver: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    return lists.map((list) => this.serializeList(list));
  }

  async adminGetById(id: string) {
    const list = await this.prisma.brazilList.findUnique({
      where: { id },
      include: {
        roster: {
          include: { driver: true },
          orderBy: { position: 'asc' },
        },
        events: {
          orderBy: { scheduledAt: 'desc' },
          include: {
            matchups: {
              orderBy: [{ roundNumber: 'asc' }, { order: 'asc' }],
              include: { leftDriver: true, rightDriver: true },
            },
            sharkTank: { include: { driver: true } },
          },
        },
      },
    });
    if (!list) throw new NotFoundException('Lista não encontrada');
    return this.serializeList(list, { includeEvents: true, includeSharkTank: true });
  }

  async adminCreate(dto: CreateBrazilListDto, audit: AuditContext) {
    const exists = await this.prisma.brazilList.findUnique({
      where: { areaCode: dto.areaCode },
    });
    if (exists) throw new ConflictException('DDD já cadastrado');

    return this.prisma.$transaction(async (tx) => {
      const list = await tx.brazilList.create({
        data: {
          areaCode: dto.areaCode,
          name: dto.name,
          format: dto.format,
          administratorName: dto.administratorName,
          hometown: dto.hometown,
          active: dto.active ?? false,
        },
      });
      await this.logAudit(tx, 'BRAZIL_LIST_CREATE', 'BrazilList', list.id, dto, audit);
      return list;
    });
  }

  async adminUpdate(id: string, dto: UpdateBrazilListDto, audit: AuditContext) {
    await this.ensureListExists(id);
    return this.prisma.$transaction(async (tx) => {
      const list = await tx.brazilList.update({
        where: { id },
        data: {
          name: dto.name,
          format: dto.format,
          administratorName: dto.administratorName,
          hometown: dto.hometown,
          active: dto.active,
        },
      });
      await this.logAudit(tx, 'BRAZIL_LIST_UPDATE', 'BrazilList', id, dto, audit);
      return list;
    });
  }

  async adminDelete(id: string, audit: AuditContext) {
    await this.ensureListExists(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.brazilList.delete({ where: { id } });
      await this.logAudit(tx, 'BRAZIL_LIST_DELETE', 'BrazilList', id, null, audit);
      return { success: true };
    });
  }

  // ── Admin: roster ──────────────────────────────────────

  async adminUpsertRoster(listId: string, dto: UpsertRosterEntryDto, audit: AuditContext) {
    const list = await this.ensureListExists(listId);
    const maxPosition = list.format === ListFormat.TOP_20 ? 20 : 10;
    if (dto.position > maxPosition) {
      throw new BadRequestException(`Posição máxima para esta lista é ${maxPosition}`);
    }

    return this.prisma.$transaction(async (tx) => {
      let driverId = dto.driverId;
      if (!driverId) {
        if (!dto.driverName) {
          throw new BadRequestException('Informe driverId ou driverName');
        }
        const driver = await tx.driver.create({
          data: {
            name: dto.driverName,
            nickname: dto.driverNickname,
            carNumber: dto.driverCarNumber,
            team: dto.driverTeam,
            hometown: dto.driverHometown,
          },
        });
        driverId = driver.id;
      } else {
        const patch: Prisma.DriverUpdateInput = {};
        if (dto.driverName) patch.name = dto.driverName;
        if (dto.driverNickname !== undefined) patch.nickname = dto.driverNickname;
        if (dto.driverCarNumber !== undefined) patch.carNumber = dto.driverCarNumber;
        if (dto.driverTeam !== undefined) patch.team = dto.driverTeam;
        if (dto.driverHometown !== undefined) patch.hometown = dto.driverHometown;
        if (Object.keys(patch).length > 0) {
          await tx.driver.update({ where: { id: driverId }, data: patch });
        }
      }

      const existingAtPosition = await tx.listRoster.findUnique({
        where: { listId_position: { listId, position: dto.position } },
      });
      const existingDriverOnList = await tx.listRoster.findUnique({
        where: { listId_driverId: { listId, driverId } },
      });

      if (existingDriverOnList && existingDriverOnList.position !== dto.position) {
        if (existingAtPosition) {
          throw new ConflictException('Piloto já está em outra posição desta lista');
        }
        await tx.listRoster.delete({ where: { id: existingDriverOnList.id } });
      }

      const data = {
        listId,
        driverId,
        position: dto.position,
        isKing: dto.isKing ?? false,
        notes: dto.notes,
      };

      const roster = existingAtPosition
        ? await tx.listRoster.update({
            where: { id: existingAtPosition.id },
            data,
            include: { driver: true },
          })
        : await tx.listRoster.create({ data, include: { driver: true } });

      if (dto.isKing === true) {
        await tx.listRoster.updateMany({
          where: { listId, id: { not: roster.id } },
          data: { isKing: false },
        });
      }

      await this.logAudit(tx, 'BRAZIL_ROSTER_UPSERT', 'ListRoster', roster.id, dto, audit);
      return roster;
    });
  }

  async adminRemoveRoster(listId: string, rosterId: string, audit: AuditContext) {
    const roster = await this.prisma.listRoster.findFirst({
      where: { id: rosterId, listId },
    });
    if (!roster) throw new NotFoundException('Entrada de roster não encontrada');

    return this.prisma.$transaction(async (tx) => {
      await tx.listRoster.delete({ where: { id: rosterId } });
      await this.logAudit(tx, 'BRAZIL_ROSTER_DELETE', 'ListRoster', rosterId, null, audit);
      return { success: true };
    });
  }

  // ── Admin: roster import (PDF/DOCX) ──────────────────────

  /** Parse "best-effort" — devolve entries pro admin revisar antes de aplicar. */
  async adminParseRosterFile(listId: string, buffer: Buffer, mimeType: string) {
    await this.ensureListExists(listId);
    const entries = await this.rosterParser.parseFile(buffer, mimeType);
    return { entries };
  }

  /**
   * Substitui o roster da lista pelos entries informados. Atômico — se algo der
   * ruim no meio, a transação reverte e o roster original fica intacto.
   *
   * Match de Driver:
   *  1. Procura no roster atual da lista por nome (case-insensitive, trimmed) → reusa + atualiza fields
   *  2. Procura no banco global de Drivers por nome → reusa + atualiza fields
   *  3. Senão, cria novo Driver
   *
   * Pilotos que estão no roster atual mas NÃO aparecem nos entries → saem do roster
   * (Driver permanece no banco, pode estar em outras listas).
   *
   * Posição 1 = isKing. Demais = não.
   */
  async adminBulkReplaceRoster(
    listId: string,
    entries: ParsedRosterEntry[],
    audit: AuditContext,
  ) {
    const list = await this.ensureListExists(listId);
    const maxPosition = list.format === ListFormat.TOP_20 ? 20 : 10;

    // Valida entries
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new BadRequestException('Envie ao menos uma entrada no roster.');
    }
    const seenPositions = new Set<number>();
    const seenNames = new Set<string>();
    const normalized: ParsedRosterEntry[] = [];
    for (const e of entries) {
      const name = (e.driverName ?? '').trim();
      if (!name) throw new BadRequestException('Toda entrada precisa de nome do piloto.');
      const pos = Number(e.position);
      if (!Number.isInteger(pos) || pos < 1 || pos > maxPosition) {
        throw new BadRequestException(
          `Posição inválida (${e.position}) para ${name}. Esta lista é ${list.format}, posições 1–${maxPosition}.`,
        );
      }
      if (seenPositions.has(pos)) {
        throw new BadRequestException(`Posição ${pos} aparece mais de uma vez.`);
      }
      if (seenNames.has(name.toLowerCase())) {
        throw new BadRequestException(`Piloto "${name}" aparece mais de uma vez.`);
      }
      seenPositions.add(pos);
      seenNames.add(name.toLowerCase());
      normalized.push({
        position: pos,
        driverName: name,
        nickname: e.nickname?.trim() || null,
        carName: e.carName?.trim() || null,
        carNumber: e.carNumber?.trim() || null,
      });
    }
    normalized.sort((a, b) => a.position - b.position);

    return this.prisma.$transaction(async (tx) => {
      // Roster atual com drivers pra match por nome
      const currentRoster = await tx.listRoster.findMany({
        where: { listId },
        include: { driver: true },
      });
      const currentByNameLower = new Map(
        currentRoster.map((r) => [r.driver.name.trim().toLowerCase(), r] as const),
      );
      const currentIdsToKeep = new Set<string>();

      // Drop temporário das positions atuais pra evitar conflito de unique(listId, position)
      // durante o re-arranjo.
      await tx.listRoster.updateMany({
        where: { listId },
        data: { position: -1 },
      });

      const summary = {
        created: 0,
        reused: 0,
        updated: 0,
        removed: 0,
        total: normalized.length,
      };

      for (const entry of normalized) {
        const nameLower = entry.driverName.toLowerCase();
        let driverId: string;

        const existingRoster = currentByNameLower.get(nameLower);
        if (existingRoster) {
          // (1) match no roster da lista — reusa e atualiza
          driverId = existingRoster.driverId;
          const patch = this.buildDriverPatch(existingRoster.driver, entry);
          if (Object.keys(patch).length > 0) {
            await tx.driver.update({ where: { id: driverId }, data: patch });
            summary.updated += 1;
          }
          await tx.listRoster.update({
            where: { id: existingRoster.id },
            data: {
              position: entry.position,
              isKing: entry.position === 1,
              driverId,
            },
          });
          currentIdsToKeep.add(existingRoster.id);
          summary.reused += 1;
        } else {
          // (2) match global por nome
          const globalDriver = await tx.driver.findFirst({
            where: { name: { equals: entry.driverName, mode: 'insensitive' } },
          });
          if (globalDriver) {
            driverId = globalDriver.id;
            const patch = this.buildDriverPatch(globalDriver, entry);
            if (Object.keys(patch).length > 0) {
              await tx.driver.update({ where: { id: driverId }, data: patch });
              summary.updated += 1;
            }
          } else {
            // (3) cria novo Driver
            const created = await tx.driver.create({
              data: {
                name: entry.driverName,
                nickname: entry.nickname,
                carNumber: entry.carNumber,
              },
            });
            driverId = created.id;
          }

          const newRoster = await tx.listRoster.create({
            data: {
              listId,
              driverId,
              position: entry.position,
              isKing: entry.position === 1,
            },
          });
          currentIdsToKeep.add(newRoster.id);
          summary.created += 1;
        }
      }

      // Remove do roster os que não vieram no novo doc (Driver permanece no banco)
      const removed = await tx.listRoster.deleteMany({
        where: {
          listId,
          id: { notIn: [...currentIdsToKeep] },
        },
      });
      summary.removed = removed.count;

      // Lista com roster ≥ 2 pilotos é elegível pra ficar pública. Se ainda
      // estava `active: false` (típico recém-criado), ativa automaticamente —
      // o admin importou o roster, então a intenção é deixá-la viva.
      if (!list.active && normalized.length >= 2) {
        await tx.brazilList.update({
          where: { id: listId },
          data: { active: true },
        });
      }

      await this.logAudit(tx, 'BRAZIL_ROSTER_BULK_REPLACE', 'BrazilList', listId, summary, audit);

      return summary;
    }, { timeout: 30_000, maxWait: 5_000 });
  }

  /** Patch só com campos que realmente mudaram (evita update no-op + audit ruído). */
  private buildDriverPatch(
    current: { name: string; nickname: string | null; carNumber: string | null },
    next: ParsedRosterEntry,
  ): Prisma.DriverUpdateInput {
    const patch: Prisma.DriverUpdateInput = {};
    if (next.driverName && next.driverName !== current.name) patch.name = next.driverName;
    if ((next.nickname ?? null) !== (current.nickname ?? null)) patch.nickname = next.nickname;
    if ((next.carNumber ?? null) !== (current.carNumber ?? null)) patch.carNumber = next.carNumber;
    return patch;
  }

  // ── Admin: events ──────────────────────────────────────

  async adminCreateEvent(listId: string, dto: CreateListEventDto, audit: AuditContext) {
    await this.ensureListExists(listId);

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
          bannerUrl: dto.bannerUrl ?? null,
          featured: dto.featured ?? false,
          startAt: startDate,
          status: EventStatus.SCHEDULED,
        },
      });

      // Lifecycle do status:
      //  - scheduledAt no futuro  → SCHEDULED (aparece como "Agendado" pro admin)
      //  - scheduledAt já passou  → DRAFT (admin ainda precisa abrir mercado manualmente)
      // O cron de event-lifecycle vai promover SCHEDULED → IN_PROGRESS ("Ao vivo")
      // automaticamente quando o horário chegar.
      const initialStatus: ListEventStatus = startDate.getTime() > Date.now()
        ? ListEventStatus.SCHEDULED
        : ListEventStatus.DRAFT;

      const event = await tx.listEvent.create({
        data: {
          listId,
          name: dto.name,
          scheduledAt: startDate,
          endsAt: endDate,
          type: (dto.type as 'REGULAR' | 'ARMAGEDDON' | 'SHARK_TANK' | undefined) ?? 'REGULAR',
          bannerUrl: dto.bannerUrl,
          featured: dto.featured ?? false,
          notes: dto.notes,
          status: initialStatus,
          eventId: linkedEvent.id,
        },
      });
      await this.logAudit(tx, 'BRAZIL_EVENT_CREATE', 'ListEvent', event.id, dto, audit);
      return event;
    });
  }

  async adminUpdateEvent(eventId: string, dto: UpdateListEventDto, audit: AuditContext) {
    const event = await this.prisma.listEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento de lista não encontrado');

    // Validate dates if both are being changed (or if one is changed and the other already exists)
    const finalStart = dto.scheduledAt ? new Date(dto.scheduledAt) : event.scheduledAt;
    const finalEnd = dto.endsAt ? new Date(dto.endsAt) : event.endsAt;
    if (finalEnd && finalEnd.getTime() <= finalStart.getTime()) {
      throw new BadRequestException('A data de fim deve ser posterior à data de início');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.listEvent.update({
        where: { id: eventId },
        data: {
          name: dto.name,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          status: dto.status,
          bannerUrl: dto.bannerUrl,
          featured: dto.featured,
          notes: dto.notes,
        },
      });
      // Se o ListEvent ja gerou um Event vinculado, propaga banner+featured
      if (updated.eventId && (dto.bannerUrl !== undefined || dto.featured !== undefined)) {
        await tx.event.update({
          where: { id: updated.eventId },
          data: {
            bannerUrl: dto.bannerUrl !== undefined ? dto.bannerUrl : undefined,
            featured: dto.featured !== undefined ? dto.featured : undefined,
          },
        }).catch(() => undefined);
      }
      await this.logAudit(tx, 'BRAZIL_EVENT_UPDATE', 'ListEvent', eventId, dto, audit);
      return updated;
    });
  }

  async adminDeleteEvent(eventId: string, audit: AuditContext) {
    const event = await this.prisma.listEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento de lista não encontrado');

    // Anula mercados abertos ANTES da transação (refund de apostas usa
    // settlementService que abre transação própria — não dá pra aninhar).
    if (event.eventId) {
      const openMarkets = await this.prisma.market.findMany({
        where: {
          eventId: event.eventId,
          status: { in: [MarketStatus.OPEN, MarketStatus.SUSPENDED] },
        },
        select: { id: true },
      });
      for (const m of openMarkets) {
        try { await this.settlementService.voidMarket(m.id, audit); }
        catch (e) {
          this.logger.warn(`Falha ao anular mercado ${m.id} ao cancelar evento de lista ${eventId}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Marca ListEvent como CANCELED em vez de deletar — preserva histórico para auditoria.
      await tx.listEvent.update({
        where: { id: eventId },
        data: { status: ListEventStatus.CANCELED },
      });

      // Cancela duelos pendentes vinculados ao Event linkado.
      if (event.eventId) {
        await tx.duel.updateMany({
          where: {
            eventId: event.eventId,
            status: { in: [DuelStatus.SCHEDULED, DuelStatus.BOOKING_OPEN, DuelStatus.BOOKING_CLOSED] },
          },
          data: { status: DuelStatus.CANCELED },
        });

        // Fecha mercados que ainda não foram anulados (caso voidMarket tenha falhado acima).
        await tx.market.updateMany({
          where: { eventId: event.eventId, status: { not: MarketStatus.SETTLED } },
          data: { status: MarketStatus.CLOSED },
        });

        // CRITICO: marca o Event linkado como CANCELED — senão o GET /events público
        // continua exibindo o evento mesmo após cancelado.
        await tx.event.update({
          where: { id: event.eventId },
          data: { status: EventStatus.CANCELED },
        });
      }

      await this.logAudit(tx, 'BRAZIL_EVENT_CANCEL', 'ListEvent', eventId, { eventId: event.eventId }, audit);
      return { success: true, status: 'CANCELED' };
    });
  }

  async adminGetEventDetail(eventId: string) {
    const event = await this.prisma.listEvent.findUnique({
      where: { id: eventId },
      include: {
        list: {
          include: {
            roster: { include: { driver: true }, orderBy: { position: 'asc' } },
          },
        },
        matchups: {
          orderBy: [{ roundNumber: 'asc' }, { order: 'asc' }],
          include: { leftDriver: true, rightDriver: true },
        },
        sharkTank: { include: { driver: true }, orderBy: { seed: 'asc' } },
      },
    });
    if (!event) throw new NotFoundException('Evento de lista não encontrado');
    return event;
  }

  // ── Admin: matchup bracketing ──────────────────────────

  async adminGenerateMatchups(eventId: string, dto: GenerateMatchupsDto, audit: AuditContext) {
    const event = await this.prisma.listEvent.findUnique({
      where: { id: eventId },
      include: {
        list: {
          include: { roster: { include: { driver: true } } },
        },
      },
    });
    if (!event) throw new NotFoundException('Evento de lista não encontrado');
    if (dto.roundType === ListRoundType.SHARK_TANK) {
      throw new BadRequestException(
        'Para rodada Shark Tank, utilize os endpoints específicos',
      );
    }

    const rosterByPosition = new Map<number, { driverId: string }>();
    for (const r of event.list.roster) {
      rosterByPosition.set(r.position, { driverId: r.driverId });
    }

    const pairs = buildBracketPairs(event.list.format, dto.roundType);
    if (!pairs.length) {
      throw new BadRequestException('Nenhum confronto pôde ser gerado');
    }

    const roundNumber = dto.roundNumber ?? (await this.nextRoundNumber(eventId));

    return this.prisma.$transaction(async (tx) => {
      await tx.listMatchup.deleteMany({
        where: { listEventId: eventId, roundNumber, roundType: dto.roundType },
      });

      const created: Array<{ id: string }> = [];
      for (const pair of pairs) {
        const leftDriverId = rosterByPosition.get(pair.leftPosition)?.driverId;
        const rightDriverId = rosterByPosition.get(pair.rightPosition)?.driverId;
        const matchup = await tx.listMatchup.create({
          data: {
            listEventId: eventId,
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

      // DRAFT (sem matchups) ou SCHEDULED (aguardando data) → IN_PROGRESS quando o
      // admin gera matchups, porque já indica que o evento começou efetivamente.
      if (event.status === ListEventStatus.DRAFT || event.status === ListEventStatus.SCHEDULED) {
        await tx.listEvent.update({
          where: { id: eventId },
          data: { status: ListEventStatus.IN_PROGRESS },
        });
      }

      await this.logAudit(tx, 'BRAZIL_MATCHUPS_GENERATE', 'ListEvent', eventId, {
        roundNumber,
        roundType: dto.roundType,
        count: created.length,
      }, audit);

      return { roundNumber, roundType: dto.roundType, count: created.length, firstMatchupId: created[0]?.id };
    }).then(async ({ firstMatchupId, ...rest }) => {
      // Auto-abrir o PRIMEIRO mercado da rodada para iniciar a cadeia.
      // Os mercados subsequentes abrem automaticamente conforme o admin audita
      // (lógica em adminSettleMatchup). Falha aqui não é fatal — admin pode
      // abrir manualmente ou usar "Abrir todos os mercados".
      if (firstMatchupId) {
        try { await this.adminToggleMatchupMarket(firstMatchupId, true, audit); }
        catch (e) {
          this.logger.warn(
            `Falha ao auto-abrir primeiro mercado da rodada ${rest.roundNumber}/${rest.roundType}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
      return rest;
    });
  }

  /**
   * Abre todos os mercados de uma rodada de uma vez. Útil quando o admin
   * quer rodar os embates em paralelo em vez do fluxo sequencial (auto-chain).
   *
   * - Se `roundNumber` e `roundType` forem informados, abre só essa rodada.
   * - Se nenhum filtro vier, abre a próxima rodada não auditada (ordenando por
   *   roundNumber, depois ODD antes de EVEN).
   * Embates já settled são pulados; embates já abertos não geram novo work.
   */
  async adminOpenAllMatchupsForRound(
    eventId: string,
    filter: { roundNumber?: number; roundType?: ListRoundType } | undefined,
    audit: AuditContext,
  ) {
    const event = await this.prisma.listEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento de lista não encontrado');

    let targetRoundNumber = filter?.roundNumber;
    let targetRoundType = filter?.roundType;

    if (!targetRoundNumber || !targetRoundType) {
      // Pega o primeiro grupo (roundNumber, roundType) que ainda tem embates não settled
      const candidate = await this.prisma.listMatchup.findFirst({
        where: { listEventId: eventId, winnerSide: null },
        orderBy: [{ roundNumber: 'asc' }, { roundType: 'asc' }, { order: 'asc' }],
        select: { roundNumber: true, roundType: true },
      });
      if (!candidate) {
        throw new BadRequestException('Não há rodada com embates pendentes neste evento.');
      }
      targetRoundNumber = candidate.roundNumber;
      targetRoundType = candidate.roundType;
    }

    const matchups = await this.prisma.listMatchup.findMany({
      where: {
        listEventId: eventId,
        roundNumber: targetRoundNumber,
        roundType: targetRoundType,
        winnerSide: null,
        marketOpen: false,
      },
      orderBy: { order: 'asc' },
    });

    if (matchups.length === 0) {
      return { opened: 0, roundNumber: targetRoundNumber, roundType: targetRoundType, message: 'Nenhum embate pendente para abrir nesta rodada.' };
    }

    let opened = 0;
    const failures: Array<{ id: string; error: string }> = [];
    for (const m of matchups) {
      try {
        await this.adminToggleMatchupMarket(m.id, true, audit);
        opened += 1;
      } catch (e) {
        failures.push({ id: m.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: 'BRAZIL_OPEN_ALL_MATCHUPS',
        entity: 'ListEvent',
        entityId: eventId,
        payload: {
          roundNumber: targetRoundNumber,
          roundType: targetRoundType,
          opened,
          total: matchups.length,
          failures,
        } as Prisma.InputJsonValue,
      },
    }).catch(() => undefined);

    return {
      opened,
      total: matchups.length,
      roundNumber: targetRoundNumber,
      roundType: targetRoundType,
      failures,
    };
  }

  async adminUpsertMatchup(eventId: string, dto: UpsertMatchupDto, audit: AuditContext) {
    const event = await this.prisma.listEvent.findUnique({
      where: { id: eventId },
      include: { list: { include: { roster: true } } },
    });
    if (!event) throw new NotFoundException('Evento de lista não encontrado');

    return this.prisma.$transaction(async (tx) => {
      const leftDriverId = dto.leftDriverId ?? this.resolveDriverFromPosition(event.list.roster, dto.leftPosition);
      const rightDriverId = dto.rightDriverId ?? this.resolveDriverFromPosition(event.list.roster, dto.rightPosition);

      const matchup = await tx.listMatchup.create({
        data: {
          listEventId: eventId,
          roundNumber: dto.roundNumber,
          roundType: dto.roundType,
          order: dto.order,
          leftPosition: dto.leftPosition,
          rightPosition: dto.rightPosition,
          leftDriverId,
          rightDriverId,
          winnerSide: dto.winnerSide,
          isManualOverride: true,
          notes: dto.notes,
          settledAt: dto.winnerSide ? new Date() : null,
        },
      });

      await this.logAudit(tx, 'BRAZIL_MATCHUP_CREATE', 'ListMatchup', matchup.id, dto, audit);
      return matchup;
    });
  }

  async adminUpdateMatchup(matchupId: string, dto: UpdateMatchupDto, audit: AuditContext) {
    const matchup = await this.prisma.listMatchup.findUnique({
      where: { id: matchupId },
      include: {
        listEvent: { include: { list: { include: { roster: true } } } },
      },
    });
    if (!matchup) throw new NotFoundException('Confronto não encontrado');

    // SECURITY: PATCH nao pode auditar vencedor (rota dedicada e adminSettleMatchup)
    // Bypassar imutabilidade aqui criaria registros corrompidos sem pagar apostas
    if (dto.winnerSide !== undefined) {
      throw new BadRequestException(
        'Para definir vencedor use o endpoint /settle (audita apostas e mantem imutabilidade). PATCH nao aceita winnerSide.',
      );
    }

    // Confronto ja auditado: nao permite alterar pilotos/posicoes
    if (matchup.winnerSide && matchup.settledAt) {
      throw new BadRequestException('Confronto ja auditado e imutavel. Nao pode ser editado.');
    }

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.ListMatchupUpdateInput = {
        notes: dto.notes,
        isManualOverride: dto.isManualOverride ?? true,
      };

      if (dto.leftPosition !== undefined) data.leftPosition = dto.leftPosition;
      if (dto.rightPosition !== undefined) data.rightPosition = dto.rightPosition;

      const newLeftId = dto.leftDriverId !== undefined
        ? dto.leftDriverId
        : dto.leftPosition !== undefined
          ? this.resolveDriverFromPosition(matchup.listEvent.list.roster, dto.leftPosition)
          : undefined;
      const newRightId = dto.rightDriverId !== undefined
        ? dto.rightDriverId
        : dto.rightPosition !== undefined
          ? this.resolveDriverFromPosition(matchup.listEvent.list.roster, dto.rightPosition)
          : undefined;

      if (newLeftId !== undefined) {
        data.leftDriver = newLeftId ? { connect: { id: newLeftId } } : { disconnect: true };
      }
      if (newRightId !== undefined) {
        data.rightDriver = newRightId ? { connect: { id: newRightId } } : { disconnect: true };
      }

      const updated = await tx.listMatchup.update({ where: { id: matchupId }, data });
      await this.logAudit(tx, 'BRAZIL_MATCHUP_UPDATE', 'ListMatchup', matchupId, dto, audit);
      return updated;
    });
  }

  async adminSettleMatchup(matchupId: string, dto: SettleMatchupDto, audit: AuditContext) {
    const matchup = await this.prisma.listMatchup.findUnique({
      where: { id: matchupId },
      include: { listEvent: { include: { list: { include: { roster: true } } } } },
    });
    if (!matchup) throw new NotFoundException('Confronto não encontrado');

    // Imutabilidade: nao permite re-auditar uma rodada ja liquidada
    if (matchup.winnerSide && matchup.settledAt) {
      throw new BadRequestException('Esta rodada ja foi auditada e o vencedor e imutavel');
    }

    if (!dto.winnerSide || (dto.winnerSide !== 'LEFT' && dto.winnerSide !== 'RIGHT')) {
      throw new BadRequestException('winnerSide deve ser LEFT ou RIGHT');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.listMatchup.update({
        where: { id: matchupId },
        data: {
          winnerSide: dto.winnerSide,
          settledAt: new Date(),
          notes: dto.notes ?? matchup.notes,
        },
      });

      // Swap roster positions if challenger won (regulamento PAR/IMPAR)
      // Convencao: leftPosition e sempre a posicao desafiante (numero maior = rank pior)
      // Se LEFT (desafiante) vence -> swap. Se RIGHT (defensor) vence -> sem mudanca
      if (
        dto.winnerSide === 'LEFT' &&
        matchup.leftPosition && matchup.rightPosition &&
        matchup.leftDriverId && matchup.rightDriverId &&
        matchup.roundType !== 'SHARK_TANK'
      ) {
        const challengerPos = matchup.leftPosition;  // pior rank (numero maior)
        const defenderPos = matchup.rightPosition;   // melhor rank (numero menor)
        const challengerDriverId = matchup.leftDriverId;
        const defenderDriverId = matchup.rightDriverId;
        const listId = matchup.listEvent.listId;

        // Swap em 3 passos para evitar colisao no unique([listId, position]):
        // 1) parquear defensor em -1 (posicao temp inexistente, sem colisao)
        await tx.listRoster.updateMany({
          where: { listId, driverId: defenderDriverId },
          data: { position: -1 },
        });
        // 2) mover challenger para a posicao do defensor (agora livre)
        await tx.listRoster.updateMany({
          where: { listId, driverId: challengerDriverId },
          data: { position: defenderPos, isKing: defenderPos === 1 },
        });
        // 3) mover defensor de -1 para a posicao do challenger (agora livre)
        await tx.listRoster.updateMany({
          where: { listId, driverId: defenderDriverId },
          data: { position: challengerPos, isKing: false },
        });

        await this.logAudit(tx, 'BRAZIL_ROSTER_SWAP', 'BrazilList', listId, {
          matchupId, challengerPos, defenderPos, challengerDriverId, defenderDriverId,
        }, audit);
      }

      await this.logAudit(tx, 'BRAZIL_MATCHUP_SETTLE', 'ListMatchup', matchupId, dto, audit);
      return updated;
    }, { timeout: 20000, maxWait: 5000 }).then(async (result) => {
      // 1) Liquidar Duel/Market (paga apostas) e marcar Duel FINISHED
      // CRITICO: erros aqui sao surfaceados ao admin para reconciliacao manual
      let payoutError: string | null = null;
      if (matchup.duelId) {
        // Verifica se ha mercado para liquidar antes de tentar
        const hasMarket = await this.prisma.market.findFirst({
          where: { duelId: matchup.duelId, status: { in: ['OPEN', 'CLOSED', 'SUSPENDED'] } },
          select: { id: true },
        });
        if (hasMarket) {
          try {
            await this.settlementService.settleDuel(matchup.duelId, dto.winnerSide as 'LEFT' | 'RIGHT', audit);
          } catch (e) {
            // ATENCAO: NAO swallow. Loga e SURFACEA para admin.
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`[CRITICAL] Settle do duel ${matchup.duelId} falhou: ${msg}`);
            payoutError = msg;
            // Audit log para reconciliacao
            await this.prisma.auditLog.create({
              data: {
                actorUserId: audit.actorUserId,
                action: 'SETTLE_DUEL_FAILED',
                entity: 'Duel',
                entityId: matchup.duelId,
                payload: { matchupId, winnerSide: dto.winnerSide, error: msg } as Prisma.InputJsonValue,
              },
            }).catch(() => undefined);
          }
        }
        // Marca duel FINISHED mesmo se nao havia mercado (apostas auto-resolvem como vazio)
        try {
          await this.prisma.duel.update({
            where: { id: matchup.duelId },
            data: { status: DuelStatus.FINISHED },
          });
        } catch (e) {
          this.logger.warn(`Falha ao marcar duel ${matchup.duelId} como FINISHED: ${e instanceof Error ? e.message : e}`);
        }
      }

      // 2) Auto-abrir proxima rodada (nao fatal se falhar - admin pode abrir manualmente)
      try {
        const nextMatchup = await this.prisma.listMatchup.findFirst({
          where: {
            listEventId: matchup.listEventId,
            winnerSide: null,
            marketOpen: false,
            id: { not: matchupId },
          },
          orderBy: [
            { roundNumber: 'asc' },
            { order: 'asc' },
          ],
        });
        if (nextMatchup && nextMatchup.leftDriverId && nextMatchup.rightDriverId) {
          await this.adminToggleMatchupMarket(nextMatchup.id, true, audit);
        }
      } catch (e) {
        this.logger.warn(`Falha ao abrir proxima rodada apos settle de ${matchupId}: ${e instanceof Error ? e.message : e}`);
      }

      // Se payout falhou, lanca erro APOS o swap/audit log para o admin saber
      if (payoutError) {
        throw new BadRequestException(
          `Vencedor auditado mas LIQUIDACAO DAS APOSTAS FALHOU: ${payoutError}. Reconcilie manualmente em /admin/audit-logs (acao SETTLE_DUEL_FAILED).`,
        );
      }

      return result;
    });
  }

  async adminToggleMatchupMarket(matchupId: string, open: boolean, audit: AuditContext) {
    const matchup = await this.prisma.listMatchup.findUnique({
      where: { id: matchupId },
      include: {
        leftDriver: { include: { cars: { where: { active: true }, take: 1 } } },
        rightDriver: { include: { cars: { where: { active: true }, take: 1 } } },
        listEvent: { include: { list: true } },
      },
    });
    if (!matchup) throw new NotFoundException('Confronto não encontrado');
    if (matchup.winnerSide) {
      throw new BadRequestException('Confronto já liquidado');
    }
    if (!matchup.leftDriver || !matchup.rightDriver) {
      throw new BadRequestException('Confronto sem pilotos definidos dos dois lados');
    }
    const leftDriver = matchup.leftDriver;
    const rightDriver = matchup.rightDriver;

    return this.prisma.$transaction(async (tx) => {
      // Múltiplos mercados podem ficar abertos simultaneamente neste evento de lista.

      let duelId = matchup.duelId;
      let eventId = matchup.listEvent.eventId;

      if (open) {
        // 1. Event (criado uma vez por ListEvent)
        if (!eventId) {
          const createdEvent = await tx.event.create({
            data: {
              sport: 'DRAG_RACE',
              name: `${matchup.listEvent.list.name} — ${matchup.listEvent.name}`,
              bannerUrl: matchup.listEvent.bannerUrl ?? null,
              featured: matchup.listEvent.featured ?? false,
              startAt: matchup.listEvent.scheduledAt,
              status: EventStatus.SCHEDULED,
            },
          });
          eventId = createdEvent.id;
          await tx.listEvent.update({
            where: { id: matchup.listEventId },
            data: { eventId },
          });
        }

        // 2. Cars (um por piloto, cria se não houver)
        const leftCarId = await this.ensureDriverCar(tx, leftDriver);
        const rightCarId = await this.ensureDriverCar(tx, rightDriver);

        // 3. Duel — cria se não existe, ou reabre se já existe
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
              startsAt: matchup.listEvent.scheduledAt,
              bookingCloseAt,
              status: DuelStatus.BOOKING_OPEN,
              notes: `Lista ${matchup.listEvent.list.name} — Rodada ${matchup.roundNumber} #${matchup.order}`,
            },
          });
          duelId = createdDuel.id;
          await tx.listMatchup.update({
            where: { id: matchupId },
            data: { duelId },
          });
        }

        // Pool sempre começa zerado em cada abertura de mercado.
        await tx.duelPoolState.upsert({
          where: { duelId },
          create: {
            duelId,
            leftPool: 0,
            rightPool: 0,
            leftTickets: 0,
            rightTickets: 0,
          },
          update: {
            leftPool: 0,
            rightPool: 0,
            leftTickets: 0,
            rightTickets: 0,
          },
        });

        // 4. Market + Odds — cria se não há mercado do duelo
        const existingMarket = await tx.market.findFirst({
          where: { duelId },
        });
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

        // DRAFT ou SCHEDULED → IN_PROGRESS quando o admin abre o 1º mercado manualmente
        // (antes do scheduledAt, por exemplo). Cron normalmente cobre esse caso, mas o
        // admin pode forçar abertura antecipada e o status deve seguir.
        if (
          matchup.listEvent.status === ListEventStatus.DRAFT ||
          matchup.listEvent.status === ListEventStatus.SCHEDULED
        ) {
          await tx.listEvent.update({
            where: { id: matchup.listEventId },
            data: { status: ListEventStatus.IN_PROGRESS },
          });
        }
      } else if (duelId) {
        // Fechar: manda o duelo para BOOKING_CLOSED sem apagar nada
        await tx.duel.update({
          where: { id: duelId },
          data: { status: DuelStatus.BOOKING_CLOSED },
        });
        await tx.market.updateMany({
          where: { duelId },
          data: { status: MarketStatus.SUSPENDED },
        });
      }

      const updated = await tx.listMatchup.update({
        where: { id: matchupId },
        data: {
          marketOpen: open,
          ...(duelId && !matchup.duelId ? { duelId } : {}),
        },
      });

      await this.logAudit(
        tx,
        open ? 'BRAZIL_MATCHUP_MARKET_OPEN' : 'BRAZIL_MATCHUP_MARKET_CLOSE',
        'ListMatchup',
        matchupId,
        { open, duelId, eventId },
        audit,
      );
      return updated;
    }, { timeout: 20000, maxWait: 5000 });
  }

  private async ensureDriverCar(
    tx: Prisma.TransactionClient,
    driver: { id: string; name: string; carNumber: string | null; team: string | null; cars: Array<{ id: string }> },
  ): Promise<string> {
    const existing = driver.cars[0];
    if (existing) return existing.id;
    // Car.name fica vazio por padrão — o admin preenche via /carros (nome do
    // veículo, ex.: "Gol 4x4 Minion"). NÃO concatenamos `driver.name` aqui
    // porque a UI já mostra o nome do piloto separadamente — antes ficava
    // duplicado no card do embate.
    const created = await tx.car.create({
      data: {
        driverId: driver.id,
        name: '',
        category: 'LISTAS_BRASIL',
        number: driver.carNumber ?? undefined,
      },
    });
    return created.id;
  }

  async adminDeleteMatchup(matchupId: string, audit: AuditContext) {
    const matchup = await this.prisma.listMatchup.findUnique({ where: { id: matchupId } });
    if (!matchup) throw new NotFoundException('Confronto não encontrado');

    return this.prisma.$transaction(async (tx) => {
      await tx.listMatchup.delete({ where: { id: matchupId } });
      await this.logAudit(tx, 'BRAZIL_MATCHUP_DELETE', 'ListMatchup', matchupId, null, audit);
      return { success: true };
    });
  }

  // ── Admin: Shark Tank ──────────────────────────────────

  async adminAddSharkTankEntry(eventId: string, dto: CreateSharkTankEntryDto, audit: AuditContext) {
    const event = await this.prisma.listEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento de lista não encontrado');

    const driver = await this.prisma.driver.findUnique({ where: { id: dto.driverId } });
    if (!driver) throw new NotFoundException('Piloto não encontrado');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.sharkTankEntry.findUnique({
        where: { listEventId_driverId: { listEventId: eventId, driverId: dto.driverId } },
      });
      if (existing) throw new ConflictException('Piloto já inscrito no Shark Tank deste evento');

      const entry = await tx.sharkTankEntry.create({
        data: {
          listEventId: eventId,
          driverId: dto.driverId,
          seed: dto.seed,
          notes: dto.notes,
          status: SharkTankStatus.REGISTERED,
        },
      });
      await this.logAudit(tx, 'BRAZIL_SHARK_TANK_CREATE', 'SharkTankEntry', entry.id, dto, audit);
      return entry;
    });
  }

  async adminUpdateSharkTankEntry(entryId: string, dto: UpdateSharkTankEntryDto, audit: AuditContext) {
    const entry = await this.prisma.sharkTankEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Inscrição Shark Tank não encontrada');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sharkTankEntry.update({
        where: { id: entryId },
        data: {
          status: dto.status,
          seed: dto.seed,
          notes: dto.notes,
        },
      });
      await this.logAudit(tx, 'BRAZIL_SHARK_TANK_UPDATE', 'SharkTankEntry', entryId, dto, audit);
      return updated;
    });
  }

  async adminRemoveSharkTankEntry(entryId: string, audit: AuditContext) {
    const entry = await this.prisma.sharkTankEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Inscrição Shark Tank não encontrada');

    return this.prisma.$transaction(async (tx) => {
      await tx.sharkTankEntry.delete({ where: { id: entryId } });
      await this.logAudit(tx, 'BRAZIL_SHARK_TANK_DELETE', 'SharkTankEntry', entryId, null, audit);
      return { success: true };
    });
  }

  // ── helpers ────────────────────────────────────────────

  private async ensureListExists(id: string) {
    const list = await this.prisma.brazilList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException('Lista não encontrada');
    return list;
  }

  private async nextRoundNumber(eventId: string) {
    const last = await this.prisma.listMatchup.findFirst({
      where: { listEventId: eventId },
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    });
    return (last?.roundNumber ?? 0) + 1;
  }

  private resolveDriverFromPosition(
    roster: Array<{ position: number; driverId: string }>,
    position: number | undefined | null,
  ): string | undefined {
    if (position == null) return undefined;
    return roster.find((r) => r.position === position)?.driverId;
  }

  private serializeList(
    list: any,
    options: { includeEvents?: boolean; includeSharkTank?: boolean } = {},
  ) {
    const roster = (list.roster ?? []).map((r: any) => ({
      id: r.id,
      position: r.position,
      isKing: r.isKing,
      driverId: r.driverId,
      driverName: r.driver?.name,
      driverNickname: r.driver?.nickname,
      driverCarNumber: r.driver?.carNumber,
      driverTeam: r.driver?.team,
      driverHometown: r.driver?.hometown,
      driverAvatarUrl: r.driver?.avatarUrl,
    }));

    const king = roster.find((r: any) => r.isKing) ?? null;

    const base: any = {
      id: list.id,
      areaCode: list.areaCode,
      name: list.name,
      format: list.format,
      administratorName: list.administratorName,
      hometown: list.hometown,
      active: list.active,
      roster,
      kingName: king?.driverName ?? null,
      rosterCount: roster.length,
    };

    if (options.includeEvents && list.events) {
      base.events = list.events.map((event: any) => ({
        id: event.id,
        eventId: event.eventId ?? null,
        name: event.name,
        scheduledAt: event.scheduledAt,
        endsAt: event.endsAt,
        status: event.status,
        type: event.type,
        notes: event.notes,
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
          isManualOverride: m.isManualOverride,
          marketOpen: m.marketOpen,
          settledAt: m.settledAt,
          notes: m.notes,
        })),
        ...(options.includeSharkTank
          ? {
              sharkTank: (event.sharkTank ?? []).map((s: any) => ({
                id: s.id,
                driverId: s.driverId,
                driverName: s.driver?.name,
                status: s.status,
                seed: s.seed,
                notes: s.notes,
              })),
            }
          : {}),
      }));
    }

    return base;
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

// ── PAR/ÍMPAR bracket generator (Listas Brasil) ──────────
// ODD (ÍMPAR):  n-1 × n-2, n-3 × n-4, ... 3 × 2   (king=1 and last=n sit out)
// EVEN (PAR):   n × n-1, n-2 × n-3, ... 2 × 1     (king also races)
/**
 * Constrói os pareamentos da rodada conforme o regulamento das Listas Brasil:
 *
 * - **ÍMPAR**: posições ímpares atacam pares acima delas (na verdade, abaixo
 *   no rank — número maior = pior). 3 ataca 2, 5 ataca 4, 7 ataca 6, etc.
 *   O Rei (posição 1) senta nesta rodada.
 * - **PAR**: posições pares atacam ímpares. 2 ataca 1 (= rei), 4 ataca 3,
 *   6 ataca 5, etc. Todos disputam.
 *
 * A ORDEM de disputa começa pelos números mais baixos (mais embaixo da lista
 * tem prioridade no embate inicial). Isso é importante porque o painel de
 * embates auto-abre o próximo mercado quando o admin audita o anterior —
 * o fluxo natural é começar pelo "challenger" mais baixo.
 *
 * Exemplos:
 * - TOP_20 ÍMPAR: 9 embates → ordem 1=3×2, 2=5×4, 3=7×6, …, 9=19×18
 * - TOP_20 PAR:  10 embates → ordem 1=2×1, 2=4×3, 3=6×5, …, 10=20×19
 * - TOP_10 ÍMPAR: 4 embates → ordem 1=3×2, 2=5×4, 3=7×6, 4=9×8
 * - TOP_10 PAR:   5 embates → ordem 1=2×1, 2=4×3, 3=6×5, 4=8×7, 5=10×9
 *
 * O `leftPosition` é sempre o desafiante (rank pior, número maior). Se o
 * desafiante vence, o swap de posições é aplicado em adminSettleMatchup.
 */
export function buildBracketPairs(
  format: ListFormat,
  roundType: ListRoundType,
): Array<{ order: number; leftPosition: number; rightPosition: number }> {
  const max = format === ListFormat.TOP_20 ? 20 : 10;
  const pairs: Array<{ order: number; leftPosition: number; rightPosition: number }> = [];

  if (roundType === ListRoundType.ODD) {
    let order = 1;
    // Ímpares atacam pares abaixo: 3×2, 5×4, 7×6 … (max-1)×(max-2). Rei (1) senta.
    for (let challenger = 3; challenger <= max - 1; challenger += 2) {
      pairs.push({ order, leftPosition: challenger, rightPosition: challenger - 1 });
      order += 1;
    }
  } else if (roundType === ListRoundType.EVEN) {
    let order = 1;
    // Pares atacam ímpares abaixo: 2×1, 4×3, 6×5 … max×(max-1). Rei é desafiado.
    for (let challenger = 2; challenger <= max; challenger += 2) {
      pairs.push({ order, leftPosition: challenger, rightPosition: challenger - 1 });
      order += 1;
    }
  }

  return pairs;
}
