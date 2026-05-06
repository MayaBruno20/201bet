import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';
import {
  attachAdminAccessTokenCookie,
  clearAdminAccessTokenCookie,
} from './auth-cookie';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { TwoFactorService } from './two-factor.service';

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
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() payload: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.adminLogin(payload);
    if (result.requires2FA) {
      // Cliente vai chamar POST /login/2fa com o tempToken e o código.
      return { requires2FA: true, tempToken: result.tempToken };
    }
    attachAdminAccessTokenCookie(res, result.accessToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('login/2fa')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login2fa(
    @Body() body: { tempToken: string; code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.adminLoginVerify2FA(
      body.tempToken,
      (uid, code) => this.twoFactor.validateLoginChallenge(uid, code),
      body.code,
    );
    attachAdminAccessTokenCookie(res, result.accessToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
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
}
