import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { VerificationTokenType } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

export interface IssuedToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
  id: string;
}

export interface ConsumedToken {
  userId: string;
  type: VerificationTokenType;
}

export type InspectedToken =
  | { valid: true; userId: string; email: string }
  | {
      valid: false;
      reason: 'not_found' | 'wrong_type' | 'used' | 'expired';
    };

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  constructor(private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    type: VerificationTokenType,
    ttlMs: number,
  ): Promise<IssuedToken> {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(rawToken);
    const expiresAt = new Date(Date.now() + ttlMs);

    const record = await this.prisma.verificationToken.create({
      data: { userId, type, tokenHash, expiresAt },
      select: { id: true },
    });

    return { rawToken, tokenHash, expiresAt, id: record.id };
  }

  async consume(
    rawToken: string,
    type: VerificationTokenType,
  ): Promise<ConsumedToken> {
    if (!rawToken || typeof rawToken !== 'string') {
      this.logger.warn(`consume rejected: empty token type=${type}`);
      throw new BadRequestException('Token inválido');
    }

    const tokenHash = this.hash(rawToken);

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.verificationToken.findUnique({
        where: { tokenHash },
      });

      if (!record) {
        this.logger.warn(`consume rejected: not_found type=${type}`);
        throw new BadRequestException('Token inválido ou expirado');
      }
      if (record.type !== type) {
        this.logger.warn(
          `consume rejected: wrong_type expected=${type} got=${record.type} userId=${record.userId}`,
        );
        throw new BadRequestException('Token inválido ou expirado');
      }
      if (record.usedAt) {
        this.logger.warn(
          `consume rejected: already_used type=${type} userId=${record.userId} usedAt=${record.usedAt.toISOString()}`,
        );
        throw new BadRequestException('Token já utilizado');
      }
      if (record.expiresAt.getTime() < Date.now()) {
        this.logger.warn(
          `consume rejected: expired type=${type} userId=${record.userId} expiredAt=${record.expiresAt.toISOString()}`,
        );
        throw new BadRequestException('Token inválido ou expirado');
      }

      await tx.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      this.logger.log(
        `consume ok type=${type} userId=${record.userId} tokenId=${record.id}`,
      );
      return { userId: record.userId, type: record.type };
    });
  }

  async inspect(
    rawToken: string,
    type: VerificationTokenType,
  ): Promise<InspectedToken> {
    if (!rawToken || typeof rawToken !== 'string') {
      return { valid: false, reason: 'not_found' };
    }
    const tokenHash = this.hash(rawToken);
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { email: true } } },
    });
    if (!record) return { valid: false, reason: 'not_found' };
    if (record.type !== type) return { valid: false, reason: 'wrong_type' };
    if (record.usedAt) return { valid: false, reason: 'used' };
    if (record.expiresAt.getTime() < Date.now()) {
      return { valid: false, reason: 'expired' };
    }
    return { valid: true, userId: record.userId, email: record.user.email };
  }

  async invalidateAllOfType(
    userId: string,
    type: VerificationTokenType,
  ): Promise<number> {
    const result = await this.prisma.verificationToken.updateMany({
      where: {
        userId,
        type,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    return result.count;
  }

  async countActiveOfType(
    userId: string,
    type: VerificationTokenType,
    withinMs?: number,
  ): Promise<number> {
    return this.prisma.verificationToken.count({
      where: {
        userId,
        type,
        usedAt: null,
        expiresAt: { gt: new Date() },
        ...(withinMs
          ? { createdAt: { gte: new Date(Date.now() - withinMs) } }
          : {}),
      },
    });
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
