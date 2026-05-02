import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BetStatus, CategoryEventStatus, CategoryMatchupStatus, DuelStatus, EventStatus, MarketStatus, MatchupSide, OddStatus, Prisma, TimeCategory, WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettlementService } from '../settlement.service';
import { CreateCategoryEventDto } from './dto/create-category-event.dto';
import { UpdateCategoryEventDto } from './dto/update-category-event.dto';
import { CreateBracketDto, SaveBracketLayoutDto, SettleCategoryMatchupDto, UpdateCompetitorDto, UpsertCompetitorDto, UpsertSuperFinalDto } from './dto/bracket.dto';
import { ImportCompetitorsDto } from './dto/import-competitors.dto';

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

    const created = await this.prisma.$transaction(
      async (tx) => {
        // Cria Event de apostas EAGER para que apareça em /admin/events
        // (dropdown do Multi-Runner) já no momento da criação da Copa,
        // antes de qualquer matchup abrir mercado.
        const linkedEvent = await tx.event.create({
          data: {
            sport: 'DRAG_RACE',
            name: dto.name.trim(),
            description: dto.description?.trim(),
            bannerUrl: dto.bannerUrl ?? null,
            featured: dto.featured ?? false,
            startAt: startDate,
            status: EventStatus.SCHEDULED,
          },
        });

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
            eventId: linkedEvent.id,
          },
        });

        // Cria todos os brackets em uma única chamada (em vez de N round-trips)
        if (dto.categories?.length) {
          await tx.categoryBracket.createMany({
            data: dto.categories.map((category) => ({
              categoryEventId: event.id,
              category,
              size: 8,
            })),
            skipDuplicates: true,
          });
        }

        return event;
      },
      { timeout: 20000, maxWait: 5000 },
    );

    // Audit log e fetch final fora da transação — não bloqueiam a criação
    await this.prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: 'CATEGORY_EVENT_CREATE',
        entity: 'CategoryEvent',
        entityId: created.id,
        payload: dto as unknown as Prisma.InputJsonValue,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      },
    }).catch((e) => this.logger.warn(`Audit CATEGORY_EVENT_CREATE falhou: ${e instanceof Error ? e.message : e}`));

    return this.prisma.categoryEvent.findUnique({
      where: { id: created.id },
      include: { brackets: { include: { _count: { select: { competitors: true, matchups: true } } } } },
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

  async adminHardDeleteEvent(id: string, audit: AuditContext = {}, options: { force?: boolean } = {}) {
    const force = !!options.force;
    const event = await this.prisma.categoryEvent.findUnique({
      where: { id },
      include: {
        brackets: {
          include: {
            matchups: { select: { id: true, duelId: true, settledAt: true } },
          },
        },
      },
    });
    if (!event) throw new NotFoundException('Evento não encontrado');

    // Coleta duelIds vinculados a esse evento (criados quando algum mercado foi aberto)
    const duelIds = event.brackets
      .flatMap((b) => b.matchups.map((m) => m.duelId))
      .filter((d): d is string => !!d);

    const settledMatchup = event.brackets.some((b) => b.matchups.some((m) => m.settledAt !== null));

    let betsCount = 0;
    if (duelIds.length > 0) {
      betsCount = await this.prisma.betItem.count({
        where: { odd: { market: { duelId: { in: duelIds } } } },
      });
    }

    if (!force) {
      if (settledMatchup) {
        throw new BadRequestException(
          'Não é possível excluir: existem rodadas já auditadas/liquidadas neste evento. Use "Excluir forçado" para anular as apostas e remover.',
        );
      }
      if (betsCount > 0) {
        throw new BadRequestException(
          'Não é possível excluir: este evento já possui apostas registradas. Use "Cancelar evento" para preservar o histórico ou "Excluir forçado" para anular as apostas.',
        );
      }
    }

    // Em modo force, carrega bilhetes pra reverter o impacto na carteira do usuário
    type BetReversal = {
      betId: string;
      userId: string;
      walletId: string | null;
      stake: Prisma.Decimal;
      potentialWin: Prisma.Decimal;
      status: BetStatus;
    };
    let reversals: BetReversal[] = [];
    if (force && duelIds.length > 0) {
      const betItems = await this.prisma.betItem.findMany({
        where: { odd: { market: { duelId: { in: duelIds } } } },
        include: {
          bet: { include: { user: { include: { wallet: true } } } },
        },
      });
      const seen = new Set<string>();
      for (const bi of betItems) {
        if (seen.has(bi.betId)) continue;
        seen.add(bi.betId);
        reversals.push({
          betId: bi.betId,
          userId: bi.bet.userId,
          walletId: bi.bet.user.wallet?.id ?? null,
          stake: bi.bet.stake,
          potentialWin: bi.bet.potentialWin,
          status: bi.bet.status,
        });
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        let refundedCount = 0;
        let payoutReversedCount = 0;

        if (force && reversals.length > 0) {
          for (const r of reversals) {
            // Reverte impacto na carteira pra que o usuário volte ao saldo pré-aposta
            //   OPEN/LOST: stake foi debitado e nunca devolvido → refund stake
            //   WON: stake foi debitado, payout creditado → refund stake e estorna payout (delta = stake - payout)
            //   REFUNDED: nada (já devolvido pelo voidMarket anterior)
            //   VOID/CASHED_OUT: tratamos como já reembolsado
            if (r.walletId) {
              if (r.status === BetStatus.OPEN || r.status === BetStatus.LOST) {
                await tx.wallet.update({
                  where: { id: r.walletId },
                  data: { balance: { increment: r.stake } },
                });
                await tx.walletTransaction.create({
                  data: {
                    walletId: r.walletId,
                    type: WalletTransactionType.BET_REFUND,
                    amount: r.stake,
                    reference: r.betId,
                  },
                });
                refundedCount += 1;
              } else if (r.status === BetStatus.WON) {
                // Estorna payout, devolve stake
                const delta = r.stake.sub(r.potentialWin); // pode ser negativo
                if (!delta.isZero()) {
                  await tx.wallet.update({
                    where: { id: r.walletId },
                    data: { balance: { increment: delta } },
                  });
                }
                await tx.walletTransaction.create({
                  data: {
                    walletId: r.walletId,
                    type: WalletTransactionType.BET_REFUND,
                    amount: delta,
                    reference: r.betId,
                  },
                });
                payoutReversedCount += 1;
              }
            }

            // Apaga comissões de afiliado vinculadas a essa aposta
            await tx.affiliateCommission.deleteMany({ where: { betId: r.betId } });
            // Apaga BetItems e a Bet (deleteMany pra ser idempotente — não erra se sumiu)
            await tx.betItem.deleteMany({ where: { betId: r.betId } });
            await tx.bet.deleteMany({ where: { id: r.betId } });
          }
        }

        // 1) Coleta TODOS os markets/duels referenciando este evento.
        //    Usa duelIds dos matchups + eventId vinculado, varrendo possíveis órfãos
        //    (ex.: matchups apagados deixam o Duel apontando pro Event sem caminho de volta).
        const marketIdSet = new Set<string>();
        const duelIdSet = new Set<string>(duelIds);

        if (event.eventId) {
          const eventMarkets = await tx.market.findMany({
            where: { eventId: event.eventId },
            select: { id: true, duelId: true },
          });
          for (const m of eventMarkets) {
            marketIdSet.add(m.id);
            if (m.duelId) duelIdSet.add(m.duelId);
          }
          const eventDuels = await tx.duel.findMany({
            where: { eventId: event.eventId },
            select: { id: true },
          });
          for (const d of eventDuels) duelIdSet.add(d.id);
        }
        if (duelIdSet.size > 0) {
          const duelMarkets = await tx.market.findMany({
            where: { duelId: { in: Array.from(duelIdSet) } },
            select: { id: true },
          });
          for (const m of duelMarkets) marketIdSet.add(m.id);
        }

        const marketIds = Array.from(marketIdSet);
        const allDuelIds = Array.from(duelIdSet);

        // 2) Apaga em ordem (filhos → pais), respeitando os Restrict do schema
        if (marketIds.length > 0) {
          const oddIds = await tx.odd
            .findMany({ where: { marketId: { in: marketIds } }, select: { id: true } })
            .then((rows) => rows.map((o) => o.id));

          if (oddIds.length > 0) {
            await tx.affiliateCommission.deleteMany({ where: { marketId: { in: marketIds } } });
            await tx.betItem.deleteMany({ where: { oddId: { in: oddIds } } });
            await tx.odd.deleteMany({ where: { id: { in: oddIds } } });
          }
          await tx.market.deleteMany({ where: { id: { in: marketIds } } });
        }

        if (allDuelIds.length > 0) {
          await tx.duelPoolState.deleteMany({ where: { duelId: { in: allDuelIds } } });
          await tx.duel.deleteMany({ where: { id: { in: allDuelIds } } });
        }

        if (event.eventId) {
          await tx.event.deleteMany({ where: { id: event.eventId } });
        }

        // 3) CategoryEvent — brackets, competitors e matchups caem em cascade
        await tx.categoryEvent.delete({ where: { id } });

        await this.logAudit(
          tx,
          force ? 'CATEGORY_EVENT_FORCE_DELETE' : 'CATEGORY_EVENT_HARD_DELETE',
          'CategoryEvent',
          id,
          {
            name: event.name,
            duelIds,
            linkedEventId: event.eventId,
            force,
            betsAffected: reversals.length,
            refundedCount,
            payoutReversedCount,
          },
          audit,
        );

        return {
          id,
          deleted: true,
          force,
          betsAffected: reversals.length,
          refundedCount,
          payoutReversedCount,
        };
      },
      { timeout: 60000, maxWait: 10000 },
    );
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

      const carNameTrimmed = dto.carName?.trim() || null;
      const competitor = await tx.categoryCompetitor.upsert({
        where: { bracketId_driverId: { bracketId, driverId } },
        create: {
          bracketId,
          driverId,
          carName: carNameTrimmed,
          carNumber: dto.carNumber ?? null,
          qualifyingReaction: reaction,
          qualifyingTrack: track,
          qualifyingTotal: total,
          qualifyingPosition: dto.qualifyingPosition,
        },
        update: {
          carName: carNameTrimmed,
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

  async adminImportCompetitors(eventId: string, dto: ImportCompetitorsDto, audit: AuditContext = {}) {
    const event = await this.prisma.categoryEvent.findUnique({
      where: { id: eventId },
      include: { brackets: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado');

    type Summary = {
      imported: number;
      skipped: number;
      bracketsCreated: number;
      perCategory: Record<string, { imported: number; skipped: number; bracketId: string }>;
      skippedDetails: Array<{ row: number; driverName: string; reason: string }>;
    };

    const summary: Summary = {
      imported: 0,
      skipped: 0,
      bracketsCreated: 0,
      perCategory: {},
      skippedDetails: [],
    };

    // 1) Sanitiza entradas e separa as inválidas
    type Sanitized = {
      row: number;
      driverName: string;
      lowerName: string;
      category: TimeCategory;
      original: ImportCompetitorsDto['entries'][number];
    };
    const sanitized: Sanitized[] = [];
    for (let i = 0; i < dto.entries.length; i++) {
      const e = dto.entries[i];
      const driverName = (e.driverName || '').trim();
      if (!driverName) {
        summary.skipped += 1;
        summary.skippedDetails.push({ row: i + 1, driverName: '', reason: 'Nome do piloto vazio' });
        continue;
      }
      sanitized.push({
        row: i + 1,
        driverName,
        lowerName: driverName.toLowerCase(),
        category: e.category,
        original: e,
      });
    }

    // 2) Garante brackets faltantes (poucos — uma criação por categoria)
    const bracketByCategory = new Map<TimeCategory, string>();
    for (const b of event.brackets) bracketByCategory.set(b.category, b.id);
    const neededCats = Array.from(new Set(sanitized.map((s) => s.category)));
    for (const cat of neededCats) {
      if (bracketByCategory.has(cat)) continue;
      const created = await this.prisma.categoryBracket.create({
        data: { categoryEventId: eventId, category: cat, size: 8 },
      });
      bracketByCategory.set(cat, created.id);
      summary.bracketsCreated += 1;
    }

    // 3) Lookup em lote dos drivers existentes (uma única query, case-insensitive)
    const lowerNames = Array.from(new Set(sanitized.map((s) => s.lowerName)));
    const driverIdByLower = new Map<string, string>();
    if (lowerNames.length > 0) {
      const existing = await this.prisma.$queryRaw<Array<{ id: string; name: string }>>(
        Prisma.sql`SELECT "id", "name" FROM "Driver" WHERE LOWER("name") IN (${Prisma.join(lowerNames)})`,
      );
      for (const d of existing) driverIdByLower.set(d.name.toLowerCase(), d.id);
    }

    // 4) Cria drivers ausentes em lote (createMany), depois rebusca os IDs
    const newDriversByLower = new Map<
      string,
      { name: string; nickname: string | null; team: string | null; hometown: string | null; carNumber: string | null }
    >();
    for (const s of sanitized) {
      if (driverIdByLower.has(s.lowerName)) continue;
      if (newDriversByLower.has(s.lowerName)) continue;
      newDriversByLower.set(s.lowerName, {
        name: s.driverName,
        nickname: s.original.driverNickname?.trim() || null,
        team: s.original.driverTeam?.trim() || null,
        hometown: s.original.driverHometown?.trim() || null,
        carNumber: s.original.carNumber ?? null,
      });
    }
    if (newDriversByLower.size > 0) {
      await this.prisma.driver.createMany({
        data: Array.from(newDriversByLower.values()),
      });
      const fresh = await this.prisma.$queryRaw<Array<{ id: string; name: string }>>(
        Prisma.sql`SELECT "id", "name" FROM "Driver" WHERE LOWER("name") IN (${Prisma.join(
          Array.from(newDriversByLower.keys()),
        )})`,
      );
      for (const d of fresh) {
        const key = d.name.toLowerCase();
        if (!driverIdByLower.has(key)) driverIdByLower.set(key, d.id);
      }
    }

    // 5) Pré-busca os pares (bracketId, driverId) já existentes
    const allBracketIds = Array.from(bracketByCategory.values());
    const existingCompetitors = allBracketIds.length
      ? await this.prisma.categoryCompetitor.findMany({
          where: { bracketId: { in: allBracketIds } },
          select: { bracketId: true, driverId: true },
        })
      : [];
    const existingPairs = new Set<string>();
    for (const c of existingCompetitors) existingPairs.add(`${c.bracketId}:${c.driverId}`);

    // 6) Monta payload do createMany de competitors
    const competitorData: Prisma.CategoryCompetitorCreateManyInput[] = [];
    const seenInBatch = new Set<string>();

    for (const s of sanitized) {
      const bracketId = bracketByCategory.get(s.category);
      if (!bracketId) {
        summary.skipped += 1;
        summary.skippedDetails.push({
          row: s.row,
          driverName: s.driverName,
          reason: 'Categoria sem chave',
        });
        continue;
      }
      const driverId = driverIdByLower.get(s.lowerName);
      if (!driverId) {
        summary.skipped += 1;
        summary.skippedDetails.push({
          row: s.row,
          driverName: s.driverName,
          reason: 'Não foi possível resolver o piloto',
        });
        continue;
      }
      const pairKey = `${bracketId}:${driverId}`;
      if (existingPairs.has(pairKey) || seenInBatch.has(pairKey)) {
        summary.skipped += 1;
        summary.skippedDetails.push({
          row: s.row,
          driverName: s.driverName,
          reason: `Já inscrito na categoria ${s.category}`,
        });
        const bucket = (summary.perCategory[s.category] ??= {
          imported: 0,
          skipped: 0,
          bracketId,
        });
        bucket.skipped += 1;
        continue;
      }
      seenInBatch.add(pairKey);

      const reaction =
        s.original.qualifyingReaction !== undefined ? new Prisma.Decimal(s.original.qualifyingReaction) : null;
      const track =
        s.original.qualifyingTrack !== undefined ? new Prisma.Decimal(s.original.qualifyingTrack) : null;
      const total = reaction && track ? reaction.add(track) : null;

      competitorData.push({
        bracketId,
        driverId,
        carName: s.original.carName?.trim() || null,
        carNumber: s.original.carNumber ?? null,
        qualifyingReaction: reaction,
        qualifyingTrack: track,
        qualifyingTotal: total,
      });

      summary.imported += 1;
      const bucket = (summary.perCategory[s.category] ??= {
        imported: 0,
        skipped: 0,
        bracketId,
      });
      bucket.imported += 1;
    }

    if (competitorData.length > 0) {
      await this.prisma.categoryCompetitor.createMany({
        data: competitorData,
        skipDuplicates: true,
      });
    }

    // 7) Audit log
    await this.prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: 'CATEGORY_COMPETITORS_IMPORT',
        entity: 'CategoryEvent',
        entityId: eventId,
        payload: {
          total: dto.entries.length,
          imported: summary.imported,
          skipped: summary.skipped,
          bracketsCreated: summary.bracketsCreated,
          perCategory: summary.perCategory,
        } as Prisma.InputJsonValue,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      },
    });

    return summary;
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

  // ── Admin: Super Final ──────────────────────────────
  // Cada categoria pode ter UMA Super Final montada manualmente após as rodadas
  // normais. Usamos roundNumber=99 + position=0 (sentinela longe das rodadas
  // normais) e isSuperFinal=true. Permite definir os dois pilotos por driverId
  // ou driverName (cria Driver novo se não existir, mesmo padrão do upsertCompetitor).

  private static readonly SUPER_FINAL_ROUND = 99;
  private static readonly SUPER_FINAL_POSITION = 0;

  async adminUpsertSuperFinal(bracketId: string, dto: UpsertSuperFinalDto, audit: AuditContext = {}) {
    const bracket = await this.prisma.categoryBracket.findUnique({ where: { id: bracketId } });
    if (!bracket) throw new NotFoundException('Chave não encontrada');

    const existing = await this.prisma.categoryMatchup.findFirst({
      where: { bracketId, isSuperFinal: true },
    });
    if (existing && existing.winnerSide && existing.settledAt) {
      throw new BadRequestException('Super Final já liquidada — vencedor é imutável');
    }

    const matchupId = await this.prisma.$transaction(async (tx) => {
      const leftCompetitorId = await this.resolveSuperFinalCompetitor(tx, bracketId, dto.left, 'left');
      const rightCompetitorId = await this.resolveSuperFinalCompetitor(tx, bracketId, dto.right, 'right');

      if (leftCompetitorId === rightCompetitorId) {
        throw new BadRequestException('Os dois lados da Super Final não podem ser o mesmo piloto');
      }

      let id: string;
      if (existing) {
        const updated = await tx.categoryMatchup.update({
          where: { id: existing.id },
          data: { leftCompetitorId, rightCompetitorId },
        });
        id = updated.id;
      } else {
        const created = await tx.categoryMatchup.create({
          data: {
            bracketId,
            roundNumber: CategoryEventsService.SUPER_FINAL_ROUND,
            position: CategoryEventsService.SUPER_FINAL_POSITION,
            isSuperFinal: true,
            leftCompetitorId,
            rightCompetitorId,
            status: CategoryMatchupStatus.PENDING,
          },
        });
        id = created.id;
      }

      await this.logAudit(
        tx,
        'CATEGORY_SUPER_FINAL_UPSERT',
        'CategoryMatchup',
        id,
        { bracketId, leftCompetitorId, rightCompetitorId, openMarket: !!dto.openMarket },
        audit,
      );
      return id;
    }, { timeout: 20000, maxWait: 5000 });

    if (dto.openMarket) {
      await this.adminToggleMatchupMarket(matchupId, true, audit);
    }

    return this.prisma.categoryMatchup.findUnique({
      where: { id: matchupId },
      include: {
        leftCompetitor: { include: { driver: true } },
        rightCompetitor: { include: { driver: true } },
      },
    });
  }

  private async resolveSuperFinalCompetitor(
    tx: Prisma.TransactionClient,
    bracketId: string,
    side: { driverId?: string; driverName?: string; driverNickname?: string; driverTeam?: string; carName?: string; carNumber?: string },
    label: 'left' | 'right',
  ): Promise<string> {
    let driverId = side.driverId;
    if (!driverId) {
      const name = side.driverName?.trim();
      if (!name) {
        throw new BadRequestException(`Informe driverId ou driverName para o lado ${label === 'left' ? '1' : '2'}`);
      }
      const found = await tx.driver.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (found) {
        driverId = found.id;
      } else {
        const created = await tx.driver.create({
          data: {
            name,
            nickname: side.driverNickname?.trim() || null,
            team: side.driverTeam?.trim() || null,
            carNumber: side.carNumber ?? null,
          },
        });
        driverId = created.id;
      }
    }

    const carNameTrimmed = side.carName?.trim() || null;
    const competitor = await tx.categoryCompetitor.upsert({
      where: { bracketId_driverId: { bracketId, driverId } },
      create: {
        bracketId,
        driverId,
        carName: carNameTrimmed,
        carNumber: side.carNumber ?? null,
      },
      update: {
        // Atualiza o carro só se foi enviado, sem apagar dados de qualificação
        carName: carNameTrimmed ?? undefined,
        carNumber: side.carNumber ?? undefined,
      },
    });
    return competitor.id;
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
      // Apaga matchups pendentes (não auditados) e recria.
      // IMPORTANTE: Super Final é gerenciada por endpoint próprio — não pode ser
      // afetada pelo save da chave normal.
      await tx.categoryMatchup.deleteMany({
        where: { bracketId, status: CategoryMatchupStatus.PENDING, isSuperFinal: false },
      });

      for (const slot of dto.slots) {
        const existing = await tx.categoryMatchup.findUnique({
          where: { bracketId_roundNumber_position: { bracketId, roundNumber: slot.roundNumber, position: slot.position } },
        });
        if (existing) {
          // Já liquidado ou é Super Final - não sobrescreve competidores
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
      // Múltiplos mercados podem ficar abertos simultaneamente — operadores podem
      // movimentar várias apostas em paralelo enquanto os embates rolam.

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
    driver: { id: string; name: string; cars: Array<{ id: string }> },
    carName: string | null,
    carNumber: string | null,
  ): Promise<string> {
    const existing = driver.cars[0];
    if (existing) return existing.id;
    const created = await tx.car.create({
      data: {
        driverId: driver.id,
        name: carName?.trim() || driver.name,
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
