import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ListEventStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * Promove automaticamente eventos SCHEDULED → IN_PROGRESS quando o `scheduledAt`
 * chega. Não abre mercados — só atualiza o status semântico (de "Agendado" pra
 * "Ao vivo"). A abertura efetiva de cada embate continua sendo manual via
 * adminToggleMatchupMarket, porque a casa precisa do controle de timing por
 * passada.
 *
 * Tick fixo de 30s — granularidade suficiente pra "no horário do início"
 * sem sobrecarregar a DB.
 */
const TICK_MS = 30_000;

@Injectable()
export class EventLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventLifecycleService.name);
  private ticker?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Roda uma vez ao subir (cobre janela perdida durante deploy/restart) e depois a cada TICK_MS.
    void this.promoteDueEvents();
    this.ticker = setInterval(() => {
      void this.promoteDueEvents();
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.ticker) clearInterval(this.ticker);
  }

  /**
   * Encontra ListEvents SCHEDULED cujo scheduledAt já passou e os promove para
   * IN_PROGRESS. Idempotente — se nada match, é no-op.
   */
  private async promoteDueEvents() {
    try {
      const now = new Date();
      const result = await this.prisma.listEvent.updateMany({
        where: {
          status: ListEventStatus.SCHEDULED,
          scheduledAt: { lte: now },
        },
        data: { status: ListEventStatus.IN_PROGRESS },
      });
      if (result.count > 0) {
        this.logger.log(`Promovidos ${result.count} ListEvent(s) SCHEDULED → IN_PROGRESS`);
      }
    } catch (e) {
      this.logger.warn(
        `Falha ao promover eventos agendados: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
