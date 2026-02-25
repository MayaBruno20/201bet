import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
  login(@Body() payload: LoginDto) {
    return this.authService.login(payload);
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() payload: RegisterDto) {
    return this.authService.register(payload);
  }

  @Post('google')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  google(@Body() payload: GoogleLoginDto) {
    return this.authService.googleLogin(payload);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: { userId: string }) {
    return this.authService.me(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: { userId: string }, @Body() payload: UpdateProfileDto) {
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
