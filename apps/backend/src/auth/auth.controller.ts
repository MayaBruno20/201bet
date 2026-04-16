import { Body, Controller, Get, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { attachAccessTokenCookie, clearAccessTokenCookie } from './auth-cookie';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
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
