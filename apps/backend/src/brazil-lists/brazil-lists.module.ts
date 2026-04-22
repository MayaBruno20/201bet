import { Module } from '@nestjs/common';
import { BrazilListsController } from './brazil-lists.controller';
import {
  BrazilListEventsAdminController,
  BrazilListsAdminController,
} from './brazil-lists.admin.controller';
import { BrazilListsService } from './brazil-lists.service';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  controllers: [
    BrazilListsController,
    BrazilListsAdminController,
    BrazilListEventsAdminController,
  ],
  providers: [BrazilListsService, RolesGuard],
  exports: [BrazilListsService],
})
export class BrazilListsModule {}
