import { Injectable, Logger } from '@nestjs/common';
import { Redis } from '@upstash/redis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis | null = null;
  private readonly enabled: boolean;
  private runtimeDisabled = false;

  constructor() {
    this.enabled = this.hasValidConfig();
    if (!this.enabled) {
      this.logger.warn(
        'Cache disabled: configuração do Upstash ausente ou inválida. A aplicação seguirá sem cache.',
      );
    }
  }

  private hasValidConfig() {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

    if (!url || !token) return false;
    if (
      url.includes('<') ||
      url.includes('>') ||
      token.includes('<') ||
      token.includes('>')
    )
      return false;

    try {
      const parsed = new URL(url);
      return (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        token.length > 0
      );
    } catch {
      return false;
    }
  }

  private getClient() {
    if (!this.enabled || this.runtimeDisabled) return null;
    if (!this.client) {
      this.client = Redis.fromEnv();
    }
    return this.client;
  }

  private disableAfterFailure(error: unknown) {
    if (this.runtimeDisabled) return;
    this.runtimeDisabled = true;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Cache disabled after Redis failure: ${message}`);
  }

  async get<T>(key: string): Promise<T | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      const data = await client.get<T>(key);
      return data ?? null;
    } catch (error) {
      this.disableAfterFailure(error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    try {
      if (ttlSeconds) {
        await client.set(key, value, { ex: ttlSeconds });
        return;
      }
      await client.set(key, value);
    } catch (error) {
      this.disableAfterFailure(error);
    }
  }

  async del(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    try {
      await client.del(key);
    } catch (error) {
      this.disableAfterFailure(error);
    }
  }
}
