import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CategoryEventsService } from './category-events.service';
import { CreateCategoryEventDto } from './dto/create-category-event.dto';
import { UpdateCategoryEventDto } from './dto/update-category-event.dto';
import { CreateBracketDto, SaveBracketLayoutDto, SettleCategoryMatchupDto, UpdateCompetitorDto, UpsertCompetitorDto } from './dto/bracket.dto';

type ReqUser = Request & { user?: { userId?: string } };

@Controller('category-events')
export class CategoryEventsPublicController {
  constructor(private readonly svc: CategoryEventsService) {}

  @Get()
  list() {
    return this.svc.listPublic();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getPublic(id);
  }
}

@Controller('admin/category-events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
export class CategoryEventsAdminController {
  constructor(private readonly svc: CategoryEventsService) {}

  // Events
  @Get()
  list() { return this.svc.adminList(); }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.adminGet(id); }

  @Post()
  create(@Body() dto: CreateCategoryEventDto, @Req() req: ReqUser) {
    return this.svc.adminCreateEvent(dto, this.audit(req));
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryEventDto, @Req() req: ReqUser) {
    return this.svc.adminUpdateEvent(id, dto, this.audit(req));
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.svc.adminDeleteEvent(id, this.audit(req));
  }

  // Brackets
  @Post(':id/brackets')
  createBracket(@Param('id', ParseUUIDPipe) eventId: string, @Body() dto: CreateBracketDto, @Req() req: ReqUser) {
    return this.svc.adminCreateBracket(eventId, dto, this.audit(req));
  }

  @Delete('brackets/:bracketId')
  deleteBracket(@Param('bracketId', ParseUUIDPipe) bracketId: string, @Req() req: ReqUser) {
    return this.svc.adminDeleteBracket(bracketId, this.audit(req));
  }

  @Patch('brackets/:bracketId/size')
  updateBracketSize(@Param('bracketId', ParseUUIDPipe) bracketId: string, @Body() body: { size: number }, @Req() req: ReqUser) {
    return this.svc.adminUpdateBracketSize(bracketId, body.size, this.audit(req));
  }

  // Competitors
  @Post('brackets/:bracketId/competitors')
  upsertCompetitor(@Param('bracketId', ParseUUIDPipe) bracketId: string, @Body() dto: UpsertCompetitorDto, @Req() req: ReqUser) {
    return this.svc.adminUpsertCompetitor(bracketId, dto, this.audit(req));
  }

  @Patch('competitors/:competitorId')
  updateCompetitor(@Param('competitorId', ParseUUIDPipe) competitorId: string, @Body() dto: UpdateCompetitorDto, @Req() req: ReqUser) {
    return this.svc.adminUpdateCompetitor(competitorId, dto, this.audit(req));
  }

  @Delete('competitors/:competitorId')
  deleteCompetitor(@Param('competitorId', ParseUUIDPipe) competitorId: string, @Req() req: ReqUser) {
    return this.svc.adminRemoveCompetitor(competitorId, this.audit(req));
  }

  // Bracket layout (drag-and-drop save)
  @Post('brackets/:bracketId/layout')
  saveLayout(@Param('bracketId', ParseUUIDPipe) bracketId: string, @Body() dto: SaveBracketLayoutDto, @Req() req: ReqUser) {
    return this.svc.adminSaveBracketLayout(bracketId, dto, this.audit(req));
  }

  // Toggle market (abre/fecha apostas para o matchup)
  @Patch('matchups/:matchupId/market')
  toggleMarket(@Param('matchupId', ParseUUIDPipe) matchupId: string, @Body() body: { open: boolean }, @Req() req: ReqUser) {
    return this.svc.adminToggleMatchupMarket(matchupId, !!body.open, this.audit(req));
  }

  // Settle matchup
  @Post('matchups/:matchupId/settle')
  settle(@Param('matchupId', ParseUUIDPipe) matchupId: string, @Body() dto: SettleCategoryMatchupDto, @Req() req: ReqUser) {
    return this.svc.adminSettleMatchup(matchupId, dto, this.audit(req));
  }

  private audit(req: ReqUser) {
    return {
      actorUserId: req.user?.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }
}
