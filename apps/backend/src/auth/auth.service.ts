import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BetStatus, VerificationTokenType } from '@prisma/client';
import { HOUSE_MARGIN_PERCENT } from '../market.service';
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
import { AdminSessionService } from './admin-session.service';
import { LoginAttemptService } from './login-attempt.service';
import { SecurityPolicyService } from './security-policy.service';
import { isValidCpf } from '../common/validators/cpf.validator';
import * as bcrypt from 'bcrypt';

export type AdminLoginContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

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
    private readonly adminSessions: AdminSessionService,
    private readonly loginAttempts: LoginAttemptService,
    private readonly securityPolicy: SecurityPolicyService,
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
    const cpf = payload.cpf ? this.normalizeCpf(payload.cpf) : null;

    if (payload.password !== payload.confirmPassword) {
      throw new BadRequestException('Senha e confirmação não conferem');
    }

    // Idade so e exigida se birthDate foi informado
    if (payload.birthDate && !this.isAdult(payload.birthDate)) {
      throw new BadRequestException(
        'Cadastro permitido apenas para maiores de 18 anos',
      );
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('E-mail já cadastrado');
    }
    if (cpf) {
      const existingCpf = await this.prisma.user.findUnique({ where: { cpf } });
      if (existingCpf) {
        throw new BadRequestException('CPF já cadastrado');
      }
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const promoCode = payload.promoCode?.trim().toLowerCase() || null;

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name: payload.name.trim(),
          cpf,
          birthDate: payload.birthDate ? new Date(payload.birthDate) : null,
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

      // Inscrição na campanha promocional (QR do panfleto). Código inválido/expirado
      // é ignorado em silêncio — nunca bloqueia o cadastro. O bônus só é creditado
      // no primeiro depósito qualificado (ver PaymentsService.confirmDeposit).
      if (promoCode) {
        const campaign = await tx.promoCampaign.findFirst({
          where: { code: promoCode, active: true },
          select: { id: true },
        });
        if (campaign) {
          await tx.promoEnrollment.create({
            data: { campaignId: campaign.id, userId: created.id },
          });
        }
      }

      return created;
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

    // SECURITY: rejeitar contas Google com email nao verificado (previne takeover)
    if (ticketPayload.email_verified !== true) {
      throw new UnauthorizedException('E-mail Google não verificado pelo Google');
    }

    const email = ticketPayload.email.toLowerCase().trim();
    const displayName =
      ticketPayload.name ?? email.split('@')[0] ?? 'Usuário Google';

    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
        include: { wallet: true },
      });
      if (existing) {
        if (existing.status === 'BANNED') {
          throw new UnauthorizedException('Conta suspensa');
        }
        // SECURITY: conta com googleSub diferente = takeover attempt
        if (existing.googleSub && existing.googleSub !== ticketPayload.sub) {
          throw new UnauthorizedException('Esta conta Google nao corresponde ao registro vinculado');
        }
        // SECURITY: conta SEM googleSub = registrada via senha. Bloqueia auto-link
        // para impedir que alguem com Google da mesma email assuma a conta sem provar a senha.
        if (!existing.googleSub) {
          throw new UnauthorizedException(
            'Já existe uma conta com este e-mail. Faça login com sua senha cadastrada e vincule o Google em Minha conta.',
          );
        }
        // Conta com mesmo googleSub - login normal
        const updated = await tx.user.update({
          where: { id: existing.id },
          data: {
            status: existing.status === 'ACTIVE' ? 'ACTIVE' : existing.status,
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
      cpfValid: isValidCpf(user.cpf),
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
      // CPF só é editável para CORRIGIR um CPF inválido. Uma vez válido, fica
      // travado (alteração só via suporte/admin) — evita troca de identidade.
      if (row?.cpf && isValidCpf(row.cpf)) {
        throw new BadRequestException(
          'Seu CPF já está validado e não pode ser alterado. Fale com o suporte se precisar corrigir.',
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
      cpfValid: isValidCpf(updated.cpf),
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

    // Potencial ATUAL pelo rateio ao vivo (bilhetes ABERTOS). Substitui a "odd
    // travada" no display por um retorno potencial honesto (pari-mutuel) — que é
    // como o pagamento é de fato calculado no fechamento. Mostrar a odd do
    // momento da aposta enganava (apostador esperava odd X e recebia o rateio).
    const openMarketIds = [
      ...new Set(
        bets
          .filter((b) => b.status === BetStatus.OPEN)
          .flatMap((b) => b.items.map((it) => it.odd.market.id)),
      ),
    ];
    const poolByOdd = new Map<string, number>();
    const totalByMarket = new Map<string, number>();
    if (openMarketIds.length) {
      const rows = await this.prisma.betItem.findMany({
        where: { bet: { status: BetStatus.OPEN }, odd: { marketId: { in: openMarketIds } } },
        select: {
          oddId: true,
          bet: { select: { stake: true } },
          odd: { select: { marketId: true } },
        },
      });
      for (const r of rows) {
        const stake = Number(r.bet.stake);
        poolByOdd.set(r.oddId, (poolByOdd.get(r.oddId) ?? 0) + stake);
        totalByMarket.set(r.odd.marketId, (totalByMarket.get(r.odd.marketId) ?? 0) + stake);
      }
    }
    const currentPotentialFor = (marketId: string, oddId: string, stake: number): number | null => {
      const total = totalByMarket.get(marketId) ?? 0;
      const pool = poolByOdd.get(oddId) ?? 0;
      if (pool <= 0 || total <= 0) return null;
      const net = total * (1 - HOUSE_MARGIN_PERCENT / 100);
      const odd = Math.max(1, net / pool); // piso 1.0 — mesmo do settlement
      return Number((stake * odd).toFixed(2));
    };

    return bets.map((bet) => ({
      id: bet.id,
      stake: Number(bet.stake),
      potentialWin: Number(bet.potentialWin),
      // Retorno potencial pelo rateio atual (só p/ ABERTOS). Null quando o
      // mercado ainda não tem pote — o front cai no rótulo "definido no rateio".
      currentPotential:
        bet.status === BetStatus.OPEN && bet.items[0]
          ? currentPotentialFor(bet.items[0].odd.market.id, bet.items[0].oddId, Number(bet.stake))
          : null,
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
          oddId: item.oddId,
          oddAtPlacement: Number(item.oddAtPlacement),
          oddLabel: item.odd.label,
          eventId: item.odd.market.eventId,
          marketId: item.odd.market.id,
          marketName: item.odd.market.name,
          marketType: item.odd.market.type,
          // Chave (A-E) do piloto — usado no resorteio pra contar picks por chave.
          bracketKey: item.odd.bracketKey ?? null,
          eventName: item.odd.market.event.name,
          duelId: nearest?.id ?? null,
          stageLabel: nearest
            ? `Rodada ${nearest.index + 1}`
            : 'Rodada não identificada',
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
      cpfValid: isValidCpf(user.cpf),
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

  /**
   * Login exclusivo do painel admin. Requer role ADMIN/OPERATOR/AUDITOR e
   * emite um JWT com `scope=admin` que só é aceito pela AdminJwtStrategy.
   *
   * Se o admin tem 2FA ativado, NÃO emite o token final — retorna `requires2FA`
   * + `tempToken` (válido por 5 min, scope=admin-2fa) que deve ser apresentado
   * ao /admin/auth/login/2fa junto com o código TOTP.
   */
  async adminLogin(
    payload: { email: string; password: string },
    ctx: AdminLoginContext = {},
  ) {
    const allowedRoles = new Set(['ADMIN', 'OPERATOR', 'AUDITOR']);
    const email = payload.email.toLowerCase().trim();
    const policy = await this.securityPolicy.get();

    // 1) Bloqueio por excesso de tentativas (per-email + per-IP).
    const recentFails = await this.loginAttempts.recentFailureCount({
      email,
      ipAddress: ctx.ipAddress,
      scope: 'admin',
      windowMinutes: policy.loginAttemptWindowMin,
    });
    if (recentFails >= policy.maxLoginAttempts) {
      await this.loginAttempts.log({
        email, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
        scope: 'admin', success: false, reason: 'rate_limited',
      });
      throw new ForbiddenException(
        `Muitas tentativas de login. Aguarde ${policy.loginAttemptWindowMin} min antes de tentar novamente.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { wallet: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      await this.loginAttempts.log({
        email, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
        scope: 'admin', success: false, reason: 'unknown_user_or_inactive',
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isValidPassword = await bcrypt.compare(payload.password, user.password);
    if (!isValidPassword) {
      await this.loginAttempts.log({
        email, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
        scope: 'admin', success: false, reason: 'invalid_password',
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!allowedRoles.has(user.role)) {
      await this.loginAttempts.log({
        email, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
        scope: 'admin', success: false, reason: 'forbidden_role',
      });
      throw new UnauthorizedException(
        'Sua conta não tem permissão para acessar o painel admin.',
      );
    }

    if (user.twoFactorEnabled) {
      // Senha OK + 2FA pendente: NÃO loga sucesso ainda — só na confirmação 2FA.
      const tempToken = await this.jwtService.signAsync(
        { sub: user.id, email: user.email, role: user.role, scope: 'admin-2fa' },
        { expiresIn: '5m' },
      );
      return { requires2FA: true as const, tempToken };
    }

    // Política `mfaRequired`: senha bate, mas 2FA não está ativo. Bloqueia.
    if (policy.mfaRequired) {
      await this.loginAttempts.log({
        email, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
        scope: 'admin', success: false, reason: 'mfa_required',
      });
      throw new ForbiddenException(
        'Política de segurança exige 2FA ativado para administradores. Acesse pelo dispositivo onde você habilitou 2FA, ou peça a um Super Admin para liberar a política.',
      );
    }

    return this.finalizeAdminLogin(user, ctx, policy);
  }

  /**
   * Segunda etapa do login admin com 2FA. Recebe o tempToken + código TOTP/backup
   * e, se válido, emite o cookie admin definitivo.
   */
  async adminLoginVerify2FA(
    tempToken: string,
    validateChallenge: (userId: string, code: string) => Promise<boolean>,
    code: string,
    ctx: AdminLoginContext = {},
  ) {
    let payload: { sub?: string; email?: string; role?: string; scope?: string };
    try {
      payload = await this.jwtService.verifyAsync(tempToken);
    } catch {
      throw new UnauthorizedException('Sessão de 2FA expirou. Refaça o login.');
    }
    if (payload.scope !== 'admin-2fa' || !payload.sub) {
      throw new UnauthorizedException('Token de 2FA inválido.');
    }

    const ok = await validateChallenge(payload.sub, code);
    if (!ok) {
      await this.loginAttempts.log({
        email: payload.email, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
        scope: 'admin', success: false, reason: 'invalid_2fa',
      });
      throw new UnauthorizedException('Código de 2FA inválido.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { wallet: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Conta indisponível.');
    }

    const policy = await this.securityPolicy.get();
    return this.finalizeAdminLogin(user, ctx, policy);
  }

  /**
   * Cria a AdminSession persistida e assina o JWT com `sid`. A expiração do JWT
   * vem da política `sessionTimeoutHours` (configurável em runtime).
   * Também dispara o LoginAttempt de sucesso.
   */
  private async finalizeAdminLogin(
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
    ctx: AdminLoginContext,
    policy: { sessionTimeoutHours: number },
  ) {
    const session = await this.adminSessions.create(user.id, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await this.loginAttempts.log({
      email: user.email,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      scope: 'admin',
      success: true,
      reason: 'success',
    });

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        scope: 'admin',
        sid: session.id,
      },
      { expiresIn: `${policy.sessionTimeoutHours}h` },
    );

    return {
      requires2FA: false as const,
      accessToken,
      sessionId: session.id,
      user: this.buildAuthUserPayload(user),
    };
  }

  private normalizeCpf(cpf: string) {
    const normalized = cpf.replace(/\D/g, '');
    // isValidCpf cobre tamanho (11), sequência repetida e dígitos verificadores.
    if (!isValidCpf(normalized)) {
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
