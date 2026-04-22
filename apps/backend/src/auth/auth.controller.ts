import { Body, Controller, Get, HttpCode, Ip, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { attachAccessTokenCookie, clearAccessTokenCookie } from './auth-cookie';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() payload: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, user } = await this.authService.login(payload);
    attachAccessTokenCookie(res, accessToken);
    return { user };
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() payload: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, user } = await this.authService.register(payload);
    attachAccessTokenCookie(res, accessToken);
    return { user };
  }

  @Post('google')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async google(@Body() payload: GoogleLoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, user } = await this.authService.googleLogin(payload);
    attachAccessTokenCookie(res, accessToken);
    return { user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    clearAccessTokenCookie(res);
    return { ok: true };
  }

  @Post('verify-email')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Body() payload: VerifyEmailDto) {
    return this.authService.verifyEmail(payload.token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('resend-verification')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 5 * 60_000 } })
  resendVerification(@CurrentUser() user: { userId: string }) {
    return this.authService.resendVerification(user.userId);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 5 * 60_000 } })
  forgotPassword(@Body() payload: ForgotPasswordDto) {
    return this.authService.forgotPassword(payload.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  resetPassword(@Body() payload: ResetPasswordDto, @Ip() ip: string) {
    return this.authService.resetPassword(
      payload.token,
      payload.newPassword,
      payload.confirmPassword,
      ip,
    );
  }

  @Get('reset-password/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyResetPasswordToken(@Query('token') token?: string) {
    return this.authService.verifyResetPasswordToken(token ?? '');
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: { userId: string }) {
    return this.authService.me(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(
    @CurrentUser() user: { userId: string },
    @Body() payload: UpdateProfileDto,
  ) {
    return this.authService.updateMe(user.userId, payload);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-bets')
  myBets(@CurrentUser() user: { userId: string }) {
    return this.authService.listMyBets(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-transactions')
  myTransactions(@CurrentUser() user: { userId: string }) {
    return this.authService.listMyTransactions(user.userId);
  }
}
