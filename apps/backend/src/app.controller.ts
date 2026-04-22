import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EmailVerifiedGuard } from './auth/email-verified.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './common/decorators/current-user.decorator';
import { MarketService } from './market.service';
import { MultiRunnerMarketService } from './multi-runner-market.service';

@Controller()
export class AppController {
  constructor(
    private readonly marketService: MarketService,
    private readonly multiRunnerService: MultiRunnerMarketService,
  ) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: '201bet-backend',
      now: new Date().toISOString(),
    };
  }

  // ── Duel endpoints (existing) ──

  @Get('market/snapshot')
  getSnapshot(@Query('duelId') duelId?: string) {
    return this.marketService.getMarketSnapshot(duelId);
  }

  @Get('market/board')
  getBoard() {
    return this.marketService.getBettingBoard();
  }

  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('market/bet')
  async placeBet(
    @CurrentUser() user: { userId: string },
    @Body()
    payload: { duelId?: string; side?: 'LEFT' | 'RIGHT'; amount?: number },
  ) {
    if (!payload.duelId || !payload.side || !payload.amount) {
      throw new BadRequestException('duelId, side e amount são obrigatórios');
    }

    try {
      return await this.marketService.placeBet({
        userId: user.userId,
        duelId: payload.duelId,
        side: payload.side,
        amount: payload.amount,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Falha ao registrar aposta',
      );
    }
  }

  // ── Config (public read) ──

  @Get('market/config')
  getConfig() {
    return {
      marginPercent: Number(process.env.MARKET_MARGIN_PERCENT ?? '20'),
      minBetAmount: Number(process.env.MIN_BET_AMOUNT ?? '10'),
    };
  }

  // ── Real-time profit (reads from snapshots, no settlement needed) ──

  @Get('market/profit-live')
  getLiveProfit() {
    const duelSnapshots = this.marketService.getAllSnapshots();
    const mrSnapshots = this.multiRunnerService.getAllSnapshots();
    const marginPercent = Number(process.env.MARKET_MARGIN_PERCENT ?? '20');

    let totalVolume = 0;
    let totalRake = 0;
    const markets: Array<{ name: string; type: string; pool: number; rake: number }> = [];

    for (const s of duelSnapshots) {
      const rake = s.totalPool * (marginPercent / 100);
      totalVolume += s.totalPool;
      totalRake += rake;
      markets.push({ name: `${s.stageLabel} - ${s.eventName}`, type: 'DUEL', pool: s.totalPool, rake });
    }

    for (const s of mrSnapshots) {
      const rake = s.totalPool * (s.rakePercent / 100);
      totalVolume += s.totalPool;
      totalRake += rake;
      markets.push({ name: s.marketName, type: s.marketType, pool: s.totalPool, rake });
    }

    return { totalVolume, totalRake, markets };
  }

  // ── Multi-Runner endpoints ──

  @Get('market/multi-runner/snapshots')
  getMultiRunnerSnapshots() {
    return this.multiRunnerService.getAllSnapshots();
  }

  @Get('market/multi-runner/snapshot')
  getMultiRunnerSnapshot(@Query('marketId') marketId?: string) {
    if (!marketId) {
      throw new BadRequestException('marketId é obrigatório');
    }
    return this.multiRunnerService.getSnapshot(marketId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('market/multi-runner/bet')
  async placeMultiRunnerBet(
    @CurrentUser() user: { userId: string },
    @Body() payload: { marketId?: string; oddId?: string; amount?: number },
  ) {
    if (!payload.marketId || !payload.oddId || !payload.amount) {
      throw new BadRequestException('marketId, oddId e amount são obrigatórios');
    }

    try {
      return await this.multiRunnerService.placeBet({
        userId: user.userId,
        marketId: payload.marketId,
        oddId: payload.oddId,
        amount: payload.amount,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Falha ao registrar aposta');
    }
  }
}
