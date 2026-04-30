import { Injectable } from '@nestjs/common';
import { ArmageddonStatus, CategoryEventStatus, EventStatus } from '@prisma/client';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../database/prisma.service';

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
    const cacheKey = 'events:public:v2';
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) {
      return cached as PublicEvent[];
    }

    const [events, categoryEvents, armageddonEvents] = await Promise.all([
      this.prisma.event.findMany({
        orderBy: { startAt: 'asc' },
        include: {
          markets: {
            orderBy: { createdAt: 'asc' },
            include: { odds: { orderBy: { createdAt: 'asc' } } },
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
          status: { not: CategoryEventStatus.CANCELED },
          eventId: null,
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      this.prisma.armageddonEvent.findMany({
        where: {
          status: { not: ArmageddonStatus.CANCELED },
          eventId: null,
        },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    const fromEvent: PublicEvent[] = events.map((event) => ({
      id: event.id,
      sport: event.sport,
      name: event.name,
      description: event.description,
      bannerUrl: event.bannerUrl,
      featured: event.featured,
      startAt: event.startAt,
      status: event.status,
      markets: event.markets.map((market) => ({
        id: market.id,
        name: market.name,
        status: market.status,
        odds: market.odds.map((odd) => ({
          id: odd.id,
          label: odd.label,
          value: Number(odd.value),
          status: odd.status,
          version: odd.version,
        })),
      })),
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

    const payload = [...fromEvent, ...fromCategory, ...fromArmageddon].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );

    await this.cache.set(cacheKey, payload, 15);
    return payload;
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
          eventId: null,
          scheduledAt: { gte: featuredCutoff },
        },
        orderBy: { scheduledAt: 'asc' },
        select: categorySelect,
      }),
    ]);

    const featured: FeaturedEvent[] = [
      ...eventFeat.map((e) => ({ ...e, featured: true })),
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
          eventId: null,
          scheduledAt: { gte: now },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 3,
        select: categorySelect,
      }),
    ]);

    const upcoming: FeaturedEvent[] = [
      ...eventUp.map((e) => ({ ...e, featured: false })),
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
