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

    try {
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

      return {
        paymentId: payment.id,
        status: payment.status,
        paid: pix.paid,
        amount: Number(payment.amount),
      };
    } catch {
      return {
        paymentId: payment.id,
        status: payment.status,
        amount: Number(payment.amount),
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

    const amount = new Prisma.Decimal(payload.amount);
    const amountCents = Math.round(payload.amount * 100);

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
      // Rollback: refund wallet and mark payment as failed
      this.logger.error(
        `Valut cashout failed for payment ${result.id}, refunding wallet`,
        err,
      );
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
      throw new BadRequestException(
        'Falha ao processar saque. Saldo foi devolvido.',
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
      createdAt: p.createdAt,
    }));
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
