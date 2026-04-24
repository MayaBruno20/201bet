import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { VerificationTokenType } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import type { AppEnv } from '../config/env.validation';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { TokensService } from '../tokens/tokens.service';
import { randomBytes } from 'node:crypto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async login(payload: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: payload.email.toLowerCase().trim() },
      include: { wallet: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isValidPassword = await bcrypt.compare(
      payload.password,
      user.password,
    );
    if (!isValidPassword) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.issueToken(
      user.id,
      user.email,
      user.role,
      this.buildAuthUserPayload(user),
    );
  }

  async register(payload: RegisterDto) {
    const email = payload.email.toLowerCase().trim();
    const cpf = this.normalizeCpf(payload.cpf);

    if (payload.password !== payload.confirmPassword) {
      throw new BadRequestException('Senha e confirmação não conferem');
    }

    if (!this.isAdult(payload.birthDate)) {
      throw new BadRequestException(
        'Cadastro permitido apenas para maiores de 18 anos',
      );
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    const existingCpf = await this.prisma.user.findUnique({ where: { cpf } });

    if (existing || existingCpf) {
      throw new BadRequestException(
        existing ? 'E-mail já cadastrado' : 'CPF já cadastrado',
      );
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          email,
          name: payload.name.trim(),
          cpf,
          birthDate: new Date(payload.birthDate),
          password: passwordHash,
          wallet: {
            create: {
              balance: 0,
              currency: 'BRL',
            },
          },
        },
        include: { wallet: true },
      });
    });

    await this.dispatchVerificationEmail(user.id, user.email, user.name);

    return this.issueToken(
      user.id,
      user.email,
      user.role,
      this.buildAuthUserPayload(user),
    );
  }

  async verifyEmail(rawToken: string) {
    const { userId } = await this.tokens.consume(
      rawToken,
      VerificationTokenType.EMAIL_VERIFICATION,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });

    await this.tokens.invalidateAllOfType(
      userId,
      VerificationTokenType.EMAIL_VERIFICATION,
    );

    return { ok: true, emailVerified: true };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, emailVerified: true },
    });

    if (!user) {
      throw new UnauthorizedException('Sessão inválida');
    }

    if (user.emailVerified) {
      return { ok: true, alreadyVerified: true };
    }

    await this.tokens.invalidateAllOfType(
      user.id,
      VerificationTokenType.EMAIL_VERIFICATION,
    );
    await this.dispatchVerificationEmail(user.id, user.email, user.name);

    return { ok: true, alreadyVerified: false };
  }

  async forgotPassword(email: string) {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, name: true, status: true },
    });

    if (user && user.status === 'ACTIVE') {
      await this.tokens.invalidateAllOfType(
        user.id,
        VerificationTokenType.PASSWORD_RESET,
      );
      await this.dispatchPasswordResetEmail(user.id, user.email, user.name);
    }

    return { ok: true };
  }

  async verifyResetPasswordToken(rawToken: string) {
    const inspected = await this.tokens.inspect(
      rawToken,
      VerificationTokenType.PASSWORD_RESET,
    );
    if (!inspected.valid) {
      return { valid: false as const, reason: inspected.reason };
    }
    return {
      valid: true as const,
      maskedEmail: this.maskEmail(inspected.email),
    };
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***';
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    if (local.length <= 4) {
      return `${local[0]}***${local.slice(-1)}@${domain}`;
    }
    return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
    confirmPassword: string,
    ipAddress?: string,
  ) {
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Senha e confirmação não conferem');
    }

    const { userId } = await this.tokens.consume(
      rawToken,
      VerificationTokenType.PASSWORD_RESET,
    );

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
      select: { id: true, email: true, name: true },
    });

    await this.tokens.invalidateAllOfType(
      user.id,
      VerificationTokenType.PASSWORD_RESET,
    );

    try {
      await this.mail.sendPasswordChanged({
        userId: user.id,
        email: user.email,
        userName: user.name,
        ipAddress,
      });
    } catch (error) {
      this.logger.error(
        `Falha ao despachar e-mail password-changed para ${user.id}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }

    return { ok: true };
  }

  private async dispatchVerificationEmail(
    userId: string,
    email: string,
    userName: string | null,
  ) {
    try {
      const ttlHours = this.config.get('EMAIL_VERIFICATION_TTL_HOURS', {
        infer: true,
      });
      const { rawToken } = await this.tokens.issue(
        userId,
        VerificationTokenType.EMAIL_VERIFICATION,
        ttlHours * 60 * 60 * 1000,
      );
      await this.mail.sendVerification({ userId, email, userName, rawToken });
    } catch (error) {
      this.logger.error(
        `Falha ao despachar e-mail de verificação para ${userId}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }

  private async dispatchPasswordResetEmail(
    userId: string,
    email: string,
    userName: string | null,
  ) {
    try {
      const ttlMinutes = this.config.get('PASSWORD_RESET_TTL_MINUTES', {
        infer: true,
      });
      const { rawToken } = await this.tokens.issue(
        userId,
        VerificationTokenType.PASSWORD_RESET,
        ttlMinutes * 60 * 1000,
      );
      await this.mail.sendPasswordReset({ userId, email, userName, rawToken });
    } catch (error) {
      this.logger.error(
        `Falha ao despachar e-mail de reset de senha para ${userId}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }

  async googleLogin(payload: GoogleLoginDto) {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new BadRequestException('Google login não configurado no backend');
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const ticketPayload = ticket.getPayload();
    if (!ticketPayload?.email || !ticketPayload.sub) {
      throw new UnauthorizedException('Token Google inválido');
    }

    const email = ticketPayload.email.toLowerCase();
    const displayName =
      ticketPayload.name ?? email.split('@')[0] ?? 'Usuário Google';

    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
        include: { wallet: true },
      });
      if (existing) {
        const updated = await tx.user.update({
          where: { id: existing.id },
          data: {
            googleSub: ticketPayload.sub,
            status: 'ACTIVE',
            emailVerified: true,
          },
          include: { wallet: true },
        });
        return updated;
      }

      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
      return tx.user.create({
        data: {
          email,
          name: displayName,
          password: passwordHash,
          cpf: null,
          birthDate: null,
          googleSub: ticketPayload.sub,
          status: 'ACTIVE',
          emailVerified: true,
          wallet: { create: { balance: 0, currency: 'BRL' } },
        },
        include: { wallet: true },
      });
    });

    return this.issueToken(
      user.id,
      user.email,
      user.role,
      this.buildAuthUserPayload(user),
    );
  }

  /**
   * Após Google: grava CPF e data (maior de 18) antes de apostar/PIX.
   */
  async completeProfile(userId: string, payload: CompleteProfileDto) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!current) {
      throw new UnauthorizedException('Sessão inválida');
    }
    if (current.cpf) {
      throw new BadRequestException(
        'O cadastro já foi concluído. Use Minha conta para alterar dados.',
      );
    }
    const cpf = this.normalizeCpf(payload.cpf);
    const other = await this.prisma.user.findFirst({
      where: { cpf, NOT: { id: userId } },
    });
    if (other) {
      throw new BadRequestException('CPF já cadastrado');
    }
    if (!this.isAdult(payload.birthDate)) {
      throw new BadRequestException(
        'Cadastro permitido apenas para maiores de 18 anos',
      );
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { cpf, birthDate: new Date(payload.birthDate) },
      include: { wallet: true },
    });
    return { user: this.buildAuthUserPayload(updated) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        cpf: true,
        birthDate: true,
        phone: true,
        country: true,
        state: true,
        city: true,
        address: true,
        postalCode: true,
        nationality: true,
        gender: true,
        avatarUrl: true,
        emailVerified: true,
        role: true,
        status: true,
        createdAt: true,
        wallet: {
          select: {
            balance: true,
            currency: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Sessão inválida');
    }

    return {
      ...user,
      profileComplete: !!user.cpf && !!user.birthDate,
    };
  }

  async updateMe(userId: string, payload: UpdateProfileDto) {
    if (payload.cpf) {
      const row = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { cpf: true },
      });
      if (row && !row.cpf) {
        throw new BadRequestException(
          'Use POST /api/auth/complete-profile para informar CPF e data de nascimento (primeiro cadastro).',
        );
      }
      const cpf = this.normalizeCpf(payload.cpf);
      const existing = await this.prisma.user.findUnique({ where: { cpf } });
      if (existing && existing.id !== userId) {
        throw new BadRequestException('CPF já cadastrado');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: payload.firstName?.trim(),
        lastName: payload.lastName?.trim(),
        phone: payload.phone?.trim(),
        country: payload.country?.trim(),
        state: payload.state?.trim(),
        city: payload.city?.trim(),
        address: payload.address?.trim(),
        postalCode: payload.postalCode?.trim(),
        nationality: payload.nationality?.trim(),
        gender: payload.gender?.trim(),
        avatarUrl: payload.avatarUrl?.trim(),
        cpf: payload.cpf ? this.normalizeCpf(payload.cpf) : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        cpf: true,
        birthDate: true,
        phone: true,
        country: true,
        state: true,
        city: true,
        address: true,
        postalCode: true,
        nationality: true,
        gender: true,
        avatarUrl: true,
        emailVerified: true,
        role: true,
        status: true,
        wallet: {
          select: {
            balance: true,
            currency: true,
          },
        },
      },
    });

    return {
      ...updated,
      profileComplete: !!updated.cpf && !!updated.birthDate,
    };
  }

  async listMyBets(userId: string) {
    const bets = await this.prisma.bet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        items: {
          include: {
            odd: {
              include: {
                market: {
                  include: {
                    event: {
                      include: {
                        duels: {
                          orderBy: { startsAt: 'asc' },
                          select: {
                            id: true,
                            startsAt: true,
                            bookingCloseAt: true,
                            status: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return bets.map((bet) => ({
      id: bet.id,
      stake: Number(bet.stake),
      potentialWin: Number(bet.potentialWin),
      status: bet.status,
      createdAt: bet.createdAt,
      items: bet.items.map((item) => {
        const event = item.odd.market.event;
        const duels = [...event.duels].sort(
          (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
        );
        const nearest = duels.reduce<{
          id: string;
          index: number;
          status: string;
        } | null>((best, duel, index) => {
          const diff = Math.abs(
            duel.startsAt.getTime() - bet.createdAt.getTime(),
          );
          if (!best) return { id: duel.id, index, status: duel.status };
          const bestDiff = Math.abs(
            duels[best.index].startsAt.getTime() - bet.createdAt.getTime(),
          );
          return diff < bestDiff
            ? { id: duel.id, index, status: duel.status }
            : best;
        }, null);

        return {
          id: item.id,
          oddAtPlacement: Number(item.oddAtPlacement),
          oddLabel: item.odd.label,
          eventId: item.odd.market.eventId,
          marketName: item.odd.market.name,
          eventName: item.odd.market.event.name,
          duelId: nearest?.id ?? null,
          stageLabel: nearest
            ? `Etapa ${nearest.index + 1}`
            : 'Etapa não identificada',
          duelStatus: nearest?.status ?? null,
        };
      }),
    }));
  }

  async listMyTransactions(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, balance: true, currency: true },
    });

    if (!wallet) {
      return {
        wallet: { balance: 0, currency: 'BRL' },
        ledger: [],
        payments: [],
      };
    }

    const [ledger, payments] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return {
      wallet: { balance: Number(wallet.balance), currency: wallet.currency },
      ledger: ledger.map((item) => ({
        id: item.id,
        type: item.type,
        amount: Number(item.amount),
        reference: item.reference,
        createdAt: item.createdAt,
      })),
      payments: payments.map((item) => ({
        id: item.id,
        type: item.type,
        amount: Number(item.amount),
        provider: item.provider,
        status: item.status,
        createdAt: item.createdAt,
      })),
    };
  }

  private buildAuthUserPayload(
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
      emailVerified: boolean;
      cpf: string | null;
      birthDate: Date | null;
      wallet?: { balance: unknown } | null;
    },
  ) {
    const b = user.wallet?.balance;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      profileComplete: !!user.cpf && !!user.birthDate,
      walletBalance: b !== undefined && b !== null ? Number(b) : 0,
    };
  }

  private async issueToken(
    userId: string,
    email: string,
    role: string,
    userPayload: Record<string, unknown>,
  ) {
    const accessToken = await this.jwtService.signAsync({
      sub: userId,
      email,
      role,
    });

    return {
      accessToken,
      user: userPayload,
    };
  }

  private normalizeCpf(cpf: string) {
    const normalized = cpf.replace(/\D/g, '');
    if (!/^\d{11}$/.test(normalized)) {
      throw new BadRequestException('CPF inválido');
    }
    return normalized;
  }

  private isAdult(birthDate: string | Date) {
    const dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) {
      throw new BadRequestException('Data de nascimento inválida');
    }

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age >= 18;
  }
}
