import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ListasBrasilSyncService } from './listas-brasil-sync.service';

@Controller('admin/integrations/listas-brasil')
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ListasBrasilAdminController {
  constructor(private readonly sync: ListasBrasilSyncService) {}

  @Get('status')
  status() {
    return this.sync.getStatus();
  }

  @Post('sync')
  triggerSync() {
    return this.sync.trigger();
  }
}
