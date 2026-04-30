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
  SettleArmageddonMatchupDto,
} from './dto/armageddon-matchup.dto';

type ReqUser = Request & { user?: { userId?: string; role?: UserRole } };

@Controller('admin/armageddon')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ArmageddonAdminController {
  constructor(private readonly service: ArmageddonService) {}

  @Get()
  listAll() {
    return this.service.adminListAll();
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

  @Patch('matchups/:matchupId/market')
  toggleMarket(
    @Param('matchupId') matchupId: string,
    @Body() dto: { open: boolean },
    @Req() req: ReqUser,
  ) {
    return this.service.adminToggleMatchupMarket(matchupId, !!dto.open, this.audit(req));
  }

  @Post('matchups/:matchupId/settle')
  settle(
    @Param('matchupId') matchupId: string,
    @Body() dto: SettleArmageddonMatchupDto,
    @Req() req: ReqUser,
  ) {
    return this.service.adminSettleMatchup(matchupId, dto, this.audit(req));
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
