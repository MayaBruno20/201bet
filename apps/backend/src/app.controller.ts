import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './common/decorators/current-user.decorator';
import { MarketService } from './market.service';

@Controller()
export class AppController {
  constructor(private readonly marketService: MarketService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: '201bet-backend',
      now: new Date().toISOString(),
    };
  }

  @Get('market/snapshot')
  getSnapshot(@Query('duelId') duelId?: string) {
    return this.marketService.getMarketSnapshot(duelId);
  }

  @Get('market/board')
  getBoard() {
    return this.marketService.getBettingBoard();
  }

  @UseGuards(JwtAuthGuard)
  @Post('market/bet')
  placeBet(
    @CurrentUser() user: { userId: string },
    @Body() payload: { duelId?: string; side?: 'LEFT' | 'RIGHT'; amount?: number },
  ) {
    if (!payload.duelId || !payload.side || !payload.amount) {
      throw new BadRequestException('duelId, side e amount são obrigatórios');
    }

    try {
      return this.marketService.placeBet({
        userId: user.userId,
        duelId: payload.duelId,
        side: payload.side,
        amount: payload.amount,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Falha ao registrar aposta');
    }
  }
}
