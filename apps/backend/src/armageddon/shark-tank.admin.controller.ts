import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ArmageddonBracketType, UserRole } from '@prisma/client';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ArmageddonService } from './armageddon.service';
import {
  CreateArmageddonEventDto,
  UpdateArmageddonEventDto,
} from './dto/armageddon-event.dto';
import { UpsertArmageddonRosterDto } from './dto/armageddon-roster.dto';
import { SettleArmageddonMatchupDto } from './dto/armageddon-matchup.dto';
import { SetChallengeOpponentDto } from './dto/shark-tank-challenge.dto';

type ReqUser = Request & { user?: { userId?: string; role?: UserRole } };

/**
 * Módulo admin do Shark Tank (hub separado). Reusa o ArmageddonService por baixo
 * (bracketType SHARK_TANK): 4 chaves de 8 → Fase Final (finalista x Top 20 da Lista).
 */
@Controller('admin/shark-tank')
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SharkTankAdminController {
  constructor(private readonly service: ArmageddonService) {}

  @Get()
  listAll() {
    return this.service.adminListSharkTank();
  }

  // Rota estática antes de :id.
  @Get('drivers/search')
  searchDrivers(@Query('q') q: string) {
    return this.service.adminSearchDrivers(q ?? '');
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.adminGetById(id);
  }

  @Post()
  create(@Body() dto: CreateArmageddonEventDto, @Req() req: ReqUser) {
    // Força o tipo — este módulo só cria eventos Shark Tank.
    return this.service.adminCreate(
      { ...dto, bracketType: ArmageddonBracketType.SHARK_TANK },
      this.audit(req),
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArmageddonEventDto, @Req() req: ReqUser) {
    return this.service.adminUpdate(id, dto, this.audit(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminDelete(id, this.audit(req));
  }

  // ── Roster (chaves A-D de 8) ──
  @Post(':id/roster')
  upsertRoster(
    @Param('id') id: string,
    @Body() dto: UpsertArmageddonRosterDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminUpsertRoster(id, dto, this.audit(req));
  }

  @Delete(':id/roster')
  clearRoster(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminClearRoster(id, this.audit(req));
  }

  @Delete(':id/roster/:rosterId')
  removeRoster(
    @Param('id') id: string,
    @Param('rosterId') rosterId: string,
    @Req() req: ReqUser,
  ) {
    return this.service.adminRemoveRoster(id, rosterId, this.audit(req));
  }

  // ── Chaveamento ──
  @Post(':id/generate')
  generate(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminGenerateSharkTankBracket(id, this.audit(req));
  }

  @Post(':id/clear-keys')
  clearKeys(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminClearKeys(id, this.audit(req));
  }

  @Post(':id/reset')
  resetEvent(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminResetEvent(id, this.audit(req));
  }

  @Get(':id/financial-summary')
  financialSummary(@Param('id') id: string) {
    return this.service.adminGetFinancialSummary(id);
  }

  // ── Modo Pista: AUDITOR/OPERATOR abrem/fecham/auditam ──
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
  @Post(':id/open-all-ready')
  openAllReady(
    @Param('id') id: string,
    @Query('bracketKey') bracketKey: string | undefined,
    @Query('roundNumber') roundNumber: string | undefined,
    @Query('stage') stage: string | undefined,
    @Req() req: ReqUser,
  ) {
    return this.service.adminOpenAllReady(id, this.audit(req), {
      bracketKey: bracketKey || undefined,
      roundNumber: roundNumber ? Number(roundNumber) : undefined,
      stage: (stage as 'FIRST_DRAW' | 'SECOND_DRAW') || undefined,
    });
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
  @Post(':id/close-all-open')
  closeAllOpen(
    @Param('id') id: string,
    @Query('bracketKey') bracketKey: string | undefined,
    @Query('roundNumber') roundNumber: string | undefined,
    @Query('stage') stage: string | undefined,
    @Req() req: ReqUser,
  ) {
    return this.service.adminCloseAllOpen(id, this.audit(req), {
      bracketKey: bracketKey || undefined,
      roundNumber: roundNumber ? Number(roundNumber) : undefined,
      stage: (stage as 'FIRST_DRAW' | 'SECOND_DRAW') || undefined,
    });
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
  @Patch('matchups/:matchupId/market')
  toggleMarket(
    @Param('matchupId') matchupId: string,
    @Body() dto: { open: boolean },
    @Req() req: ReqUser,
  ) {
    return this.service.adminToggleMatchupMarket(matchupId, !!dto.open, this.audit(req));
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
  @Post('matchups/:matchupId/settle')
  settle(
    @Param('matchupId') matchupId: string,
    @Body() dto: SettleArmageddonMatchupDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminSettleMatchup(matchupId, dto, this.audit(req));
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
  @Post('matchups/:matchupId/reopen')
  reopen(@Param('matchupId') matchupId: string, @Req() req: ReqUser) {
    return this.service.reopenSettledMatchup(matchupId, this.audit(req));
  }

  // Fase Final: admin define o rival (Top 20 da Lista) de cada desafio.
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch('matchups/:matchupId/opponent')
  setChallengeOpponent(
    @Param('matchupId') matchupId: string,
    @Body() dto: SetChallengeOpponentDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminSetChallengeOpponent(matchupId, dto, this.audit(req));
  }

  @Delete('matchups/:matchupId')
  deleteMatchup(@Param('matchupId') matchupId: string, @Req() req: ReqUser) {
    return this.service.adminDeleteMatchup(matchupId, this.audit(req));
  }

  private audit(req: ReqUser) {
    return {
      actorUserId: req.user?.userId,
      actorRole: req.user?.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }
}
