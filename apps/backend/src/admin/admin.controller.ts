import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { AnalyticsExportQueryDto } from './dto/analytics-query.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { CreateCarDto } from './dto/create-car.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CreateDuelDto } from './dto/create-duel.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { AdjustUserWalletDto } from './dto/adjust-user-wallet.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { UpdateDuelDto } from './dto/update-duel.dto';
import { UpdateEventDto } from './dto/update-event.dto';

type ReqUser = Request & { user?: { userId?: string; role?: UserRole } };

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.adminService.getDashboardSummary();
  }

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Post('users')
  createUser(@Body() payload: CreateAdminUserDto, @Req() req: ReqUser) {
    return this.adminService.createUser(payload, this.auditFromReq(req));
  }

  @Patch('users/:id')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateAdminUserDto,
    @Req() req: ReqUser,
  ) {
    return this.adminService.updateUser(id, payload, this.auditFromReq(req));
  }

  @Delete('users/:id')
  @Roles(UserRole.ADMIN)
  deleteUser(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.adminService.deleteUser(id, this.auditFromReq(req));
  }

  @Post('users/:id/wallet-adjust')
  @Roles(UserRole.ADMIN)
  adjustUserWallet(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: AdjustUserWalletDto,
    @Req() req: ReqUser,
  ) {
    return this.adminService.adjustUserWallet(
      id,
      payload,
      this.auditFromReq(req),
    );
  }

  @Get('events')
  listEvents() {
    return this.adminService.listEvents();
  }

  @Post('events')
  createEvent(@Body() payload: CreateEventDto, @Req() req: ReqUser) {
    return this.adminService.createEvent(payload, this.auditFromReq(req));
  }

  @Patch('events/:id')
  updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateEventDto,
    @Req() req: ReqUser,
  ) {
    return this.adminService.updateEvent(id, payload, this.auditFromReq(req));
  }

  @Delete('events/:id')
  deleteEvent(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.adminService.deleteEvent(id, this.auditFromReq(req));
  }

  @Get('drivers')
  listDrivers() {
    return this.adminService.listDrivers();
  }

  @Post('drivers')
  createDriver(@Body() payload: CreateDriverDto, @Req() req: ReqUser) {
    return this.adminService.createDriver(payload, this.auditFromReq(req));
  }

  @Patch('drivers/:id')
  updateDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateDriverDto,
    @Req() req: ReqUser,
  ) {
    return this.adminService.updateDriver(id, payload, this.auditFromReq(req));
  }

  @Delete('drivers/:id')
  deleteDriver(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.adminService.deleteDriver(id, this.auditFromReq(req));
  }

  @Get('cars')
  listCars() {
    return this.adminService.listCars();
  }

  @Post('cars')
  createCar(@Body() payload: CreateCarDto, @Req() req: ReqUser) {
    return this.adminService.createCar(payload, this.auditFromReq(req));
  }

  @Patch('cars/:id')
  updateCar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateCarDto,
    @Req() req: ReqUser,
  ) {
    return this.adminService.updateCar(id, payload, this.auditFromReq(req));
  }

  @Delete('cars/:id')
  deleteCar(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.adminService.deleteCar(id, this.auditFromReq(req));
  }

  @Get('duels')
  listDuels() {
    return this.adminService.listDuels();
  }

  @Post('duels')
  createDuel(@Body() payload: CreateDuelDto, @Req() req: ReqUser) {
    return this.adminService.createDuel(payload, this.auditFromReq(req));
  }

  @Patch('duels/:id')
  updateDuel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateDuelDto,
    @Req() req: ReqUser,
  ) {
    return this.adminService.updateDuel(id, payload, this.auditFromReq(req));
  }

  @Delete('duels/:id')
  deleteDuel(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.adminService.deleteDuel(id, this.auditFromReq(req));
  }

  @Get('settings')
  listSettings() {
    return this.adminService.listSettings();
  }

  @Post('settings')
  upsertSetting(@Body() payload: UpsertSettingDto, @Req() req: ReqUser) {
    return this.adminService.upsertSetting(payload, this.auditFromReq(req));
  }

  @Delete('settings/:id')
  @Roles(UserRole.ADMIN)
  deleteSetting(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.adminService.deleteSetting(id, this.auditFromReq(req));
  }

  @Get('analytics/overview')
  analyticsOverview() {
    return this.adminService.getAnalyticsOverview();
  }

  @Get('analytics/profitability')
  profitability() {
    return this.adminService.getProfitabilityReport();
  }

  @Get('analytics/events')
  eventPerformance(@Query('limit') limit?: string) {
    return this.adminService.getEventPerformance(limit ? Number(limit) : 20);
  }

  @Get('analytics/engagement')
  userEngagement() {
    return this.adminService.getUserEngagementMetrics();
  }

  @Get('analytics/export')
  exportAnalytics(@Query() query: AnalyticsExportQueryDto) {
    return this.adminService.exportAnalytics(query);
  }

  @Get('audit-logs')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  auditLogs(@Query('limit') limit?: string) {
    return this.adminService.listAuditLogs(limit ? Number(limit) : 100);
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
