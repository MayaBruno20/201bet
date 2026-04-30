import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env.validation';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        connection: {
          host: config.get('REDIS_HOST', { infer: true }),
          port: config.get('REDIS_PORT', { infer: true }),
          username:
            config.get('REDIS_USERNAME', { infer: true }) || 'default',
          password: config.get('REDIS_PASSWORD', { infer: true }) || undefined,
          tls:
            config.get('REDIS_TLS', { infer: true }) === 'true'
              ? {}
              : undefined,
          // Render/RedisCloud: evitar race com enableOfflineQueue=false.
          // Conecte imediatamente para que os primeiros comandos (AUTH/INFO) não falhem.
          lazyConnect: false,
          enableOfflineQueue: false,
          maxRetriesPerRequest: null,
        },
        skipWaitingForReady: true,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 60_000,
          },
          removeOnComplete: { count: 1000, age: 24 * 3600 },
          removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
