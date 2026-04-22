import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './database/prisma.module';
import { EventsModule } from './events/events.module';
import { MailModule } from './mail/mail.module';
import { PaymentsModule } from './payments/payments.module';
import { QueueModule } from './queue/queue.module';
import { TokensModule } from './tokens/tokens.module';
import { MarketGateway } from './market.gateway';
import { MarketService } from './market.service';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    CacheModule,
    QueueModule,
    TokensModule,
    MailModule,
    AuthModule,
    EventsModule,
    AdminModule,
    PaymentsModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
  ],
  controllers: [AppController],
  providers: [
    MarketService,
    MarketGateway,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
