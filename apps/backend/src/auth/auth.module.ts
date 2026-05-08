import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminAuthController } from './admin-auth.controller';
import { AdminJwtStrategy } from './admin-jwt.strategy';
import { AdminSessionService } from './admin-session.service';
import { LoginAttemptService } from './login-attempt.service';
import { SecurityPolicyService } from './security-policy.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerifiedGuard } from './email-verified.guard';
import { JwtStrategy } from './jwt.strategy';
import { TwoFactorService } from './two-factor.service';
import { MailModule } from '../mail/mail.module';
import { TokensModule } from '../tokens/tokens.module';
import { RolesGuard } from '../common/guards/roles.guard';

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
  controllers: [AuthController, AdminAuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AdminJwtStrategy,
    TwoFactorService,
    EmailVerifiedGuard,
    AdminSessionService,
    LoginAttemptService,
    SecurityPolicyService,
    RolesGuard,
  ],
  exports: [
    PassportModule,
    JwtModule,
    EmailVerifiedGuard,
    AdminSessionService,
    LoginAttemptService,
    SecurityPolicyService,
  ],
})
export class AuthModule {}
