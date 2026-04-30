import { Injectable } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async listEvents() {
    const cacheKey = 'events:public:v1';
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) {
      return cached as any;
    }

    const events = await this.prisma.event.findMany({
      orderBy: { startAt: 'asc' },
      include: {
        markets: {
          orderBy: { createdAt: 'asc' },
          include: {
            odds: {
              orderBy: { createdAt: 'asc' },
            },
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
    });

    const payload = events.map((event) => ({
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

    await this.cache.set(cacheKey, payload, 15);
    return payload;
  }

  /** Eventos em destaque + proximos (para hero da home) */
  async listFeatured() {
    const cacheKey = 'events:featured:v1';
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    // Prioriza featured ativos. Se nao houver suficientes, completa com proximos eventos.
    const featured = await this.prisma.event.findMany({
      where: {
        featured: true,
        status: { in: ['SCHEDULED', 'LIVE'] },
        startAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // permite eventos comecando ate 24h atras
      },
      orderBy: { startAt: 'asc' },
      take: 5,
      select: {
        id: true, name: true, description: true, bannerUrl: true,
        startAt: true, status: true, sport: true, featured: true,
      },
    });

    if (featured.length >= 3) {
      await this.cache.set(cacheKey, featured, 30);
      return featured;
    }

    // Completa com proximos eventos (limit 3 + featured)
    const upcoming = await this.prisma.event.findMany({
      where: {
        featured: false,
        status: { in: ['SCHEDULED', 'LIVE'] },
        startAt: { gte: now },
      },
      orderBy: { startAt: 'asc' },
      take: 3,
      select: {
        id: true, name: true, description: true, bannerUrl: true,
        startAt: true, status: true, sport: true, featured: true,
      },
    });

    const combined = [...featured, ...upcoming].slice(0, 5);
    await this.cache.set(cacheKey, combined, 30);
    return combined;
  }
}
