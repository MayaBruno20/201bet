import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { AppEnv } from '../config/env.validation';

const DAY_TTL_SECONDS = 26 * 3600;

export interface RateLimitDecision {
  allowed: boolean;
  current: number;
  limit: number;
  retryAtUtc: Date;
}

@Injectable()
export class DailyRateLimiter implements OnModuleDestroy {
  private readonly logger = new Logger(DailyRateLimiter.name);
  private readonly limit: number;
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.limit = this.config.get('EMAIL_DAILY_LIMIT', { infer: true });
  }

  onModuleDestroy(): void {
    this.client?.disconnect();
  }

  async consume(): Promise<RateLimitDecision> {
    const client = this.getClient();
    const key = this.todayKey();
    const retryAtUtc = this.nextUtcMidnight();

    const current = await client.incr(key);
    if (current === 1) {
      await client.expire(key, DAY_TTL_SECONDS);
    }

    if (current > this.limit) {
      await client.decr(key);
      return {
        allowed: false,
        current: current - 1,
        limit: this.limit,
        retryAtUtc,
      };
    }

    if (current > this.limit * 0.9) {
      this.logger.warn(
        `Daily email rate approaching limit: ${current}/${this.limit}`,
      );
    }

    return { allowed: true, current, limit: this.limit, retryAtUtc };
  }

  async peek(): Promise<number> {
    const client = this.getClient();
    const raw = await client.get(this.todayKey());
    return raw ? Number(raw) : 0;
  }

  private getClient(): Redis {
    if (this.client) return this.client;
    this.client = new Redis({
      host: this.config.get('REDIS_HOST', { infer: true }),
      port: this.config.get('REDIS_PORT', { infer: true }),
      password: this.config.get('REDIS_PASSWORD', { infer: true }) || undefined,
      tls:
        this.config.get('REDIS_TLS', { infer: true }) === 'true' ? {} : undefined,
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.client.on('error', (err) => {
      this.logger.error(`Redis error on rate limiter: ${err.message}`);
    });
    return this.client;
  }

  private todayKey(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `email:daily:${y}-${m}-${d}`;
  }

  private nextUtcMidnight(): Date {
    const now = new Date();
    const next = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0,
      ),
    );
    return next;
  }
}
