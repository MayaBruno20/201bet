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
import { ValutService, ValutRejectedError } from './valut.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateWithdrawDto } from './dto/create-withdraw.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly valut: ValutService,
  ) {}

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
      where: { providerRef },
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

    // Auto-hold para valores acima do threshold (review manual pelo admin)
    const autoHoldThreshold = Number(process.env.WITHDRAW_AUTO_HOLD_THRESHOLD ?? '5000');
    const requiresManualReview = payload.amount >= autoHoldThreshold;

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
          pixKey: payload.pixKey,
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
        key: payload.pixKey,
        externalId: result.id,
        documentValidation: user.cpf,
        idempotencyKey: `wd-${result.id}`,
      });

      await this.prisma.payment.update({
        where: { id: result.id },
        data: { providerRef: pix.pix_id },
      });
    } catch (err) {
      // Diferencia rejeicao definitiva (4xx) de timeout/network (estado UNKNOWN)
      const isDefiniteRejection = err instanceof ValutRejectedError;

      if (isDefiniteRejection) {
        // Pode reverter com seguranca
        this.logger.error(`Valut REJECTED payment ${result.id}, refunding wallet`, err);
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: result.id },
            data: { status: PaymentStatus.FAILED },
          });
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: amount } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: WalletTransactionType.ADJUSTMENT,
              amount,
              reference: `cashout-refund-${result.id}`,
            },
          });
        });
        throw new BadRequestException('Saque rejeitado pelo gateway. Saldo devolvido.');
      }

      // Network/timeout: NAO refunda - estado incerto. Mantem PENDING para reconciliacao.
      this.logger.error(
        `Valut UNKNOWN state for payment ${result.id} (network/timeout) - keeping PENDING for reconciliation`,
        err,
      );
      throw new BadRequestException(
        'Saque solicitado mas confirmação demorou. Aguarde — se não receber em 1h, contate o suporte. NÃO tente sacar novamente.',
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
      where: { type: PaymentType.WITHDRAW, status: PaymentStatus.PENDING },
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
    if (payment.status !== PaymentStatus.PENDING) throw new BadRequestException('Saque não está pendente');
    if (payment.providerRef !== 'PENDING_MANUAL_REVIEW') {
      throw new BadRequestException('Saque não requer review manual');
    }
    if (!payment.pixKey || !payment.pixKeyType) {
      throw new BadRequestException('Saque não tem chave PIX cadastrada (registro antigo). Rejeite e peça ao usuário criar nova solicitação.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payment.userId }, select: { cpf: true } });
    if (!user?.cpf) throw new BadRequestException('Usuario sem CPF para validacao Valut');

    const amountCents = Math.round(Number(payment.amount) * 100);
    let pixId: string;
    try {
      const pix = await this.valut.performPixCashout({
        amountCents,
        keyType: payment.pixKeyType as 'document' | 'phone' | 'email' | 'evp',
        key: payment.pixKey,
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

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.APPROVED, providerRef: pixId },
    });
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
}
