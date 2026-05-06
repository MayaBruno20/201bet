import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../database/prisma.service';
import { ADMIN_AUTH_ACCESS_COOKIE } from './auth-cookie';

/**
 * Strategy isolada do painel admin.
 *
 * Lê EXCLUSIVAMENTE o cookie `201bet_admin_access` (ou Authorization Bearer no
 * mesmo formato). Não aceita o cookie do site público — quem acessa o painel
 * precisa logar especificamente em /admin/login, mesmo que já esteja logado
 * como user no site principal. Garante isolamento real de sessão.
 */
const ADMIN_ALLOWED_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.OPERATOR,
  UserRole.AUDITOR,
]);

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const raw = req?.cookies?.[ADMIN_AUTH_ACCESS_COOKIE];
          return typeof raw === 'string' && raw.length > 0 ? raw : null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me-in-production',
    });
  }

  async validate(payload: { sub?: string; email?: string; role?: string; scope?: string }) {
    // Tokens emitidos pelo /api/auth/login do site público NÃO carregam scope=admin —
    // mesmo que alguém cole o token no cookie do admin, é rejeitado aqui.
    if (payload.scope !== 'admin') {
      throw new UnauthorizedException('Token sem escopo admin');
    }

    const userId = payload.sub;
    const email = payload.email?.toLowerCase().trim();
    const role = payload.role as UserRole | undefined;

    if (!userId || !email || !role || !ADMIN_ALLOWED_ROLES.has(role)) {
      throw new UnauthorizedException('Sessão admin inválida');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, status: true, emailVerified: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Sessão admin inválida ou conta inativa');
    }

    if (user.email.toLowerCase() !== email) {
      throw new UnauthorizedException('Sessão admin inválida');
    }

    if (user.role !== role || !ADMIN_ALLOWED_ROLES.has(user.role)) {
      throw new UnauthorizedException('Permissões alteradas; faça login novamente');
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    };
  }
}
