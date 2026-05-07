import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';
import { AdminSessionService } from './admin-session.service';
import { LoginAttemptService } from './login-attempt.service';
import { SecurityPolicyService, type SecurityPolicies } from './security-policy.service';
import {
  attachAdminAccessTokenCookie,
  clearAdminAccessTokenCookie,
} from './auth-cookie';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { TwoFactorService } from './two-factor.service';

function extractCtx(req: Request): { ipAddress: string | null; userAgent: string | null } {
  const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return {
    ipAddress: xff || req.ip || null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
}

/**
 * Endpoints exclusivos do painel admin (admin.201-bet.com).
 *
 * - Login emite cookie httpOnly `201bet_admin_access` (isolado do site público).
 * - Apenas roles ADMIN/OPERATOR/AUDITOR conseguem logar aqui.
 * - O cookie do site público (201bet_access) NÃO é aceito pela AdminJwtStrategy.
 * - Se o admin tem 2FA ativado, login é em 2 etapas (login → /login/2fa).
 */
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactor: TwoFactorService,
    private readonly adminSessions: AdminSessionService,
    private readonly loginAttempts: LoginAttemptService,
    private readonly securityPolicy: SecurityPolicyService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() payload: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.adminLogin(payload, extractCtx(req));
    if (result.requires2FA) {
      return { requires2FA: true, tempToken: result.tempToken };
    }
    attachAdminAccessTokenCookie(res, result.accessToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('login/2fa')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login2fa(
    @Body() body: { tempToken: string; code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.adminLoginVerify2FA(
      body.tempToken,
      (uid, code) => this.twoFactor.validateLoginChallenge(uid, code),
      body.code,
      extractCtx(req),
    );
    attachAdminAccessTokenCookie(res, result.accessToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('logout')
  @UseGuards(AdminJwtAuthGuard)
  async logout(
    @CurrentUser() user: { userId: string; sessionId: string | null },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (user.sessionId) {
      await this.adminSessions.revoke(user.sessionId, user.userId, false, 'self_logout').catch(() => undefined);
    }
    clearAdminAccessTokenCookie(res);
    return { ok: true };
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: { userId: string; email: string; role: string; emailVerified: boolean }) {
    return user;
  }

  // ── 2FA management (todos exigem cookie admin válido) ──
  @UseGuards(AdminJwtAuthGuard)
  @Post('2fa/setup')
  @HttpCode(200)
  async setup2fa(@CurrentUser() user: { userId: string }) {
    return this.twoFactor.setup(user.userId);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('2fa/verify')
  @HttpCode(200)
  async verify2fa(@CurrentUser() user: { userId: string }, @Body() body: { code: string }) {
    return this.twoFactor.verify(user.userId, body.code);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('2fa/disable')
  @HttpCode(200)
  async disable2fa(
    @CurrentUser() user: { userId: string },
    @Body() body: { password: string; code: string },
  ) {
    return this.twoFactor.disable(user.userId, body.password, body.code);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('2fa/regenerate-backup-codes')
  @HttpCode(200)
  async regenerateBackupCodes(
    @CurrentUser() user: { userId: string },
    @Body() body: { code: string },
  ) {
    return this.twoFactor.regenerateBackupCodes(user.userId, body.code);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('2fa/status')
  async status2fa(@CurrentUser() user: { userId: string }) {
    // Indica ao frontend se 2FA está habilitado (pra mostrar/esconder banner).
    const u = await this.twoFactor['prisma'].user.findUnique({
      where: { id: user.userId },
      select: { twoFactorEnabled: true, twoFactorBackupCodes: true },
    });
    return {
      enabled: !!u?.twoFactorEnabled,
      backupCodesRemaining: u?.twoFactorBackupCodes.length ?? 0,
    };
  }

  // ── Sessões ativas ───────────────────────────────────────────
  // Qualquer admin/operator/auditor consegue ver e revogar SUAS próprias
  // sessões. ADMIN também consegue ver TODAS e disparar "force logout global".

  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
  @Get('sessions/mine')
  async listMySessions(@CurrentUser() user: { userId: string; sessionId: string | null }) {
    const sessions = await this.adminSessions.listForUser(user.userId);
    return sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      current: s.id === user.sessionId,
    }));
  }

  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('sessions')
  async listAllSessions() {
    const sessions = await this.adminSessions.listAllActive();
    return sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      user: s.user,
    }));
  }

  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
  @Delete('sessions/:id')
  @HttpCode(200)
  async revokeSession(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string; sessionId: string | null },
  ) {
    const isAdmin = user.role === UserRole.ADMIN;
    return this.adminSessions.revoke(id, user.userId, isAdmin, isAdmin ? 'admin_revoke' : 'self_revoke');
  }

  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('sessions/revoke-all')
  @HttpCode(200)
  async revokeAllSessions(@CurrentUser() user: { sessionId: string | null }) {
    return this.adminSessions.revokeAllExcept(user.sessionId, 'global_force_logout');
  }

  // ── Políticas de segurança ──────────────────────────────────

  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
  @Get('policies')
  async getPolicies() {
    return this.securityPolicy.get();
  }

  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('policies')
  async updatePolicies(
    @CurrentUser() user: { userId: string },
    @Body() body: Partial<SecurityPolicies>,
  ) {
    return this.securityPolicy.update(body, user.userId);
  }

  // ── Tentativas de login (sucessos + falhas) ─────────────────

  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
  @Get('login-attempts')
  async listLoginAttempts(
    @Query('hours') hours?: string,
    @Query('onlyFailures') onlyFailures?: string,
  ) {
    const h = hours ? Math.min(Math.max(Number.parseInt(hours, 10), 1), 720) : 24;
    return this.loginAttempts.listRecent({
      scope: 'admin',
      hours: h,
      onlyFailures: onlyFailures === 'true' || onlyFailures === '1',
      limit: 100,
    });
  }

  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
  @Get('login-attempts/summary')
  async loginAttemptsSummary(@Query('hours') hours?: string) {
    const h = hours ? Math.min(Math.max(Number.parseInt(hours, 10), 1), 720) : 24;
    return this.loginAttempts.summary('admin', h);
  }
}
