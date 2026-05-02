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
    const events = await this.prisma.listEvent.findMany({
      where: {
        status: { in: [ListEventStatus.IN_PROGRESS, ListEventStatus.FINISHED] },
        list: { active: true },
      },
      orderBy: { scheduledAt: 'asc' },
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
      name: event.name,
      scheduledAt: event.scheduledAt,
      endsAt: event.endsAt,
      status: event.status,
      type: event.type,
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
          status: ListEventStatus.DRAFT,
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

    return this.prisma.$transaction(async (tx) => {
      await tx.listEvent.delete({ where: { id: eventId } });
      await this.logAudit(tx, 'BRAZIL_EVENT_DELETE', 'ListEvent', eventId, null, audit);
      return { success: true };
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

      if (event.status === ListEventStatus.DRAFT) {
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

      return { roundNumber, roundType: dto.roundType, count: created.length };
    });
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

        if (matchup.listEvent.status === ListEventStatus.DRAFT) {
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
    const created = await tx.car.create({
      data: {
        driverId: driver.id,
        name: driver.team ? `${driver.name} — ${driver.team}` : driver.name,
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
export function buildBracketPairs(
  format: ListFormat,
  roundType: ListRoundType,
): Array<{ order: number; leftPosition: number; rightPosition: number }> {
  const max = format === ListFormat.TOP_20 ? 20 : 10;
  const pairs: Array<{ order: number; leftPosition: number; rightPosition: number }> = [];

  if (roundType === ListRoundType.ODD) {
    let order = 1;
    for (let left = max - 1; left >= 3; left -= 2) {
      pairs.push({ order, leftPosition: left, rightPosition: left - 1 });
      order += 1;
    }
  } else if (roundType === ListRoundType.EVEN) {
    let order = 1;
    for (let left = max; left >= 2; left -= 2) {
      pairs.push({ order, leftPosition: left, rightPosition: left - 1 });
      order += 1;
    }
  }

  return pairs;
}
