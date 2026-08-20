import { Module } from '@nestjs/common';
import { ListasBrasilApiClient } from './listas-brasil-api.client';
import { ListasBrasilSyncService } from './listas-brasil-sync.service';
import { ListasBrasilAdminController } from './listas-brasil.admin.controller';

/**
 * Integração com a API oficial do Listas Brasil (sync read-only de
 * pilotos/listas/eventos). Cron via setInterval no OnModuleInit do service.
 */
@Module({
  controllers: [ListasBrasilAdminController],
  providers: [ListasBrasilApiClient, ListasBrasilSyncService],
  exports: [ListasBrasilSyncService],
})
export class ListasBrasilModule {}
