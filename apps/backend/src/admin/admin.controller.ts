import { extname } from 'path';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { CARS_UPLOAD_DIR, BANNERS_UPLOAD_DIR } from '../common/uploads';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { QuickDuelService, type CreateQuickDuelDto } from './quick-duel.service';
import {
  CustomDuelService,
  type CreateCustomDuelDto,
  type UpdateCustomDuelDto,
} from './custom-duel.service';
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
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly quickDuels: QuickDuelService,
    private readonly customDuels: CustomDuelService,
  ) {}

  @Get('dashboard')
  dashboard(@Query('days') days?: string) {
    const parsed = days ? Number.parseInt(days, 10) : 30;
    const safe = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 365) : 30;
    return this.adminService.getDashboardSummary(safe);
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

  @Post('cars/:id/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: CARS_UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase().slice(0, 8);
          const safeExt = /^\.(png|jpg|jpeg|webp|gif)$/.test(ext) ? ext : '.jpg';
          cb(null, `${randomUUID()}${safeExt}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
          cb(new BadRequestException('Formato inválido. Use PNG, JPG, WEBP ou GIF.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadCarPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: ReqUser,
  ) {
    if (!file) throw new BadRequestException('Envie um arquivo no campo "photo"');
    const photoUrl = `/api/uploads/cars/${file.filename}`;
    return this.adminService.setCarPhoto(id, photoUrl, this.auditFromReq(req));
  }

  @Delete('cars/:id/photo')
  removeCarPhoto(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.adminService.setCarPhoto(id, null, this.auditFromReq(req));
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

  // ── Multi-Runner Markets ──

  @Post('events/backfill-links')
  backfillEventLinks(@Req() req: ReqUser) {
    return this.adminService.backfillEventLinks(this.auditFromReq(req));
  }

  @Get('markets')
  listMarkets(@Query('eventId') eventId?: string) {
    return this.adminService.listMultiRunnerMarkets(eventId);
  }

  /** Lista TODOS os mercados ao vivo (qualquer tipo, status não-SETTLED). */
  @Get('markets/live')
  listLiveMarkets(@Query('eventId') eventId?: string) {
    return this.adminService.listLiveMarkets(eventId);
  }

  /** Fechamento financeiro de um multi-mercado: potes por opção, projeções por cenário e, se liquidado, lista de ganhadores. */
  @Get('markets/:id/summary')
  marketSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getMultiRunnerMarketSummary(id);
  }

  /** Reinicia o evento: refund de apostas em aberto + reset dos pools + reabertura dos mercados. */
  @Post('events/:id/restart')
  restartEvent(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.adminService.restartEvent(id, this.auditFromReq(req));
  }

  @Post('markets')
  createMarket(
    @Body() payload: { eventId: string; name: string; type: string; runners: string[]; rakePercent?: number; bookingCloseAt?: string; duelId?: string },
    @Req() req: ReqUser,
  ) {
    return this.adminService.createMultiRunnerMarket(payload, this.auditFromReq(req));
  }

  @Patch('markets/:id')
  updateMarket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: { name?: string; status?: string; rakePercent?: number; bookingCloseAt?: string },
    @Req() req: ReqUser,
  ) {
    return this.adminService.updateMultiRunnerMarket(id, payload, this.auditFromReq(req));
  }

  @Post('markets/:id/settle')
  settleMarket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: { winnerOddId: string },
    @Req() req: ReqUser,
  ) {
    return this.adminService.settleMarket(id, payload.winnerOddId, this.auditFromReq(req));
  }

  @Post('markets/:id/void')
  voidMarket(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.adminService.voidMarket(id, this.auditFromReq(req));
  }

  @Post('duels/:id/settle')
  settleDuel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: { winningSide: 'LEFT' | 'RIGHT' },
    @Req() req: ReqUser,
  ) {
    return this.adminService.settleDuel(id, payload.winningSide, this.auditFromReq(req));
  }

  // ── Embates rápidos (quick duels) ──

  @Get('quick-duels')
  listQuickDuels() {
    return this.quickDuels.list();
  }

  @Post('quick-duels')
  createQuickDuel(@Body() dto: CreateQuickDuelDto, @Req() req: ReqUser) {
    return this.quickDuels.create(dto, this.auditFromReq(req));
  }

  @Post('quick-duels/:id/close-booking')
  closeQuickDuelBooking(@Param('id', ParseUUIDPipe) id: string) {
    return this.quickDuels.closeBooking(id);
  }

  @Post('quick-duels/:id/settle')
  settleQuickDuel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: { winningSide: 'LEFT' | 'RIGHT' },
    @Req() req: ReqUser,
  ) {
    return this.quickDuels.settle(id, payload.winningSide, this.auditFromReq(req));
  }

  @Post('quick-duels/:id/cancel')
  cancelQuickDuel(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.quickDuels.cancel(id, this.auditFromReq(req));
  }

  // ── Embates personalizados ──
  // Duelos marcados entre dois carros específicos, banner próprio (link/upload),
  // opcionalmente vinculados a um Event existente. Quando sem vínculo, vão para
  // um Event curinga "✨ Embates Personalizados".

  @Get('custom-duels')
  listCustomDuels() {
    return this.customDuels.list();
  }

  @Post('custom-duels')
  createCustomDuel(@Body() dto: CreateCustomDuelDto, @Req() req: ReqUser) {
    return this.customDuels.create(dto, this.auditFromReq(req));
  }

  @Patch('custom-duels/:id')
  updateCustomDuel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomDuelDto,
    @Req() req: ReqUser,
  ) {
    return this.customDuels.update(id, dto, this.auditFromReq(req));
  }

  @Post('custom-duels/:id/close-booking')
  closeCustomDuelBooking(@Param('id', ParseUUIDPipe) id: string) {
    return this.customDuels.closeBooking(id);
  }

  @Post('custom-duels/:id/settle')
  settleCustomDuel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: { winningSide: 'LEFT' | 'RIGHT' },
    @Req() req: ReqUser,
  ) {
    return this.customDuels.settle(id, payload.winningSide, this.auditFromReq(req));
  }

  @Post('custom-duels/:id/cancel')
  cancelCustomDuel(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.customDuels.cancel(id, this.auditFromReq(req));
  }

  @Post('custom-duels/:id/banner')
  @UseInterceptors(
    FileInterceptor('banner', {
      storage: diskStorage({
        destination: BANNERS_UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase().slice(0, 8);
          const safeExt = /^\.(png|jpg|jpeg|webp|gif)$/.test(ext) ? ext : '.jpg';
          cb(null, `${randomUUID()}${safeExt}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
          cb(new BadRequestException('Formato inválido. Use PNG, JPG, WEBP ou GIF.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadCustomDuelBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Envie um arquivo no campo "banner".');
    const bannerUrl = `/api/uploads/banners/${file.filename}`;
    return this.customDuels.setBanner(id, bannerUrl);
  }

  @Delete('custom-duels/:id/banner')
  removeCustomDuelBanner(@Param('id', ParseUUIDPipe) id: string) {
    return this.customDuels.setBanner(id, null);
  }

  // ── Affiliates ──

  @Get('affiliates')
  listAffiliates() {
    return this.adminService.listAffiliates();
  }

  @Post('affiliates')
  createAffiliate(
    @Body() payload: { name: string; code: string; commissionPct: number },
    @Req() req: ReqUser,
  ) {
    return this.adminService.createAffiliate(payload, this.auditFromReq(req));
  }

  @Patch('affiliates/:id')
  updateAffiliate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: { name?: string; code?: string; commissionPct?: number; active?: boolean },
    @Req() req: ReqUser,
  ) {
    return this.adminService.updateAffiliate(id, payload, this.auditFromReq(req));
  }

  @Delete('affiliates/:id')
  deleteAffiliate(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.adminService.deleteAffiliate(id, this.auditFromReq(req));
  }

  @Get('affiliates/:id/commissions')
  affiliateCommissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getAffiliateCommissions(id);
  }

  // ── Promoções (QR Code do panfleto) ──

  @Get('promotions')
  listPromotions() {
    return this.adminService.listPromotions();
  }

  @Post('promotions')
  createPromotion(
    @Body() payload: { name: string; code?: string; bonusAmount?: number; minDeposit?: number },
    @Req() req: ReqUser,
  ) {
    return this.adminService.createPromotion(payload, this.auditFromReq(req));
  }

  @Patch('promotions/:id')
  updatePromotion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    payload: { name?: string; code?: string; bonusAmount?: number; minDeposit?: number; active?: boolean },
    @Req() req: ReqUser,
  ) {
    return this.adminService.updatePromotion(id, payload, this.auditFromReq(req));
  }

  @Delete('promotions/:id')
  deletePromotion(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReqUser) {
    return this.adminService.deletePromotion(id, this.auditFromReq(req));
  }

  @Get('promotions/:id/enrollments')
  promotionEnrollments(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getPromotionEnrollments(id);
  }

  // ── Config ──

  @Post('config/margin')
  updateMargin() {
    // A margem da casa é FIXA por regulamento (HOUSE_MARGIN_PERCENT = 20%).
    // Toda a math de odds/settlement depende disso ser estável; admins não podem alterar.
    throw new BadRequestException('A margem da casa é fixa em 20% por regulamento e não pode ser alterada.');
  }

  @Post('config/min-bet')
  async updateMinBet(@Body() payload: { value: number }, @Req() req: ReqUser) {
    const val = Number(payload.value);
    if (!Number.isFinite(val) || val < 0) throw new BadRequestException('Valor inválido');
    process.env.MIN_BET_AMOUNT = String(val);
    await this.adminService.upsertSetting({ key: 'MIN_BET_AMOUNT', value: String(val), description: 'Aposta mínima R$' }, this.auditFromReq(req));
    return { minBetAmount: val };
  }

  // ── Profit Dashboard ──

  @Get('analytics/profit-by-market')
  profitByMarket() {
    return this.adminService.getProfitByMarket();
  }

  @Get('analytics/profit-summary')
  profitSummary() {
    return this.adminService.getProfitSummary();
  }

  /** Lista de eventos elegíveis pra fechamento (Listas + Armageddon). */
  @Get('analytics/closing-eligible-events')
  closingEligibleEvents() {
    return this.adminService.listClosingEligibleEvents();
  }

  /** Fechamento financeiro de um ListEvent (depósitos/saques/apostas/ganhos/perdas). */
  @Get('list-events/:id/financial-closing')
  listEventFinancialClosing(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getEventFinancialClosing(id, 'list');
  }

  /** Fechamento financeiro de um ArmageddonEvent. */
  @Get('armageddon-events/:id/financial-closing')
  armageddonEventFinancialClosing(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getEventFinancialClosing(id, 'armageddon');
  }

  @Get('audit-logs')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  auditLogs(
    @Query('limit') limit?: string,
    @Query('since') since?: string,
    @Query('entity') entity?: string,
  ) {
    return this.adminService.listAuditLogs({
      limit: limit ? Number(limit) : 200,
      since: since ? new Date(since) : undefined,
      entity: entity || undefined,
    });
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
