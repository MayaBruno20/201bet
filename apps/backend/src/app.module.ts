import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './database/prisma.module';
import { EventsModule } from './events/events.module';
import { MarketGateway } from './market.gateway';
import { MarketService } from './market.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    EventsModule,
    AdminModule,
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
