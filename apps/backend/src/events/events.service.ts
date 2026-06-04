import { Injectable } from '@nestjs/common';
import { ArmageddonStatus, CategoryEventStatus, EventStatus } from '@prisma/client';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../database/prisma.service';
import { HOUSE_MARGIN_PERCENT, SEED_ODD } from '../market.service';

type PublicMarket = {
  id: string;
  name: string;
  status: string;
  odds: Array<{ id: string; label: string; value: number; status: string; version: number }>;
};

type PublicDuel = {
  id: string;
  startsAt: Date | string;
  bookingCloseAt: Date | string | null;
  status: string;
  left: { carId: string; carName: string; driverName: string; category: string };
  right: { carId: string; carName: string; driverName: string; category: string };
};

type PublicEvent = {
  id: string;
  sport: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  featured: boolean;
  startAt: Date | string;
  status: string;
  markets: PublicMarket[];
  duels: PublicDuel[];
  /**
   * Quando preenchido, este "evento" é na verdade um embate personalizado avulso
   * renderizado como evento standalone. O frontend usa esse campo pra deep-linkar
   * `/apostas?duelId=...` em vez de `?eventId=...` (que não funciona para o curinga).
   */
  customDuelId?: string;
};

type FeaturedEvent = {
  id: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  startAt: Date | string;
  status: string;
  sport: string;
  featured: boolean;
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async listEvents() {
    // v4: filtra FINISHED do /events público — eventos encerrados vão para a página
    // dedicada /eventos/finalizados (GET /events/finished).
    const cacheKey = 'events:public:v4';
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) {
      return cached as PublicEvent[];
    }

    const [events, categoryEvents, armageddonEvents] = await Promise.all([
      this.prisma.event.findMany({
        where: { status: { notIn: [EventStatus.CANCELED, EventStatus.FINISHED] } },
        orderBy: { startAt: 'asc' },
        include: {
          markets: {
            orderBy: { createdAt: 'asc' },
            include: {
              odds: { orderBy: { createdAt: 'asc' } },
              duel: { include: { poolState: true } },
            },
          },
          duels: {
            orderBy: { startsAt: 'asc' },
            include: {
              leftCar: { include: { driver: true } },
              rightCar: { include: { driver: true } },
            },
          },
        },
      }),
      this.prisma.categoryEvent.findMany({
        where: {
          status: { notIn: [CategoryEventStatus.CANCELED, CategoryEventStatus.FINISHED] },
          eventId: null,
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      this.prisma.armageddonEvent.findMany({
        // Antes filtrava eventId:null — mas todo Armageddon nasce com um Event
        // vinculado (eventId NOT NULL), então isso escondia 100% deles de /eventos.
        where: {
          status: { notIn: [ArmageddonStatus.CANCELED, ArmageddonStatus.FINISHED] },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    // Ids dos Event vinculados a um Armageddon — excluídos dos cards de Event para
    // não duplicar (o Armageddon já aparece como card próprio `armageddon:<id>`).
    const armaLinkedEventIds = new Set(
      armageddonEvents.map((a) => a.eventId).filter((id): id is string => !!id),
    );

    // Margem da casa é FIXA — ver constante em market.service.
    const rake = HOUSE_MARGIN_PERCENT / 100;

    // Filtro pós-load: esconde eventos sem nenhum duelo ativo (apostável).
    // Considera "ativo" qualquer duelo cujo status != CANCELED. Isso cobre 2 casos:
    //   1. Container de Embates Rápidos com o único duelo cancelado (não há mais
    //      o que apostar — não deve aparecer).
    //   2. Event órfão criado antes mas sem duelos (rascunho que ninguém pode usar).
    // Eventos com pelo menos 1 duelo BOOKING_OPEN/CLOSED/SCHEDULED/FINISHED passam,
    // permitindo o público acompanhar resultados.
    //
    // O evento "✨ Embates Personalizados" é filtrado: ele é apenas container
    // interno. Cada duelo avulso dentro dele vira um "evento sintético" abaixo,
    // exibido na /eventos com banner próprio e título customTitle.
    const eventsWithActiveDuels = events.filter((event) =>
      event.name !== '✨ Embates Personalizados' &&
      !armaLinkedEventIds.has(event.id) && // o Armageddon aparece como card próprio
      event.duels.some((d) => d.status !== 'CANCELED'),
    );

    // Embates personalizados avulsos (sem vínculo a evento real) — viram cards
    // standalone na /eventos, usando seu banner + customTitle. Já vinculados
    // aparecem dentro do evento-pai e não precisam de card próprio.
    const curingaEvent = events.find((e) => e.name === '✨ Embates Personalizados');
    const avulsoCustomDuels = curingaEvent
      ? curingaEvent.duels.filter((d) => d.isCustom && d.status !== 'CANCELED')
      : [];
    const curingaMarketsByDuelId = curingaEvent
      ? new Map(curingaEvent.markets.filter((m) => m.duelId).map((m) => [m.duelId as string, m]))
      : new Map();

    const fromEvent: PublicEvent[] = eventsWithActiveDuels.map((event) => ({
      id: event.id,
      sport: event.sport,
      name: event.name,
      description: event.description,
      bannerUrl: event.bannerUrl,
      featured: event.featured,
      startAt: event.startAt,
      status: event.status,
      markets: event.markets.map((market) => {
        // Calcula odds reais a partir do pool persistido (pari-mutuel) em vez do
        // valor seed (1.90) gravado quando o admin abriu o mercado.
        const leftPool = Number(market.duel?.poolState?.leftPool ?? 0);
        const rightPool = Number(market.duel?.poolState?.rightPool ?? 0);
        const totalPool = leftPool + rightPool;
        const net = totalPool * (1 - rake);

        const computeOddByIndex = (idx: number) => {
          if (market.status === 'SETTLED' && market.winnerOddId) {
            const winnerIndex = market.odds.findIndex((o) => o.id === market.winnerOddId);
            if (idx !== winnerIndex) return 0;
            const winnerPool = winnerIndex === 0 ? leftPool : rightPool;
            // Mesmo piso de 1.0 da settlement: vencedor nunca recebe < stake.
            return winnerPool > 0 ? Math.max(1.0, net / winnerPool) : 0;
          }
          const sidePool = idx === 0 ? leftPool : rightPool;
          if (sidePool > 0) {
            return Math.max(1.01, net / sidePool);
          }
          // Pool zero (ninguém apostou nesse lado ainda): exibe a cotação seed.
          // O campo `initialOdds` no payload sinaliza pro frontend mostrar o microcopy.
          return Number(market.odds[idx]?.value ?? SEED_ODD);
        };

        return {
          id: market.id,
          name: market.name,
          status: market.status,
          // Quando ambos os lados ainda têm pool zero, as cotações exibidas são
          // valores seed iniciais. Frontend usa pra mostrar microcopy explicativo.
          initialOdds: leftPool === 0 && rightPool === 0,
          odds: market.odds.map((odd, idx) => ({
            id: odd.id,
            label: odd.label,
            value: Number(computeOddByIndex(idx).toFixed(2)),
            status: odd.status,
            version: odd.version,
          })),
        };
      }),
      duels: event.duels.map((duel) => ({
        id: duel.id,
        startsAt: duel.startsAt,
        bookingCloseAt: duel.bookingCloseAt,
        status: duel.status,
        left: {
          carId: duel.leftCar.id,
          carName: duel.leftCar.name,
          driverName: duel.leftCar.driver.name,
          category: duel.leftCar.category,
        },
        right: {
          carId: duel.rightCar.id,
          carName: duel.rightCar.name,
          driverName: duel.rightCar.driver.name,
          category: duel.rightCar.category,
        },
      })),
    }));

    const fromCategory: PublicEvent[] = categoryEvents.map((ce) => ({
      id: `category:${ce.id}`,
      sport: 'COPA_CATEGORIAS',
      name: ce.name,
      description: ce.description,
      bannerUrl: ce.bannerUrl,
      featured: ce.featured,
      startAt: ce.scheduledAt,
      status: this.mapCategoryStatus(ce.status),
      markets: [],
      duels: [],
    }));

    const fromArmageddon: PublicEvent[] = armageddonEvents.map((ae) => ({
      id: `armageddon:${ae.id}`,
      sport: 'ARMAGEDDON',
      name: ae.name,
      description: ae.description,
      bannerUrl: ae.bannerUrl,
      featured: ae.featured,
      startAt: ae.scheduledAt,
      status: this.mapArmageddonStatus(ae.status),
      markets: [],
      duels: [],
    }));

    // Sintéticos: cada embate personalizado avulso vira um "evento" próprio.
    const fromCustomDuels: PublicEvent[] = avulsoCustomDuels.map((duel) => {
      const market = curingaMarketsByDuelId.get(duel.id);
      const leftLabel = duel.leftCar.name?.trim() || duel.leftCar.driver.name;
      const rightLabel = duel.rightCar.name?.trim() || duel.rightCar.driver.name;
      const title = duel.customTitle?.trim() || `${leftLabel} x ${rightLabel}`;

      // Reaproveita a math de odds (pari-mutuel) usada para eventos reais.
      let markets: PublicMarket[] = [];
      if (market) {
        const leftPool = Number(market.duel?.poolState?.leftPool ?? 0);
        const rightPool = Number(market.duel?.poolState?.rightPool ?? 0);
        const totalPool = leftPool + rightPool;
        const net = totalPool * (1 - rake);
        const computeOddByIndex = (idx: number) => {
          if (market.status === 'SETTLED' && market.winnerOddId) {
            const winnerIndex = market.odds.findIndex((o) => o.id === market.winnerOddId);
            if (idx !== winnerIndex) return 0;
            const winnerPool = winnerIndex === 0 ? leftPool : rightPool;
            return winnerPool > 0 ? Math.max(1.0, net / winnerPool) : 0;
          }
          const sidePool = idx === 0 ? leftPool : rightPool;
          if (sidePool > 0) return Math.max(1.01, net / sidePool);
          return Number(market.odds[idx]?.value ?? SEED_ODD);
        };
        markets = [{
          id: market.id,
          name: market.name,
          status: market.status,
          odds: market.odds.map((odd, idx) => ({
            id: odd.id,
            label: odd.label,
            value: Number(computeOddByIndex(idx).toFixed(2)),
            status: odd.status,
            version: odd.version,
          })),
        }];
      }

      // Status do "evento" sintético reflete o status do duelo:
      //   - BOOKING_OPEN/SCHEDULED → LIVE (admin abriu o mercado já na criação)
      //   - BOOKING_CLOSED → LIVE (ainda visível, mas booking fechou)
      //   - FINISHED → FINISHED
      const eventStatus =
        duel.status === 'FINISHED' ? 'FINISHED' :
        duel.status === 'CANCELED' ? 'CANCELED' :
        'LIVE';

      return {
        id: `custom-duel:${duel.id}`,
        sport: 'DRAG_RACE',
        name: title,
        description: null,
        bannerUrl: duel.bannerUrl ?? null,
        featured: false,
        startAt: duel.startsAt,
        status: eventStatus,
        customDuelId: duel.id,
        markets,
        duels: [{
          id: duel.id,
          startsAt: duel.startsAt,
          bookingCloseAt: duel.bookingCloseAt,
          status: duel.status,
          left: {
            carId: duel.leftCar.id,
            carName: duel.leftCar.name,
            driverName: duel.leftCar.driver.name,
            category: duel.leftCar.category,
          },
          right: {
            carId: duel.rightCar.id,
            carName: duel.rightCar.name,
            driverName: duel.rightCar.driver.name,
            category: duel.rightCar.category,
          },
        }],
      };
    });

    const payload = [
      ...fromEvent,
      ...fromCategory,
      ...fromArmageddon,
      ...fromCustomDuels,
    ].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );

    await this.cache.set(cacheKey, payload, 15);
    return payload;
  }

  /**
   * Eventos encerrados (FINISHED) com resumo público:
   *   - Lista de passadas (matchups) com vencedores
   *   - % do pool para cada lado e pool total (em reais)
   * Usado em /eventos/finalizados (página pública dedicada).
   */
  async listFinishedEvents() {
    const cacheKey = 'events:finished:public:v1';
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;

    const events = await this.prisma.event.findMany({
      where: { status: EventStatus.FINISHED },
      orderBy: { startAt: 'desc' },
      take: 50,
      include: {
        duels: {
          orderBy: { startsAt: 'asc' },
          include: {
            leftCar: { include: { driver: true } },
            rightCar: { include: { driver: true } },
            poolState: true,
            markets: { select: { winnerOddId: true, odds: true } },
          },
        },
      },
    });

    const filtered = events
      .map((event) => {
        const duels = event.duels
          .filter((d) => d.status !== 'CANCELED')
          .map((d) => {
            const leftPool = Number(d.poolState?.leftPool ?? 0);
            const rightPool = Number(d.poolState?.rightPool ?? 0);
            const totalPool = leftPool + rightPool;
            let winnerSide: 'LEFT' | 'RIGHT' | null = null;
            const settledMarket = d.markets.find((m) => m.winnerOddId);
            if (settledMarket && settledMarket.winnerOddId) {
              const winnerIdx = settledMarket.odds.findIndex(
                (o) => o.id === settledMarket.winnerOddId,
              );
              if (winnerIdx === 0) winnerSide = 'LEFT';
              else if (winnerIdx === 1) winnerSide = 'RIGHT';
            }
            return {
              id: d.id,
              startsAt: d.startsAt,
              status: d.status,
              left: { driverName: d.leftCar.driver.name, carName: d.leftCar.name },
              right: { driverName: d.rightCar.driver.name, carName: d.rightCar.name },
              winnerSide,
              leftPool,
              rightPool,
              totalPool,
              leftPercent: totalPool > 0 ? (leftPool / totalPool) * 100 : 0,
              rightPercent: totalPool > 0 ? (rightPool / totalPool) * 100 : 0,
            };
          });
        const eventTotalPool = duels.reduce((s, d) => s + d.totalPool, 0);
        return {
          id: event.id,
          sport: event.sport,
          name: event.name,
          description: event.description,
          bannerUrl: event.bannerUrl,
          startAt: event.startAt,
          status: event.status,
          totalPool: eventTotalPool,
          duelsCount: duels.length,
          settledDuels: duels.filter((d) => d.winnerSide !== null).length,
          duels,
        };
      })
      .filter((e) => e.duelsCount > 0);

    await this.cache.set(cacheKey, filtered, 60);
    return filtered;
  }

  /** Eventos em destaque + proximos (para hero da home) */
  async listFeatured() {
    const cacheKey = 'events:featured:v2';
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const featuredCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const select = {
      id: true, name: true, description: true, bannerUrl: true,
      startAt: true, status: true, sport: true, featured: true,
    } as const;

    const categorySelect = {
      id: true, name: true, description: true, bannerUrl: true,
      scheduledAt: true, status: true, featured: true,
    } as const;

    const [eventFeat, categoryFeat, armageddonFeat] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          featured: true,
          status: { in: [EventStatus.SCHEDULED, EventStatus.LIVE] },
          startAt: { gte: featuredCutoff },
        },
        orderBy: { startAt: 'asc' },
        select,
      }),
      this.prisma.categoryEvent.findMany({
        where: {
          featured: true,
          status: { not: CategoryEventStatus.CANCELED },
          eventId: null,
          scheduledAt: { gte: featuredCutoff },
        },
        orderBy: { scheduledAt: 'asc' },
        select: categorySelect,
      }),
      this.prisma.armageddonEvent.findMany({
        where: {
          featured: true,
          status: { not: ArmageddonStatus.CANCELED },
          scheduledAt: { gte: featuredCutoff },
        },
        orderBy: { scheduledAt: 'asc' },
        select: { ...categorySelect, eventId: true },
      }),
    ]);

    // Exclui os Event vinculados a Armageddon (evita card duplicado no destaque).
    const armaFeatLinkedIds = new Set(
      armageddonFeat.map((a) => a.eventId).filter((id): id is string => !!id),
    );

    const featured: FeaturedEvent[] = [
      ...eventFeat.filter((e) => !armaFeatLinkedIds.has(e.id)).map((e) => ({ ...e, featured: true })),
      ...categoryFeat.map((e) => this.mapCategoryFeatured(e)),
      ...armageddonFeat.map((e) => this.mapArmageddonFeatured(e)),
    ]
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      .slice(0, 5);

    if (featured.length >= 3) {
      await this.cache.set(cacheKey, featured, 30);
      return featured;
    }

    // Completa com proximos eventos (limit 3 + featured)
    const [eventUp, categoryUp, armageddonUp] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          featured: false,
          status: { in: [EventStatus.SCHEDULED, EventStatus.LIVE] },
          startAt: { gte: now },
        },
        orderBy: { startAt: 'asc' },
        take: 3,
        select,
      }),
      this.prisma.categoryEvent.findMany({
        where: {
          featured: false,
          status: { not: CategoryEventStatus.CANCELED },
          eventId: null,
          scheduledAt: { gte: now },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 3,
        select: categorySelect,
      }),
      this.prisma.armageddonEvent.findMany({
        where: {
          featured: false,
          status: { not: ArmageddonStatus.CANCELED },
          scheduledAt: { gte: now },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 3,
        select: { ...categorySelect, eventId: true },
      }),
    ]);

    const armaUpLinkedIds = new Set(
      armageddonUp.map((a) => a.eventId).filter((id): id is string => !!id),
    );

    const upcoming: FeaturedEvent[] = [
      ...eventUp.filter((e) => !armaUpLinkedIds.has(e.id)).map((e) => ({ ...e, featured: false })),
      ...categoryUp.map((e) => this.mapCategoryFeatured(e)),
      ...armageddonUp.map((e) => this.mapArmageddonFeatured(e)),
    ].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    const combined = [...featured, ...upcoming].slice(0, 5);
    await this.cache.set(cacheKey, combined, 30);
    return combined;
  }

  private mapCategoryFeatured(e: {
    id: string;
    name: string;
    description: string | null;
    bannerUrl: string | null;
    scheduledAt: Date;
    status: CategoryEventStatus;
    featured: boolean;
  }): FeaturedEvent {
    return {
      id: `category:${e.id}`,
      name: e.name,
      description: e.description,
      bannerUrl: e.bannerUrl,
      startAt: e.scheduledAt,
      status: this.mapCategoryStatus(e.status),
      sport: 'COPA_CATEGORIAS',
      featured: e.featured,
    };
  }

  private mapArmageddonFeatured(e: {
    id: string;
    name: string;
    description: string | null;
    bannerUrl: string | null;
    scheduledAt: Date;
    status: ArmageddonStatus;
    featured: boolean;
  }): FeaturedEvent {
    return {
      id: `armageddon:${e.id}`,
      name: e.name,
      description: e.description,
      bannerUrl: e.bannerUrl,
      startAt: e.scheduledAt,
      status: this.mapArmageddonStatus(e.status),
      sport: 'ARMAGEDDON',
      featured: e.featured,
    };
  }

  private mapCategoryStatus(status: CategoryEventStatus): string {
    switch (status) {
      case CategoryEventStatus.IN_PROGRESS:
        return 'LIVE';
      case CategoryEventStatus.FINISHED:
        return 'FINISHED';
      case CategoryEventStatus.CANCELED:
        return 'CANCELED';
      default:
        return 'SCHEDULED';
    }
  }

  private mapArmageddonStatus(status: ArmageddonStatus): string {
    switch (status) {
      case ArmageddonStatus.IN_PROGRESS:
        return 'LIVE';
      case ArmageddonStatus.FINISHED:
        return 'FINISHED';
      case ArmageddonStatus.CANCELED:
        return 'CANCELED';
      default:
        return 'SCHEDULED';
    }
  }
}
