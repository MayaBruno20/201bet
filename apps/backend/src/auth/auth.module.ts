import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerifiedGuard } from './email-verified.guard';
import { JwtStrategy } from './jwt.strategy';
import { MailModule } from '../mail/mail.module';
import { TokensModule } from '../tokens/tokens.module';

const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ??
  '8h') as `${number}${'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change-me-in-production',
      signOptions: { expiresIn: jwtExpiresIn },
    }),
    TokensModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, EmailVerifiedGuard],
  exports: [PassportModule, JwtModule, EmailVerifiedGuard],
})
export class AuthModule {}
