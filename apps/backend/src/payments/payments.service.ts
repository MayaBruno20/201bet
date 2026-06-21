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
  WithdrawHoldReason,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ValutRejectedError, ValutService } from './valut.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateWithdrawDto, PixKeyType } from './dto/create-withdraw.dto';
import { normalizeBrazilPixPhoneKey } from './pix-phone-key';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private reconciliationTicker?: NodeJS.Timeout;
  // Guard de idle do reconcile: só consulta o banco quando PODE haver pagamento
  // pendente. Começa true (checa 1x no boot pra pegar pendências pré-existentes);
  // qualquer depósito/saque criado marca true; quando uma checagem não acha nada
  // pendente, volta a false e o ticker para de acordar a Neon.
  // NUNCA abandona um pagamento: enquanto houver pendência, segue ativo.
  private mayHavePending = true;

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
    // Vai gerar um pagamento PENDING → reativa o reconcile (rede de segurança do
    // crédito) mesmo que a Neon estivesse hibernando.
    this.mayHavePending = true;
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
      // Sem document_validation: depósito aceita PIX de qualquer titular.
      // Validação de CPF agora é exclusiva do fluxo de saque.
      const pix = await this.valut.createPixQrCode({
        amountCents,
        externalId: payment.id,
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

      // Bônus de promoção (QR do panfleto): no 1º depósito que atinge o mínimo da
      // campanha, credita o saldo bônus uma única vez. A claim atômica (updateMany
      // gated em PENDING) evita conceder em dobro se dois depósitos confirmarem juntos.
      const enrollment = await tx.promoEnrollment.findUnique({
        where: { userId: payment.userId },
        include: { campaign: true },
      });
      if (
        enrollment &&
        enrollment.bonusStatus === 'PENDING' &&
        Number(amount) >= Number(enrollment.campaign.minDeposit)
      ) {
        const claimedBonus = await tx.promoEnrollment.updateMany({
          where: { id: enrollment.id, bonusStatus: 'PENDING' },
          data: {
            bonusStatus: 'GRANTED',
            bonusAmount: enrollment.campaign.bonusAmount,
            qualifyingPaymentId: paymentId,
            bonusGrantedAt: new Date(),
          },
        });
        if (claimedBonus.count === 1) {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: enrollment.campaign.bonusAmount } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: WalletTransactionType.BONUS,
              amount: enrollment.campaign.bonusAmount,
              reference: `promo-bonus-${enrollment.id}`,
            },
          });
        }
      }

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
    // Saque vira PENDING/UNKNOWN → reativa o reconcile (aprovação/reembolso).
    this.mayHavePending = true;
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

    // Regra de auto-hold:
    //   1. Valor >= threshold (R$ 2000 por padrão)
    //   2. Chave PIX tipo CPF/CNPJ ('document') de número diferente do CPF cadastrado
    // Para chaves não-document (telefone/email/evp), pré-check é impossível: o gateway
    // valida via document_validation e a rejeição vira CPF_MISMATCH (catch abaixo).
    const autoHoldThreshold = Number(process.env.WITHDRAW_AUTO_HOLD_THRESHOLD ?? '2000');
    const overThreshold = payload.amount > autoHoldThreshold;

    const userCpfDigits = user.cpf.replace(/\D/g, '');
    let cpfMismatch = false;
    if (payload.pixKeyType === PixKeyType.DOCUMENT) {
      const destDigits = pixKeyResolved.replace(/\D/g, '');
      cpfMismatch = destDigits !== userCpfDigits;
    }

    const holdReason: WithdrawHoldReason | null = cpfMismatch
      ? WithdrawHoldReason.CPF_MISMATCH
      : overThreshold
        ? WithdrawHoldReason.HIGH_AMOUNT
        : null;
    const requiresManualReview = holdReason !== null;

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
          // Análise manual é sinalizada por `holdReason` (CPF_MISMATCH/HIGH_AMOUNT).
          // NÃO usar sentinela aqui: providerRef tem @@unique([provider, providerRef]),
          // então duas strings iguais ('PENDING_MANUAL_REVIEW') colidem ("Registro duplicado").
          providerRef: null,
          pixKey: pixKeyResolved,
          pixKeyType: payload.pixKeyType,
          holdReason,
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

    if (requiresManualReview) {
      this.logger.log(
        `Withdraw ${result.id} held for manual review (reason=${holdReason} amount=R$${payload.amount} threshold=R$${autoHoldThreshold})`,
      );
      const updatedWallet = await this.prisma.wallet.findUnique({ where: { userId } });
      const message =
        holdReason === WithdrawHoldReason.CPF_MISMATCH
          ? 'Sua chave PIX está em nome de outro CPF. O saque entrou em análise manual e será processado em até 1 dia útil. Para liberação automática, use uma chave vinculada ao mesmo CPF cadastrado na 201bet.'
          : `Saque acima de R$ ${autoHoldThreshold.toFixed(2).replace('.', ',')} entrou em análise manual e será processado em até 1 dia útil.`;
      return {
        paymentId: result.id,
        amount: Number(amount),
        status: 'PENDING_MANUAL_REVIEW',
        holdReason,
        balance: Number(updatedWallet!.balance),
        message,
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

      const receiverDocDigits = (pix.receiver?.document ?? '').replace(/\D/g, '');
      const receiverMismatch = receiverDocDigits.length > 0 && receiverDocDigits !== userCpfDigits;

      await this.prisma.payment.update({
        where: { id: result.id },
        data: {
          providerRef: pix.pix_id,
          receiverDocument: pix.receiver?.document ?? null,
        },
      });

      // Defesa em profundidade: se o gateway aceitou mas o documento divergir, flag manual.
      // O dinheiro pode estar em trânsito; admin avalia e decide reembolsar via rejeição.
      if (receiverMismatch) {
        this.logger.warn(
          `Withdraw ${result.id} accepted by Valut but receiver doc differs (user=${userCpfDigits.slice(-4)} receiver=${receiverDocDigits.slice(-4)}). Flagging manual review.`,
        );
        await this.prisma.payment.update({
          where: { id: result.id },
          data: {
            // flag de análise manual via holdReason; providerRef null (não colide no unique)
            providerRef: null,
            holdReason: WithdrawHoldReason.CPF_MISMATCH,
          },
        });
      }
    } catch (err) {
      // ROBUSTEZ: NUNCA reembolsa automaticamente em erro do gateway.
      // Em integrações reais, até 4xx pode acontecer após o gateway ter processado o envio.
      // Reembolsar aqui abre brecha de "PIX caiu + saldo voltou".
      //
      // Exceção: se o erro 4xx do gateway claramente indica divergência de documento
      // (heurística no texto da mensagem), o cashout NÃO ocorreu de fato — o saque
      // entra em PENDING_MANUAL_REVIEW com holdReason=CPF_MISMATCH e o admin avalia.
      // Para qualquer outro erro (4xx genérico, 5xx, network/timeout), marca UNKNOWN
      // e mantém os fundos retidos até reconciliação via webhook.
      const isDefiniteRejection = err instanceof ValutRejectedError;
      if (isDefiniteRejection) {
        const msg = String(err.message ?? '').toLowerCase();
        const looksLikeDocMismatch =
          /document|cpf|cnpj|titular|holder|divergent|mismatch|owner/i.test(msg);
        if (looksLikeDocMismatch) {
          this.logger.warn(
            `Valut rejected ${result.id} as document mismatch — flagging manual review (no refund).`,
          );
          await this.prisma.payment.update({
            where: { id: result.id },
            data: {
              // flag de análise manual via holdReason; providerRef null (não colide no unique)
              providerRef: null,
              holdReason: WithdrawHoldReason.CPF_MISMATCH,
            },
          });
          const updatedWallet = await this.prisma.wallet.findUnique({ where: { userId } });
          return {
            paymentId: result.id,
            amount: Number(amount),
            status: 'PENDING_MANUAL_REVIEW',
            holdReason: WithdrawHoldReason.CPF_MISMATCH,
            balance: Number(updatedWallet!.balance),
            message:
              'Sua chave PIX está em nome de outro CPF. O saque entrou em análise manual e será processado em até 1 dia útil. Para liberação automática, use uma chave vinculada ao mesmo CPF cadastrado na 201bet.',
          };
        }
      }

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
      holdReason: p.holdReason,
      createdAt: p.createdAt,
    }));
  }

  // ── Admin: review de saques pendentes ───────────────────────

  /**
   * Listagem paginada usada pela aba Financeiro do admin (depósitos + saques).
   * Suporta filtro por status, busca textual em email/nome/pixKey/cpf
   * e paginação simples (offset/limit).
   */
  async adminListPayments(params: {
    type: 'DEPOSIT' | 'WITHDRAW';
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);

    const validStatuses: PaymentStatus[] = ['PENDING', 'APPROVED', 'FAILED', 'CANCELED'];
    const statusFilter =
      params.status && validStatuses.includes(params.status as PaymentStatus)
        ? { status: params.status as PaymentStatus }
        : {};

    const search = params.search?.trim();
    const searchFilter = search
      ? {
          OR: [
            { user: { email: { contains: search, mode: 'insensitive' as const } } },
            { user: { name: { contains: search, mode: 'insensitive' as const } } },
            { user: { cpf: { contains: search.replace(/\D/g, '') } } },
            { pixKey: { contains: search, mode: 'insensitive' as const } },
            { providerRef: { contains: search } },
          ],
        }
      : {};

    const where: Prisma.PaymentWhereInput = {
      type: params.type as PaymentType,
      ...statusFilter,
      ...searchFilter,
    };

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, email: true, name: true, cpf: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      items: items.map((p) => ({
        id: p.id,
        type: p.type,
        amount: Number(p.amount),
        status: p.status,
        provider: p.provider,
        providerRef: p.providerRef,
        pixKey: p.pixKey,
        pixKeyType: p.pixKeyType,
        holdReason: p.holdReason,
        receiverDocument: p.receiverDocument,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        user: p.user,
      })),
      total,
      limit,
      offset,
    };
  }

  /** Resumo agregado de pagamentos para os KPIs da aba Financeiro. */
  async adminPaymentsSummary(hours: number) {
    // hours <= 0 sinaliza "total" — não aplica filtro temporal.
    const dateFilter = hours > 0 ? { createdAt: { gte: new Date(Date.now() - hours * 3_600_000) } } : {};
    const [
      depositsApprovedAgg,
      depositsPendingCount,
      withdrawalsApprovedAgg,
      withdrawalsPendingCount,
      withdrawalsPendingAgg,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { type: PaymentType.DEPOSIT, status: PaymentStatus.APPROVED, ...dateFilter },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.count({
        where: { type: PaymentType.DEPOSIT, status: PaymentStatus.PENDING },
      }),
      this.prisma.payment.aggregate({
        where: { type: PaymentType.WITHDRAW, status: PaymentStatus.APPROVED, ...dateFilter },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.count({
        where: { type: PaymentType.WITHDRAW, status: PaymentStatus.PENDING },
      }),
      this.prisma.payment.aggregate({
        where: { type: PaymentType.WITHDRAW, status: PaymentStatus.PENDING },
        _sum: { amount: true },
      }),
    ]);

    return {
      hours,
      deposits: {
        approvedCount: depositsApprovedAgg._count._all,
        approvedAmount: Number(depositsApprovedAgg._sum.amount ?? 0),
        pendingCount: depositsPendingCount,
      },
      withdrawals: {
        approvedCount: withdrawalsApprovedAgg._count._all,
        approvedAmount: Number(withdrawalsApprovedAgg._sum.amount ?? 0),
        pendingCount: withdrawalsPendingCount,
        pendingAmount: Number(withdrawalsPendingAgg._sum.amount ?? 0),
      },
    };
  }

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
      pixKey: p.pixKey,
      pixKeyType: p.pixKeyType,
      provider: p.provider,
      holdReason: p.holdReason,
      receiverDocument: p.receiverDocument,
      createdAt: p.createdAt,
      // Aguardando análise manual = tem holdReason e ainda NÃO foi enviado ao gateway
      // (providerRef null). Após aprovar, providerRef vira o pix_id (não-null).
      requiresManualReview: p.holdReason !== null && p.providerRef === null,
      user: p.user,
    }));
  }

  async adminApproveWithdraw(paymentId: string, adminUserId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.type !== PaymentType.WITHDRAW) throw new NotFoundException('Saque não encontrado');
    if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.UNKNOWN) {
      throw new BadRequestException('Saque não está pendente');
    }
    if (payment.holdReason === null || payment.providerRef !== null) {
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
    // Admin aprovando CPF_MISMATCH é override consciente: não passa document_validation
    // ao gateway, senão Valut rejeita de novo. Para HIGH_AMOUNT, mantém validação.
    const skipDocValidation = payment.holdReason === WithdrawHoldReason.CPF_MISMATCH;
    let pixId: string;
    let receiverDoc: string | null = null;
    try {
      const pix = await this.valut.performPixCashout({
        amountCents,
        keyType: payment.pixKeyType as 'document' | 'phone' | 'email' | 'evp',
        key: pixKeyResolved,
        externalId: payment.id,
        documentValidation: skipDocValidation ? undefined : user.cpf,
        idempotencyKey: `wd-manual-${payment.id}`,
      });
      pixId = pix.pix_id;
      receiverDoc = pix.receiver?.document ?? null;
    } catch (err) {
      if (err instanceof ValutRejectedError) {
        // Rejeicao definitiva pelo gateway - reembolsa
        const fullUser = await this.prisma.user.findUnique({ where: { id: payment.userId }, include: { wallet: true } });
        if (fullUser?.wallet) {
          await this.prisma.$transaction(async (tx) => {
            await tx.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.FAILED, providerRef: `valut-rejected-on-approve-${paymentId}` } });
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

    // Importante: UNKNOWN aqui significa "enviado ao gateway, aguardando confirmação".
    // O estado APPROVED só vem via webhook quando o PIX foi efetivamente liquidado.
    // `receiverDocument` é persistido aqui para auditoria (resposta síncrona da Valut
    // já traz o doc do destinatário).
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.UNKNOWN,
        providerRef: pixId,
        ...(receiverDoc ? { receiverDocument: receiverDoc } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action: 'WITHDRAW_MANUAL_APPROVE',
        entity: 'Payment',
        entityId: paymentId,
        payload: {
          amount: Number(payment.amount),
          pixId,
          holdReason: payment.holdReason,
          receiverDocument: receiverDoc,
          docValidationSkipped: skipDocValidation,
        } as Prisma.InputJsonValue,
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
        data: { status: PaymentStatus.FAILED, providerRef: `rejected-by-${paymentId}` },
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
    // Sem pendência conhecida → não acorda a Neon. Reativado por createDeposit/
    // createWithdraw e pelo seed do boot. Enquanto houver pendência, segue rodando.
    if (!this.mayHavePending) return;
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
        // Saques em análise manual têm providerRef null (sinalizados por holdReason)
        // e já são excluídos por `not: null` — só reconciliamos os que têm pix_id real.
        providerRef: { not: null },
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

    // Só dorme quando a checagem confirmou ZERO pendências (deposito e saque).
    // Se ainda há algo pendente, mantém ativo para tentar de novo no próximo tick.
    this.mayHavePending = pendingDeposits.length > 0 || pendingWithdrawals.length > 0;
  }

  private async refundFailedWithdraw(paymentId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment || payment.type !== PaymentType.WITHDRAW) return;
      // claim
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] } },
        data: { status: PaymentStatus.FAILED, providerRef: payment.providerRef ?? `reconcile-refund-${paymentId}` },
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
