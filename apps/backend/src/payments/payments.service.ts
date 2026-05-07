import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  PaymentType,
  Prisma,
  WalletTransactionType,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ValutService } from './valut.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateWithdrawDto, PixKeyType } from './dto/create-withdraw.dto';
import { normalizeBrazilPixPhoneKey } from './pix-phone-key';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private reconciliationTicker?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly valut: ValutService,
  ) {}

  onModuleInit() {
    // Reconciliação automática defensiva (evita PENDING/UNKNOWN infinito)
    // - Depósitos PENDING: se Valut diz paid, credita
    // - Saques PENDING/UNKNOWN com providerRef: se Valut diz paid/completed, aprova; se falhou, reembolsa
    const intervalMs = Number(process.env.PAYMENTS_RECONCILIATION_INTERVAL_MS ?? '60000');
    if (Number.isFinite(intervalMs) && intervalMs >= 10_000) {
      this.reconciliationTicker = setInterval(() => {
        void this.safeReconcile();
      }, intervalMs);
    }
  }

  onModuleDestroy() {
    if (this.reconciliationTicker) clearInterval(this.reconciliationTicker);
  }

  /**
   * Create a deposit: generates a PIX QR code via Valut.
   * Wallet is NOT credited yet — only when webhook confirms payment.
   */
  async createDeposit(userId: string, payload: CreateDepositDto) {
    this.logger.log(
      `createDeposit start userId=${userId} amount=${payload.amount}`,
    );
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Carteira não encontrada');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cpf: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.cpf) {
      throw new BadRequestException(
        'Conclua CPF e data de nascimento (Completar cadastro) antes de depositar.',
      );
    }

    const amountCents = Math.round(payload.amount * 100);
    const idempotencyKey = `dep-${userId}-${Date.now()}`;
    const externalId = `deposit-${userId}-${Date.now()}`;

    // Create pending payment record
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        type: PaymentType.DEPOSIT,
        amount: new Prisma.Decimal(payload.amount),
        status: PaymentStatus.PENDING,
        provider: 'VALUT_PIX',
      },
    });
    this.logger.log(
      `createDeposit payment created id=${payment.id} status=${payment.status}`,
    );

    try {
      this.logger.log(`createDeposit calling Valut createPixQrCode paymentId=${payment.id}`);
      const pix = await this.valut.createPixQrCode({
        amountCents,
        externalId: payment.id,
        documentValidation: user.cpf,
        idempotencyKey,
      });

      // Store Valut pix_id as providerRef
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerRef: pix.pix_id },
      });
      this.logger.log(
        `createDeposit success paymentId=${payment.id} pixId=${pix.pix_id}`,
      );

      return {
        paymentId: payment.id,
        pixId: pix.pix_id,
        qrcode: pix.qrcode,
        base64: pix.base64,
        amount: payload.amount,
        expirationDate: pix.expiration_date,
        status: 'PENDING',
        balance: Number(wallet.balance),
      };
    } catch (err) {
      this.logger.error(
        `createDeposit failed paymentId=${payment.id} err=${err instanceof Error ? err.message : String(err)}`,
      );
      // Mark payment as failed if Valut call fails
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw err;
    }
  }

  /**
   * Check deposit status by polling Valut QR code.
   */
  async checkDepositStatus(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId, type: PaymentType.DEPOSIT },
    });
    if (!payment) throw new NotFoundException('Depósito não encontrado');

    if (payment.status !== 'PENDING' || !payment.providerRef) {
      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
      return {
        paymentId: payment.id,
        status: payment.status,
        amount: Number(payment.amount),
        balance: Number(wallet?.balance ?? 0),
      };
    }

    try {
      const pix = await this.valut.getPixQrCode(payment.providerRef);

      if (pix.paid && payment.status === 'PENDING') {
        return this.confirmDeposit(payment.id, userId);
      }

      // Sempre retorna balance atual para frontend nao mostrar "Confirmado, R$0"
      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
      return {
        paymentId: payment.id,
        status: payment.status,
        paid: pix.paid,
        amount: Number(payment.amount),
        balance: Number(wallet?.balance ?? 0),
      };
    } catch {
      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
      return {
        paymentId: payment.id,
        status: payment.status,
        amount: Number(payment.amount),
        balance: Number(wallet?.balance ?? 0),
      };
    }
  }

  /**
   * Confirm deposit — credits wallet. Called by webhook or polling.
   */
  async confirmDeposit(paymentId: string, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: {
          id: paymentId,
          status: PaymentStatus.PENDING,
          type: PaymentType.DEPOSIT,
          ...(userId ? { userId } : {}),
        },
        data: { status: PaymentStatus.APPROVED },
      });

      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new NotFoundException('Pagamento não encontrado');

      if (userId && payment.userId !== userId) {
        throw new NotFoundException('Pagamento não encontrado');
      }

      if (claimed.count === 0) {
        const wallet = await tx.wallet.findUnique({
          where: { userId: payment.userId },
        });
        return {
          paymentId,
          status: payment.status,
          balance: Number(wallet?.balance ?? 0),
        };
      }

      const amount = payment.amount;

      const wallet = await tx.wallet.findUnique({
        where: { userId: payment.userId },
      });
      if (!wallet) throw new NotFoundException('Carteira não encontrada');

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.DEPOSIT,
          amount,
          reference: `valut-pix-${payment.providerRef ?? paymentId}`,
        },
      });

      const updatedWallet = await tx.wallet.findUnique({
        where: { id: wallet.id },
      });

      return {
        paymentId,
        status: 'APPROVED',
        amount: Number(amount),
        balance: Number(updatedWallet!.balance),
      };
    });
  }

  /**
   * Find payment by Valut pix_id (providerRef). Used by webhook.
   */
  async findPaymentByProviderRef(providerRef: string) {
    return this.prisma.payment.findFirst({
      // providerRef é pix_id da Valut (não deve ser sentinela/erro)
      where: { provider: 'VALUT_PIX', providerRef },
    });
  }

  /**
   * Create a withdrawal: deducts wallet and sends PIX cashout via Valut.
   */
  async createWithdraw(userId: string, payload: CreateWithdrawDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Carteira não encontrada');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cpf: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.cpf) {
      throw new BadRequestException(
        'Conclua CPF e data de nascimento (Completar cadastro) antes de sacar.',
      );
    }

    // AML: requer pelo menos 1 deposito APPROVED antes de sacar
    const confirmedDeposits = await this.prisma.payment.count({
      where: { userId, type: PaymentType.DEPOSIT, status: PaymentStatus.APPROVED },
    });
    if (confirmedDeposits === 0) {
      throw new BadRequestException(
        'Voce precisa fazer pelo menos 1 deposito confirmado antes de solicitar saque.',
      );
    }

    const amount = new Prisma.Decimal(payload.amount);
    const amountCents = Math.round(payload.amount * 100);

    const pixKeyResolved =
      payload.pixKeyType === PixKeyType.PHONE
        ? normalizeBrazilPixPhoneKey(payload.pixKey)
        : payload.pixKey.trim();

    // Auto-hold para valores acima do threshold (review manual pelo admin)
    const autoHoldThreshold = Number(process.env.WITHDRAW_AUTO_HOLD_THRESHOLD ?? '5000');
    const requiresManualReview = payload.amount >= autoHoldThreshold;

    // Bloqueia duplicidade: 1 saque pendente/incerto por vez por usuário
    const pendingWithdrawals = await this.prisma.payment.count({
      where: {
        userId,
        type: PaymentType.WITHDRAW,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] },
      },
    });
    if (pendingWithdrawals > 0) {
      throw new BadRequestException(
        'Você já possui um saque pendente. Aguarde a confirmação antes de solicitar um novo.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const dec = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });

      if (dec.count === 0) {
        throw new BadRequestException('Saldo insuficiente para saque');
      }

      const payment = await tx.payment.create({
        data: {
          userId,
          type: PaymentType.WITHDRAW,
          amount,
          status: PaymentStatus.PENDING,
          provider: 'VALUT_PIX',
          // Para valores >= threshold, marcamos para review manual via providerRef temporario
          providerRef: requiresManualReview ? 'PENDING_MANUAL_REVIEW' : null,
          // Persiste destino do PIX para review manual e retry posterior
          pixKey: pixKeyResolved,
          pixKeyType: payload.pixKeyType,
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.WITHDRAW,
          amount: amount.neg(),
          reference: `valut-cashout-${payment.id}`,
        },
      });

      return payment;
    });

    // Se requer review manual, NAO chama Valut. Admin precisa aprovar antes.
    if (requiresManualReview) {
      this.logger.log(`Withdraw ${result.id} held for manual review (amount R$${payload.amount} >= threshold R$${autoHoldThreshold})`);
      const updatedWallet = await this.prisma.wallet.findUnique({ where: { userId } });
      return {
        paymentId: result.id,
        amount: Number(amount),
        status: 'PENDING_MANUAL_REVIEW',
        balance: Number(updatedWallet!.balance),
        message: `Saque acima de R$ ${autoHoldThreshold.toFixed(2)} requer aprovacao manual. Aguarde contato do suporte.`,
      };
    }

    try {
      const pix = await this.valut.performPixCashout({
        amountCents,
        keyType: payload.pixKeyType,
        key: pixKeyResolved,
        externalId: result.id,
        documentValidation: user.cpf,
        idempotencyKey: `wd-${result.id}`,
      });

      await this.prisma.payment.update({
        where: { id: result.id },
        data: { providerRef: pix.pix_id },
      });
    } catch (err) {
      // ROBUSTEZ: NUNCA reembolsa automaticamente em erro do gateway.
      // Em integrações reais, até 4xx pode acontecer após o gateway ter processado o envio.
      // Reembolsar aqui abre brecha de "PIX caiu + saldo voltou".
      this.logger.error(
        `Valut error on withdraw ${result.id}. Marking as UNKNOWN and keeping funds held.`,
        err,
      );
      await this.prisma.payment.update({
        where: { id: result.id },
        data: { status: PaymentStatus.UNKNOWN },
      }).catch(() => undefined);
      await this.prisma.auditLog.create({
        data: {
          actorUserId: userId,
          action: 'WITHDRAW_GATEWAY_ERROR_HELD',
          entity: 'Payment',
          entityId: result.id,
          payload: {
            message: err instanceof Error ? err.message : String(err),
            amount: Number(amount),
          } as unknown as Prisma.InputJsonValue,
        },
      }).catch(() => undefined);
      throw new BadRequestException(
        'Saque em análise por instabilidade no gateway. Seu saldo foi retido com segurança. Aguarde a confirmação — se não receber em 1h, contate o suporte.',
      );
    }

    const updatedWallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    return {
      paymentId: result.id,
      amount: Number(amount),
      status: 'PENDING',
      balance: Number(updatedWallet!.balance),
    };
  }

  async listWithdrawals(userId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { userId, type: PaymentType.WITHDRAW },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      status: p.status,
      providerRef: p.providerRef,
      createdAt: p.createdAt,
    }));
  }

  // ── Admin: review de saques pendentes ───────────────────────

  async adminListPendingWithdrawals() {
    const payments = await this.prisma.payment.findMany({
      where: { type: PaymentType.WITHDRAW, status: { in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] } },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, name: true, cpf: true } } },
      take: 100,
    });
    return payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      status: p.status,
      providerRef: p.providerRef,
      createdAt: p.createdAt,
      requiresManualReview: p.providerRef === 'PENDING_MANUAL_REVIEW',
      user: p.user,
    }));
  }

  async adminApproveWithdraw(paymentId: string, adminUserId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.type !== PaymentType.WITHDRAW) throw new NotFoundException('Saque não encontrado');
    if (![PaymentStatus.PENDING, PaymentStatus.UNKNOWN].includes(payment.status)) {
      throw new BadRequestException('Saque não está pendente');
    }
    if (payment.providerRef !== 'PENDING_MANUAL_REVIEW') {
      throw new BadRequestException('Saque não requer review manual');
    }
    if (!payment.pixKey || !payment.pixKeyType) {
      throw new BadRequestException('Saque não tem chave PIX cadastrada (registro antigo). Rejeite e peça ao usuário criar nova solicitação.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payment.userId }, select: { cpf: true } });
    if (!user?.cpf) throw new BadRequestException('Usuario sem CPF para validacao Valut');

    const amountCents = Math.round(Number(payment.amount) * 100);
    const pixKeyResolved =
      payment.pixKeyType === 'phone'
        ? normalizeBrazilPixPhoneKey(payment.pixKey)
        : payment.pixKey.trim();
    let pixId: string;
    try {
      const pix = await this.valut.performPixCashout({
        amountCents,
        keyType: payment.pixKeyType as 'document' | 'phone' | 'email' | 'evp',
        key: pixKeyResolved,
        externalId: payment.id,
        documentValidation: user.cpf,
        idempotencyKey: `wd-manual-${payment.id}`,
      });
      pixId = pix.pix_id;
    } catch (err) {
      if (err instanceof ValutRejectedError) {
        // Rejeicao definitiva pelo gateway - reembolsa
        const fullUser = await this.prisma.user.findUnique({ where: { id: payment.userId }, include: { wallet: true } });
        if (fullUser?.wallet) {
          await this.prisma.$transaction(async (tx) => {
            await tx.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.FAILED, providerRef: `valut-rejected-on-approve-${adminUserId}` } });
            await tx.wallet.update({ where: { id: fullUser.wallet!.id }, data: { balance: { increment: payment.amount } } });
            await tx.walletTransaction.create({
              data: {
                walletId: fullUser.wallet!.id,
                type: WalletTransactionType.ADJUSTMENT,
                amount: payment.amount,
                reference: `withdraw-rejected-on-approve-${paymentId}`,
              },
            });
          });
        }
        throw new BadRequestException(`Gateway rejeitou: ${err.message}. Saque revertido e usuário reembolsado.`);
      }
      // Network/timeout: NAO mexe no estado, fica PENDING para retry
      this.logger.error(`Valut UNKNOWN state on approve ${paymentId}`, err);
      throw new BadRequestException('Falha de rede com gateway. Tente novamente em alguns minutos.');
    }

    // Importante: APPROVED aqui significa "enviado ao gateway".
    // O estado terminal deve ser confirmado via webhook/reconciliação.
    await this.prisma.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.UNKNOWN, providerRef: pixId } });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action: 'WITHDRAW_MANUAL_APPROVE',
        entity: 'Payment',
        entityId: paymentId,
        payload: { amount: Number(payment.amount), pixId } as Prisma.InputJsonValue,
      },
    }).catch(() => undefined);
    return { id: paymentId, status: 'APPROVED', pixId };
  }

  async adminRejectWithdraw(paymentId: string, adminUserId: string, reason?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { user: { include: { wallet: true } } } });
    if (!payment || payment.type !== PaymentType.WITHDRAW) throw new NotFoundException('Saque não encontrado');
    if (payment.status !== PaymentStatus.PENDING) throw new BadRequestException('Saque não está pendente');
    if (!payment.user.wallet) throw new NotFoundException('Carteira não encontrada');

    // Refunda saldo do usuario
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.FAILED, providerRef: `rejected-by-${adminUserId}` },
      });
      await tx.wallet.update({
        where: { id: payment.user.wallet!.id },
        data: { balance: { increment: payment.amount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: payment.user.wallet!.id,
          type: WalletTransactionType.ADJUSTMENT,
          amount: payment.amount,
          reference: `withdraw-rejected-${paymentId}`,
        },
      });
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action: 'WITHDRAW_REJECT',
        entity: 'Payment',
        entityId: paymentId,
        payload: { amount: Number(payment.amount), reason: reason ?? null } as Prisma.InputJsonValue,
      },
    }).catch(() => undefined);
    return { id: paymentId, status: 'FAILED', refunded: true };
  }

  async getDepositSummary(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Carteira não encontrada');

    const confirmedDeposits = await this.prisma.payment.aggregate({
      where: {
        userId,
        type: PaymentType.DEPOSIT,
        status: PaymentStatus.APPROVED,
      },
      _sum: { amount: true },
    });

    return {
      balance: Number(wallet.balance),
      currency: wallet.currency,
      confirmedDeposits: Number(confirmedDeposits._sum.amount ?? 0),
    };
  }

  // ── Reconciliação ───────────────────────────────────────────────

  private async safeReconcile() {
    try {
      await this.reconcileOnce();
    } catch (e) {
      this.logger.error(`Payments reconciliation failed`, e instanceof Error ? e.stack : e);
    }
  }

  private async reconcileOnce() {
    // 1) Deposits pending: if paid, confirm (idempotent)
    const pendingDeposits = await this.prisma.payment.findMany({
      where: {
        type: PaymentType.DEPOSIT,
        status: PaymentStatus.PENDING,
        provider: 'VALUT_PIX',
        providerRef: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const p of pendingDeposits) {
      if (!p.providerRef) continue;
      try {
        const pix = await this.valut.getPixQrCode(p.providerRef);
        if (pix.paid) {
          await this.confirmDeposit(p.id).catch(() => undefined);
        }
      } catch {
        // ignore and retry next tick
      }
    }

    // 2) Withdrawals pending/unknown with providerRef: fetch status and close/refund
    const pendingWithdrawals = await this.prisma.payment.findMany({
      where: {
        type: PaymentType.WITHDRAW,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] },
        provider: 'VALUT_PIX',
        providerRef: { not: null },
        NOT: { providerRef: 'PENDING_MANUAL_REVIEW' },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const p of pendingWithdrawals) {
      if (!p.providerRef) continue;
      try {
        const cashout = await this.valut.getPixCashout(p.providerRef);
        const st = (cashout.status || '').toLowerCase();
        if (st === 'paid' || st === 'completed') {
          await this.prisma.payment.updateMany({
            where: { id: p.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] } },
            data: { status: PaymentStatus.APPROVED },
          });
          continue;
        }
        if (st === 'failed' || st === 'canceled' || st === 'cancelled' || st === 'rejected') {
          await this.refundFailedWithdraw(p.id, 'reconcile-failed');
        }
      } catch {
        // ignore and retry
      }
    }
  }

  private async refundFailedWithdraw(paymentId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment || payment.type !== PaymentType.WITHDRAW) return;
      // claim
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] } },
        data: { status: PaymentStatus.FAILED, providerRef: `${payment.providerRef ?? ''}` },
      });
      if (claimed.count === 0) return;
      const wallet = await tx.wallet.findUnique({ where: { userId: payment.userId } });
      if (!wallet) return;
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: payment.amount } } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.ADJUSTMENT,
          amount: payment.amount,
          reference: `cashout-refund-${paymentId}-${reason}`,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: 'WITHDRAW_RECONCILE_REFUND',
          entity: 'Payment',
          entityId: paymentId,
          payload: { reason } as unknown as Prisma.InputJsonValue,
        },
      }).catch(() => undefined);
    });
  }
}
