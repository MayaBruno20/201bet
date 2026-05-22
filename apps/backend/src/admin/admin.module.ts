import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { QuickDuelService } from './quick-duel.service';
import { CustomDuelService } from './custom-duel.service';
import { CustomDuelsPublicController } from './custom-duel.public.controller';
import { RolesGuard } from '../common/guards/roles.guard';
import { SettlementService } from '../settlement.service';
import { MultiRunnerMarketService } from '../multi-runner-market.service';
import { MarketService } from '../market.service';

@Module({
  controllers: [AdminController, CustomDuelsPublicController],
  providers: [
    AdminService,
    QuickDuelService,
    CustomDuelService,
    RolesGuard,
    SettlementService,
    MultiRunnerMarketService,
    MarketService,
  ],
})
export class AdminModule {}
