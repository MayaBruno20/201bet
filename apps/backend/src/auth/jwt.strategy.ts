import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../database/prisma.service';
import { AUTH_ACCESS_COOKIE } from './auth-cookie';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const raw = req?.cookies?.[AUTH_ACCESS_COOKIE];
          return typeof raw === 'string' && raw.length > 0 ? raw : null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me-in-production',
    });
  }

  async validate(payload: { sub?: string; email?: string; role?: string }) {
    const userId = payload.sub;
    const email = payload.email?.toLowerCase().trim();
    const role = payload.role as UserRole | undefined;

    if (!userId || !email || !role || !Object.values(UserRole).includes(role)) {
      throw new UnauthorizedException('Sessão inválida');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        emailVerified: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Sessão inválida ou conta inativa');
    }

    if (user.email.toLowerCase() !== email) {
      throw new UnauthorizedException('Sessão inválida');
    }

    if (user.role !== role) {
      throw new UnauthorizedException(
        'Permissões alteradas; faça login novamente',
      );
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    };
  }
}
