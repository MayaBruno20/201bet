import {
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentStatus, PaymentType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PaymentsService } from './payments.service';

/** Extrai pix_id de variantes comuns do payload Valut (camel/snake e nested). */
export function extractValutPixId(body: Record<string, unknown>): string | undefined {
  const candidates: unknown[] = [
    body.pixId,
    body.pix_id,
    body.pixQrCodeId,
    body.pix_qr_code_id,
  ];
  const data = body.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    candidates.push(nested.pixId, nested.pix_id, nested.pixQrCodeId, nested.pix_qr_code_id);
  }
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return undefined;
}

export function extractValutStatus(body: Record<string, unknown>): string {
  const raw = body.status ?? body.Status;
  if (typeof raw === 'string') return raw.trim().toLowerCase();
  const data = body.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = (data as Record<string, unknown>).status;
    if (typeof nested === 'string') return nested.trim().toLowerCase();
  }
  return '';
}

@SkipThrottle()
@Controller('webhooks/valut')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async handleWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authHeader?: string,
  ) {
    const webhookSecret = process.env.VALUT_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'VALUT_WEBHOOK_SECRET não configurado',
      );
    }

    if (!authHeader) {
      throw new UnauthorizedException('Authorization obrigatório no webhook');
    }

    const token = authHeader.replace(/^(Basic|Bearer)\s+/i, '');
    if (token !== webhookSecret) {
      throw new UnauthorizedException('Webhook secret inválido');
    }

    this.logger.log(
      'Valut webhook recebido (payload omitido em log por segurança)',
    );

    const pixId = extractValutPixId(body);
    const status = extractValutStatus(body);

    if (!pixId) {
      this.logger.warn('Webhook sem pixId/pix_id, ignorando');
      return { received: true };
    }

    const payment = await this.paymentsService.findPaymentByProviderRef(pixId);
    if (!payment || (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.UNKNOWN)) {
      return { received: true };
    }

    // PIX Cashin (deposit) — pix_receber event
    // CRITICO: SO credita em status terminal "paid"/"completed". "processing" significa que o
    // banco ainda nao confirmou a transferencia - se confirmar credit a wallet
    // antes da hora, podemos perder dinheiro se o PIX falhar/cancelar depois.
    if (
      payment.type === PaymentType.DEPOSIT &&
      (status === 'paid' || status === 'completed')
    ) {
      this.logger.log(`Confirming deposit ${payment.id} via webhook`);
      await this.paymentsService.confirmDeposit(payment.id);
      return { received: true, action: 'deposit_confirmed' };
    }
    if (payment.type === PaymentType.DEPOSIT && status === 'processing') {
      this.logger.log(`Deposit ${payment.id} marked as processing (wallet NAO creditado ate confirmacao final)`);
      return { received: true, action: 'deposit_processing_noted' };
    }
    if (payment.type === PaymentType.DEPOSIT && status) {
      this.logger.warn(`Deposit webhook status inesperado paymentId=${payment.id} status=${status}`);
    }

    // PIX Cashout (withdrawal) — pix_pagar event
    // Captura receiver.document (CPF/CNPJ do destinatário) para auditoria.
    const receiver = (body.receiver ?? body.payerReceiver ?? body.PayerReceiver) as
      | { document?: string }
      | undefined;
    const receiverDocument = typeof receiver?.document === 'string' ? receiver.document : null;

    if (
      payment.type === PaymentType.WITHDRAW &&
      (status === 'completed' || status === 'paid')
    ) {
      this.logger.log(`Confirming withdrawal ${payment.id} via webhook`);
      const updated = await this.prisma.payment.updateMany({
        // Aceita confirmar tanto saques que estavam PENDING (await admin) quanto
        // UNKNOWN (já enviados ao gateway e aguardando confirmação).
        where: {
          id: payment.id,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] },
        },
        data: {
          status: PaymentStatus.APPROVED,
          ...(receiverDocument ? { receiverDocument } : {}),
        },
      });
      if (updated.count === 0) {
        return { received: true, action: 'withdrawal_already_final' };
      }
      return { received: true, action: 'withdrawal_confirmed' };
    }

    // Persiste receiver.document mesmo em estados intermediários, para auditoria.
    if (payment.type === PaymentType.WITHDRAW && receiverDocument) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { receiverDocument },
      });
    }

    return { received: true };
  }
}
