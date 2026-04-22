import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BrazilListsService } from './brazil-lists.service';
import { CreateBrazilListDto } from './dto/create-brazil-list.dto';
import { UpdateBrazilListDto } from './dto/update-brazil-list.dto';
import { UpsertRosterEntryDto } from './dto/upsert-roster.dto';
import { CreateListEventDto } from './dto/create-list-event.dto';
import { UpdateListEventDto } from './dto/update-list-event.dto';
import { GenerateMatchupsDto } from './dto/generate-matchups.dto';
import {
  SettleMatchupDto,
  UpdateMatchupDto,
  UpsertMatchupDto,
} from './dto/upsert-matchup.dto';
import {
  CreateSharkTankEntryDto,
  UpdateSharkTankEntryDto,
} from './dto/shark-tank.dto';

type ReqUser = Request & { user?: { userId?: string; role?: UserRole } };

@Controller('admin/brazil-lists')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class BrazilListsAdminController {
  constructor(private readonly service: BrazilListsService) {}

  @Get()
  listAll() {
    return this.service.adminListAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.adminGetById(id);
  }

  @Post()
  create(@Body() dto: CreateBrazilListDto, @Req() req: ReqUser) {
    return this.service.adminCreate(dto, this.auditFromReq(req));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBrazilListDto, @Req() req: ReqUser) {
    return this.service.adminUpdate(id, dto, this.auditFromReq(req));
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminDelete(id, this.auditFromReq(req));
  }

  // ── Roster ───────────────────────────────────────────

  @Post(':id/roster')
  upsertRoster(
    @Param('id') listId: string,
    @Body() dto: UpsertRosterEntryDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminUpsertRoster(listId, dto, this.auditFromReq(req));
  }

  @Delete(':id/roster/:rosterId')
  removeRoster(
    @Param('id') listId: string,
    @Param('rosterId') rosterId: string,
    @Req() req: ReqUser,
  ) {
    return this.service.adminRemoveRoster(listId, rosterId, this.auditFromReq(req));
  }

  // ── Events ───────────────────────────────────────────

  @Post(':id/events')
  createEvent(
    @Param('id') listId: string,
    @Body() dto: CreateListEventDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminCreateEvent(listId, dto, this.auditFromReq(req));
  }

  private auditFromReq(req: ReqUser) {
    return {
      actorUserId: req.user?.userId,
      actorRole: req.user?.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }
}

@Controller('admin/brazil-list-events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class BrazilListEventsAdminController {
  constructor(private readonly service: BrazilListsService) {}

  @Get(':id')
  getEvent(@Param('id') id: string) {
    return this.service.adminGetEventDetail(id);
  }

  @Patch(':id')
  updateEvent(
    @Param('id') id: string,
    @Body() dto: UpdateListEventDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminUpdateEvent(id, dto, this.auditFromReq(req));
  }

  @Delete(':id')
  deleteEvent(@Param('id') id: string, @Req() req: ReqUser) {
    return this.service.adminDeleteEvent(id, this.auditFromReq(req));
  }

  @Post(':id/generate-matchups')
  generateMatchups(
    @Param('id') id: string,
    @Body() dto: GenerateMatchupsDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminGenerateMatchups(id, dto, this.auditFromReq(req));
  }

  @Post(':id/matchups')
  createMatchup(
    @Param('id') id: string,
    @Body() dto: UpsertMatchupDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminUpsertMatchup(id, dto, this.auditFromReq(req));
  }

  @Patch('matchups/:matchupId')
  updateMatchup(
    @Param('matchupId') matchupId: string,
    @Body() dto: UpdateMatchupDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminUpdateMatchup(matchupId, dto, this.auditFromReq(req));
  }

  @Post('matchups/:matchupId/settle')
  settleMatchup(
    @Param('matchupId') matchupId: string,
    @Body() dto: SettleMatchupDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminSettleMatchup(matchupId, dto, this.auditFromReq(req));
  }

  @Patch('matchups/:matchupId/market')
  toggleMatchupMarket(
    @Param('matchupId') matchupId: string,
    @Body() dto: { open: boolean },
    @Req() req: ReqUser,
  ) {
    return this.service.adminToggleMatchupMarket(matchupId, !!dto.open, this.auditFromReq(req));
  }

  @Delete('matchups/:matchupId')
  deleteMatchup(@Param('matchupId') matchupId: string, @Req() req: ReqUser) {
    return this.service.adminDeleteMatchup(matchupId, this.auditFromReq(req));
  }

  @Post(':id/shark-tank/entries')
  addSharkTankEntry(
    @Param('id') id: string,
    @Body() dto: CreateSharkTankEntryDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminAddSharkTankEntry(id, dto, this.auditFromReq(req));
  }

  @Patch('shark-tank/entries/:entryId')
  updateSharkTankEntry(
    @Param('entryId') entryId: string,
    @Body() dto: UpdateSharkTankEntryDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminUpdateSharkTankEntry(entryId, dto, this.auditFromReq(req));
  }

  @Delete('shark-tank/entries/:entryId')
  removeSharkTankEntry(@Param('entryId') entryId: string, @Req() req: ReqUser) {
    return this.service.adminRemoveSharkTankEntry(entryId, this.auditFromReq(req));
  }

  private auditFromReq(req: ReqUser) {
    return {
      actorUserId: req.user?.userId,
      actorRole: req.user?.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }
}
