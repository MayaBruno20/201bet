import { Module } from '@nestjs/common';
import { CategoryEventsService } from './category-events.service';
import { CategoryEventsAdminController } from './category-events.controller';
import { RolesGuard } from '../common/guards/roles.guard';
import { SettlementService } from '../settlement.service';

@Module({
  controllers: [CategoryEventsAdminController],
  providers: [CategoryEventsService, RolesGuard, SettlementService],
  exports: [CategoryEventsService],
})
export class CategoryEventsModule {}
