import { Module } from '@nestjs/common';
import { ArmageddonController } from './armageddon.controller';
import { ArmageddonAdminController } from './armageddon.admin.controller';
import { SharkTankController } from './shark-tank.controller';
import { SharkTankAdminController } from './shark-tank.admin.controller';
import { ArmageddonService } from './armageddon.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { SettlementService } from '../settlement.service';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [CacheModule],
  controllers: [
    ArmageddonController,
    ArmageddonAdminController,
    SharkTankController,
    SharkTankAdminController,
  ],
  providers: [ArmageddonService, RolesGuard, SettlementService],
  exports: [ArmageddonService],
})
export class ArmageddonModule {}
