import { Module } from '@nestjs/common';
import { BrazilListsController } from './brazil-lists.controller';
import {
  BrazilListEventsAdminController,
  BrazilListsAdminController,
} from './brazil-lists.admin.controller';
import { BrazilListsService } from './brazil-lists.service';
import { EventLifecycleService } from './event-lifecycle.service';
import { RosterParserService } from './roster-parser.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { SettlementService } from '../settlement.service';

@Module({
  controllers: [
    BrazilListsController,
    BrazilListsAdminController,
    BrazilListEventsAdminController,
  ],
  providers: [
    BrazilListsService,
    EventLifecycleService,
    RosterParserService,
    RolesGuard,
    SettlementService,
  ],
  exports: [BrazilListsService],
})
export class BrazilListsModule {}
