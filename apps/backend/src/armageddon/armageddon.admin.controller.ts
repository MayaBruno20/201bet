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
import { UserRole } from '@prisma/client';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ArmageddonService } from './armageddon.service';
import {
  CreateArmageddonEventDto,
  UpdateArmageddonEventDto,
} from './dto/armageddon-event.dto';
import {
  ImportRosterFromListsDto,
  UpsertArmageddonRosterDto,
} from './dto/armageddon-roster.dto';
import {
  GenerateArmageddonMatchupsDto,
  SaveSecondDrawLayoutDto,
  SettleArmageddonMatchupDto,
} from './dto/armageddon-matchup.dto';
import { CreateArmageddonMultiMarketDto } from './dto/armageddon-multi-market.dto';

type ReqUser = Request & { user?: { userId?: string; role?: UserRole } };

@Controller('admin/armageddon')
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ArmageddonAdminController {
  constructor(private readonly service: ArmageddonService) {}

  @Get()
  listAll() {
    return this.service.adminListAll();
  }

  // Antes de :id para a rota estática não ser capturada pelo param.
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
    return this.service.adminCreate(dto, this.audit(req));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArmageddonEventDto, @Req() req: ReqUser) {
    return this.service.adminUpdate(id, dto, this.audit(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminDelete(id, this.audit(req));
  }

  // ── Roster ──
  @Post(':id/roster/import-from-lists')
  importFromLists(
    @Param('id') id: string,
    @Body() dto: ImportRosterFromListsDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminImportFromLists(id, dto, this.audit(req));
  }

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

  // ── Matchups ──
  @Post(':id/generate-matchups')
  generate(
    @Param('id') id: string,
    @Body() dto: GenerateArmageddonMatchupsDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminGenerateMatchups(id, dto, this.audit(req));
  }

  // ── Eliminação 144 (5 chaves → Top 32 → campeão + 3º lugar) ──
  @Post(':id/generate-first-draw')
  generateFirstDraw(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminGenerateFirstDraw(id, this.audit(req));
  }

  @Post(':id/generate-second-draw')
  generateSecondDraw(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminGenerateSecondDraw(id, this.audit(req));
  }

  @Post(':id/clear-keys')
  clearKeys(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminClearKeys(id, this.audit(req));
  }

  @Post(':id/reset')
  resetEvent(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminResetEvent(id, this.audit(req));
  }

  @Post(':id/second-draw-layout')
  saveSecondDrawLayout(
    @Param('id') id: string,
    @Body() dto: SaveSecondDrawLayoutDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminSaveSecondDrawLayout(id, dto, this.audit(req));
  }

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

  @Get(':id/financial-summary')
  financialSummary(@Param('id') id: string) {
    return this.service.adminGetFinancialSummary(id);
  }

  // ── Multi-mercados (campeão / reação / queimada) ──

  @Get(':id/markets')
  listMultiMarkets(@Param('id') id: string) {
    return this.service.adminListMultiMarkets(id);
  }

  @Post(':id/markets')
  createMultiMarket(
    @Param('id') id: string,
    @Body() dto: CreateArmageddonMultiMarketDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminCreateMultiMarket(id, dto, this.audit(req));
  }

  /** Reapura manualmente os mercados de classificados (resorteio) — fallback do auto-settle do 2º sorteio. */
  @Post(':id/settle-qualify')
  settleQualify(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.settleQualifyMarketsForEvent(id, this.audit(req));
  }

  // Modo Pista: AUDITOR/OPERATOR auditam e abrem/fecham mercados da cabeceira.
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

  /** Reabre uma bateria já auditada, revertendo o avanço de chave EM CASCATA
   *  (estorna as apostas das baterias seguintes). Modo Pista. */
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
  @Post('matchups/:matchupId/reopen')
  reopen(@Param('matchupId') matchupId: string, @Req() req: ReqUser) {
    return this.service.reopenSettledMatchup(matchupId, this.audit(req));
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
