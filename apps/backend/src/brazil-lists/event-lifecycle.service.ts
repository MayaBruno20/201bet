import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ArmageddonStatus,
  CategoryEventStatus,
  EventStatus,
  ListEventStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * Cron de lifecycle dos eventos (ListEvent, CategoryEvent, ArmageddonEvent +
 * o Event "guarda-chuva" usado pelo módulo de apostas).
 *
 * Quatro passos por tick:
 *   1. Promove SCHEDULED → IN_PROGRESS quando scheduledAt chega.
 *   2. Finaliza por endsAt — só quando o admin preencheu data de fim. Eventos
 *      sem endsAt ficam "Ao vivo" até o admin marcar como encerrado
 *      manualmente. Decisão explícita do usuário pra evitar finalização
 *      precoce de testes / eventos longos.
 *   3. **SINCRONIZA** Event.status com a entidade ligada — passo idempotente
 *      que conserta drift (ex.: ListEvent foi pra IN_PROGRESS por ação manual
 *      mas o Event pai ficou em SCHEDULED).
 *   4. Promove Events "soltos" (sem ListEvent/CategoryEvent/ArmageddonEvent
 *      ligado) com base em Event.startAt.
 *
 * Tick fixo de 30s — granularidade suficiente pra "no horário do início/fim"
 * sem sobrecarregar a DB.
 */
const TICK_MS = 30_000;

/**
 * Janela de reversão (one-shot). Versão anterior do cron tinha fallback de 12h
 * que finalizou eventos sem endsAt indevidamente. Na inicialização, eventos
 * FINISHED com `endsAt` nulo e startAt recente (< janela) voltam para LIVE.
 * Eventos mais antigos que isso permanecem encerrados — assume-se intencional.
 */
const BUGGY_FINALIZE_RECOVERY_DAYS = 7;

