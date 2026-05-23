import { Controller, Get } from '@nestjs/common';
import { CustomDuelService } from './custom-duel.service';

/**
 * Rotas públicas (sem auth) para embates personalizados. Hoje só serve a faixa
 * "Embates em Destaque" no topo de /apostas. Mantida separada do controller
 * admin pra não passar pelo AdminJwtAuthGuard.
 */
@Controller('custom-duels')
export class CustomDuelsPublicController {
  constructor(private readonly customDuels: CustomDuelService) {}

  @Get('featured')
  listFeatured() {
    return this.customDuels.listFeaturedPublic();
  }
}
