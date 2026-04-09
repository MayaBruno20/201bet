import { Injectable, Logger } from '@nestjs/common';
import { Redis } from '@upstash/redis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis | null = null;
  private readonly enabled: boolean;

  constructor() {
    this.enabled = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    if (!this.enabled) {
      this.logger.warn('Cache disabled: UPSTASH_REDIS_REST_URL/TOKEN não configurados.');
    }
  }

  private getClient() {
    if (!this.enabled) return null;
    if (!this.client) {
      this.client = Redis.fromEnv();
    }
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    const client = this.getClient();
    if (!client) return null;
    const data = await client.get<T>(key);
    return data ?? null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    if (ttlSeconds) {
      await client.set(key, value, { ex: ttlSeconds });
      return;
    }
    await client.set(key, value);
  }

  async del(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    await client.del(key);
  }
}