@Injectable()
export class EventLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventLifecycleService.name);
  private ticker?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Reversão one-shot ANTES do primeiro tick — evita race com finalize/sync.
    await this.revertBuggyFinalizations();
    void this.runTick();
    this.ticker = setInterval(() => {
      void this.runTick();
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.ticker) clearInterval(this.ticker);
  }

  private async runTick() {
    try {
      const now = new Date();
      await this.promoteListEvents(now);
      await this.finalizeListEvents(now);
      await this.promoteCategoryEvents(now);
      await this.finalizeCategoryEvents(now);
      await this.promoteArmageddonEvents(now);
      await this.finalizeArmageddonEvents(now);
      await this.syncEventStatuses();
      await this.promoteOrphanEvents(now);
    } catch (e) {
      this.logger.warn(
        `Falha no tick de lifecycle: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  // ── ListEvent ────────────────────────────────────────────────

  private async promoteListEvents(now: Date) {
    const result = await this.prisma.listEvent.updateMany({
      where: {
        status: ListEventStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      data: { status: ListEventStatus.IN_PROGRESS },
    });
    if (result.count > 0) {
      this.logger.log(`ListEvent: promovidos ${result.count} SCHEDULED → IN_PROGRESS`);
    }
  }

  /** Finaliza somente quando endsAt está preenchido e passou. */
  private async finalizeListEvents(now: Date) {
    const result = await this.prisma.listEvent.updateMany({
      where: {
        status: {
          in: [
            ListEventStatus.IN_PROGRESS,
            ListEventStatus.SCHEDULED,
            ListEventStatus.DRAFT,
          ],
        },
        endsAt: { not: null, lte: now },
      },
      data: { status: ListEventStatus.FINISHED },
    });
    if (result.count > 0) {
      this.logger.log(`ListEvent: finalizados ${result.count} → FINISHED (endsAt passou)`);
    }
  }

  // ── CategoryEvent ────────────────────────────────────────────

  private async promoteCategoryEvents(now: Date) {
    const result = await this.prisma.categoryEvent.updateMany({
      where: {
        status: {
          in: [
            CategoryEventStatus.REGISTRATION_OPEN,
            CategoryEventStatus.QUALIFYING,
            CategoryEventStatus.DRAFT,
          ],
        },
        scheduledAt: { lte: now },
      },
      data: { status: CategoryEventStatus.IN_PROGRESS },
    });
    if (result.count > 0) {
      this.logger.log(`CategoryEvent: promovidos ${result.count} → IN_PROGRESS`);
    }
  }

  private async finalizeCategoryEvents(now: Date) {
    const result = await this.prisma.categoryEvent.updateMany({
      where: {
        status: { notIn: [CategoryEventStatus.FINISHED, CategoryEventStatus.CANCELED] },
        endsAt: { not: null, lte: now },
      },
      data: { status: CategoryEventStatus.FINISHED },
    });
    if (result.count > 0) {
      this.logger.log(`CategoryEvent: finalizados ${result.count} → FINISHED`);
    }
  }

  // ── ArmageddonEvent ──────────────────────────────────────────

  private async promoteArmageddonEvents(now: Date) {
    const result = await this.prisma.armageddonEvent.updateMany({
      where: {
        status: { in: [ArmageddonStatus.ROSTER_OPEN, ArmageddonStatus.DRAFT] },
        scheduledAt: { lte: now },
      },
      data: { status: ArmageddonStatus.IN_PROGRESS },
    });
    if (result.count > 0) {
      this.logger.log(`ArmageddonEvent: promovidos ${result.count} → IN_PROGRESS`);
    }
  }

  private async finalizeArmageddonEvents(now: Date) {
    const result = await this.prisma.armageddonEvent.updateMany({
      where: {
        status: { notIn: [ArmageddonStatus.FINISHED, ArmageddonStatus.CANCELED] },
        endsAt: { not: null, lte: now },
      },
      data: { status: ArmageddonStatus.FINISHED },
    });
    if (result.count > 0) {
      this.logger.log(`ArmageddonEvent: finalizados ${result.count} → FINISHED`);
    }
  }

  // ── Sync Event ←─ ListEvent/CategoryEvent/ArmageddonEvent ────

  /**
   * Garante que Event.status reflete o status da entidade especializada ligada.
   * Idempotente — só UPDATE quando há divergência.
   */
  private async syncEventStatuses() {
    const listLinks = await this.prisma.listEvent.findMany({
      where: { eventId: { not: null } },
      select: { eventId: true, status: true },
    });
    for (const link of listLinks) {
      if (!link.eventId) continue;
      const target = this.mapListStatus(link.status);
      await this.prisma.event.updateMany({
        where: { id: link.eventId, status: { not: target } },
        data: { status: target },
      });
    }

    const catLinks = await this.prisma.categoryEvent.findMany({
      where: { eventId: { not: null } },
      select: { eventId: true, status: true },
    });
    for (const link of catLinks) {
      if (!link.eventId) continue;
      const target = this.mapCategoryStatus(link.status);
      await this.prisma.event.updateMany({
        where: { id: link.eventId, status: { not: target } },
        data: { status: target },
      });
    }

    const armaLinks = await this.prisma.armageddonEvent.findMany({
      where: { eventId: { not: null } },
      select: { eventId: true, status: true },
    });
    for (const link of armaLinks) {
      if (!link.eventId) continue;
      const target = this.mapArmageddonStatus(link.status);
      await this.prisma.event.updateMany({
        where: { id: link.eventId, status: { not: target } },
        data: { status: target },
      });
    }
  }

  private mapListStatus(status: ListEventStatus): EventStatus {
    switch (status) {
      case ListEventStatus.IN_PROGRESS:
        return EventStatus.LIVE;
      case ListEventStatus.FINISHED:
        return EventStatus.FINISHED;
      case ListEventStatus.CANCELED:
        return EventStatus.CANCELED;
      default:
        return EventStatus.SCHEDULED;
    }
  }

  private mapCategoryStatus(status: CategoryEventStatus): EventStatus {
    switch (status) {
      case CategoryEventStatus.IN_PROGRESS:
        return EventStatus.LIVE;
      case CategoryEventStatus.FINISHED:
        return EventStatus.FINISHED;
      case CategoryEventStatus.CANCELED:
        return EventStatus.CANCELED;
      default:
        return EventStatus.SCHEDULED;
    }
  }

  private mapArmageddonStatus(status: ArmageddonStatus): EventStatus {
    switch (status) {
      case ArmageddonStatus.IN_PROGRESS:
        return EventStatus.LIVE;
      case ArmageddonStatus.FINISHED:
        return EventStatus.FINISHED;
      case ArmageddonStatus.CANCELED:
        return EventStatus.CANCELED;
      default:
        return EventStatus.SCHEDULED;
    }
  }

  // ── Events soltos (sem entidade especializada ligada) ────────

  /**
   * Para Events criados direto (sem ListEvent/CategoryEvent/ArmageddonEvent),
   * promove SCHEDULED → LIVE quando startAt chega. NÃO finaliza automaticamente
   * — admin tem que marcar manualmente, mesma política dos eventos com
   * entidade especializada sem endsAt.
   */
  private async promoteOrphanEvents(now: Date) {
    const [listLinked, catLinked, armaLinked] = await Promise.all([
      this.prisma.listEvent.findMany({ select: { eventId: true }, where: { eventId: { not: null } } }),
      this.prisma.categoryEvent.findMany({ select: { eventId: true }, where: { eventId: { not: null } } }),
      this.prisma.armageddonEvent.findMany({ select: { eventId: true }, where: { eventId: { not: null } } }),
    ]);
    const linkedIds = new Set<string>([
      ...listLinked.map((l) => l.eventId).filter((id): id is string => !!id),
      ...catLinked.map((l) => l.eventId).filter((id): id is string => !!id),
      ...armaLinked.map((l) => l.eventId).filter((id): id is string => !!id),
    ]);

    const candidates = await this.prisma.event.findMany({
      where: {
        status: EventStatus.SCHEDULED,
        startAt: { lte: now },
      },
      select: { id: true },
    });
    const orphanIds = candidates.filter((e) => !linkedIds.has(e.id)).map((e) => e.id);
    if (orphanIds.length === 0) return;

    await this.prisma.event.updateMany({
      where: { id: { in: orphanIds } },
      data: { status: EventStatus.LIVE },
    });
    this.logger.log(`Event órfão: ${orphanIds.length} SCHEDULED → LIVE`);
  }

  // ── Reversão one-shot do bug do fallback de 12h ──────────────

  /**
   * Conserta o estrago do tick anterior (que usava FINISHED_FALLBACK_HOURS=12h)
   * revertendo eventos finalizados por engano. Critério:
   *   - status = FINISHED
   *   - endsAt = null (sem fim explícito — única forma de ter caído no fallback)
   *   - scheduledAt está dentro da janela de recuperação (< 7 dias)
   *
   * Eventos com endsAt preenchido e passado permanecem FINISHED (legitimamente
   * finalizados pelo cron). Eventos mais antigos que a janela também ficam —
   * assume-se que o admin queria mesmo encerrar.
   *
   * Roda só uma vez por boot. O cron novo (sem fallback) não re-finaliza esses
   * mesmos eventos no próximo tick, então é seguro.
   */
  private async revertBuggyFinalizations() {
    const cutoff = new Date(
      Date.now() - BUGGY_FINALIZE_RECOVERY_DAYS * 24 * 60 * 60 * 1000,
    );

    const listReverted = await this.prisma.listEvent.updateMany({
      where: {
        status: ListEventStatus.FINISHED,
        endsAt: null,
        scheduledAt: { gte: cutoff },
      },
      data: { status: ListEventStatus.IN_PROGRESS },
    });

    const catReverted = await this.prisma.categoryEvent.updateMany({
      where: {
        status: CategoryEventStatus.FINISHED,
        endsAt: null,
        scheduledAt: { gte: cutoff },
      },
      data: { status: CategoryEventStatus.IN_PROGRESS },
    });

    const armaReverted = await this.prisma.armageddonEvent.updateMany({
      where: {
        status: ArmageddonStatus.FINISHED,
        endsAt: null,
        scheduledAt: { gte: cutoff },
      },
      data: { status: ArmageddonStatus.IN_PROGRESS },
    });

    // Para Events órfãos (sem entidade ligada), usa startAt em vez de scheduledAt.
    // Identifica IDs ligados pra não tocar Events que devem ser revertidos via sync.
    const [listLinked, catLinked, armaLinked] = await Promise.all([
      this.prisma.listEvent.findMany({ select: { eventId: true }, where: { eventId: { not: null } } }),
      this.prisma.categoryEvent.findMany({ select: { eventId: true }, where: { eventId: { not: null } } }),
      this.prisma.armageddonEvent.findMany({ select: { eventId: true }, where: { eventId: { not: null } } }),
    ]);
    const linkedIds = [
      ...listLinked.map((l) => l.eventId),
      ...catLinked.map((l) => l.eventId),
      ...armaLinked.map((l) => l.eventId),
    ].filter((id): id is string => !!id);

    const orphanReverted = await this.prisma.event.updateMany({
      where: {
        status: EventStatus.FINISHED,
        startAt: { gte: cutoff },
        id: { notIn: linkedIds },
      },
      data: { status: EventStatus.LIVE },
    });

    const total =
      listReverted.count + catReverted.count + armaReverted.count + orphanReverted.count;
    if (total > 0) {
      this.logger.log(
        `Reversão one-shot: ${listReverted.count} ListEvent, ${catReverted.count} CategoryEvent, ${armaReverted.count} ArmageddonEvent, ${orphanReverted.count} Event órfãos voltaram de FINISHED.`,
      );
    }
  }
}
