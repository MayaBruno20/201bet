import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type LoginAttemptInput = {
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  scope: 'admin' | 'public';
  success: boolean;
  reason?: string | null;
};

/**
 * Loga TODA tentativa de login (sucesso ou falha) e expõe agregações
 * usadas pela página de Segurança ("Tentativas bloqueadas") + bloqueio
 * de IP/email após muitas falhas seguidas.
 */
@Injectable()
export class LoginAttemptService {
  constructor(private readonly prisma: PrismaService) {}

  async log(attempt: LoginAttemptInput) {
    await this.prisma.loginAttempt.create({
      data: {
        email: attempt.email?.toLowerCase().trim() ?? null,
        ipAddress: attempt.ipAddress ?? null,
        userAgent: attempt.userAgent ?? null,
        scope: attempt.scope,
        success: attempt.success,
        reason: attempt.reason ?? null,
      },
    }).catch(() => undefined); // tracking nunca pode quebrar o login
  }

  /**
   * Conta falhas recentes para um par (email, ip) — usado para decidir bloqueio
   * antes de validar a senha. Janela em minutos.
   */
  async recentFailureCount(params: {
    email?: string | null;
    ipAddress?: string | null;
    scope: 'admin' | 'public';
    windowMinutes: number;
  }): Promise<number> {
    const since = new Date(Date.now() - params.windowMinutes * 60_000);
    const orClauses: Array<Record<string, unknown>> = [];
    if (params.email) orClauses.push({ email: params.email.toLowerCase().trim() });
    if (params.ipAddress) orClauses.push({ ipAddress: params.ipAddress });
    if (orClauses.length === 0) return 0;
    return this.prisma.loginAttempt.count({
      where: {
        scope: params.scope,
        success: false,
        createdAt: { gte: since },
        OR: orClauses,
      },
    });
  }

  /**
   * Lista tentativas (sucessos + falhas) recentes para a página de Segurança.
   * Default: scope admin, últimas 24h, top 50 mais recentes.
   */
  async listRecent(params: {
    scope?: 'admin' | 'public';
    onlyFailures?: boolean;
    hours?: number;
    limit?: number;
  } = {}) {
    const since = new Date(Date.now() - (params.hours ?? 24) * 3_600_000);
    return this.prisma.loginAttempt.findMany({
      where: {
        scope: params.scope ?? 'admin',
        ...(params.onlyFailures ? { success: false } : {}),
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.limit ?? 50, 200),
    });
  }

  /** Resumo agregado (failures, successes, top IPs) para os cards. */
  async summary(scope: 'admin' | 'public' = 'admin', hours = 24) {
    const since = new Date(Date.now() - hours * 3_600_000);
    const [failures, successes, byIp] = await Promise.all([
      this.prisma.loginAttempt.count({ where: { scope, success: false, createdAt: { gte: since } } }),
      this.prisma.loginAttempt.count({ where: { scope, success: true, createdAt: { gte: since } } }),
      this.prisma.loginAttempt.groupBy({
        by: ['ipAddress'],
        where: { scope, success: false, createdAt: { gte: since }, ipAddress: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { ipAddress: 'desc' } },
        take: 10,
      }),
    ]);
    return {
      hours,
      failures,
      successes,
      topIps: byIp.map((r) => ({ ip: r.ipAddress, attempts: r._count._all })),
    };
  }
}
