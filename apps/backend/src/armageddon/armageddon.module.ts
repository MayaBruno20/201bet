import { Module } from '@nestjs/common';
import { ArmageddonController } from './armageddon.controller';
import { ArmageddonAdminController } from './armageddon.admin.controller';
import { ArmageddonService } from './armageddon.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { SettlementService } from '../settlement.service';

@Module({
  controllers: [ArmageddonController, ArmageddonAdminController],
  providers: [ArmageddonService, RolesGuard, SettlementService],
  exports: [ArmageddonService],
})
export class ArmageddonModule {}
