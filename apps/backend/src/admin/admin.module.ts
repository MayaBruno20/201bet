import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { SettlementService } from '../settlement.service';
import { MultiRunnerMarketService } from '../multi-runner-market.service';
import { MarketService } from '../market.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, RolesGuard, SettlementService, MultiRunnerMarketService, MarketService],
})
export class AdminModule {}
