import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type SessionContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Gerencia sessões persistidas do painel admin.
 * Cada login bem-sucedido cria um row aqui; o JWT carrega `sid = AdminSession.id`,
 * validado a cada request pela AdminJwtStrategy. Permite revogar uma sessão
 * específica (own ou de qualquer usuário, se ADMIN) e "Forçar logout global".
 */
@Injectable()
export class AdminSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, ctx: SessionContext = {}) {
    return this.prisma.adminSession.create({
      data: {
        userId,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
  }

  /** Verifica se a sessão existe, é do usuário e não foi revogada. */
  async isValid(sessionId: string, userId: string): Promise<boolean> {
    const s = await this.prisma.adminSession.findUnique({ where: { id: sessionId } });
    return !!s && s.userId === userId && s.revokedAt === null;
  }

  /** Atualiza `lastSeenAt` da sessão (rate-limited a 1 update/30s para não martelar o DB). */
  async touch(sessionId: string) {
    const now = Date.now();
    const session = await this.prisma.adminSession.findUnique({
      where: { id: sessionId },
      select: { lastSeenAt: true },
    });
    if (!session) return;
    if (now - session.lastSeenAt.getTime() < 30_000) return;
    await this.prisma.adminSession.update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date(now) },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.adminSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async listAllActive() {
    return this.prisma.adminSession.findMany({
      where: { revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
      take: 200,
    });
  }

  async revoke(sessionId: string, requesterUserId: string, isAdmin: boolean, reason: string) {
    const session = await this.prisma.adminSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    if (session.revokedAt) return { id: sessionId, alreadyRevoked: true };
    if (!isAdmin && session.userId !== requesterUserId) {
      throw new NotFoundException('Sessão não encontrada');
    }
    await this.prisma.adminSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return { id: sessionId, alreadyRevoked: false };
  }

  /**
   * Revoga TODAS as sessões admin ativas, exceto a do solicitante.
   * Usado pelo botão "Forçar logout global" do dashboard de segurança.
   */
  async revokeAllExcept(currentSessionId: string | null, reason: string) {
    const result = await this.prisma.adminSession.updateMany({
      where: {
        revokedAt: null,
        ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return { revoked: result.count };
  }
}
