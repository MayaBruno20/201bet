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

    const pixId = body.pixId as string | undefined;
    const status = body.status as string | undefined;

    if (!pixId) {
      this.logger.warn('Webhook sem pixId, ignorando');
      return { received: true };
    }

    const payment = await this.paymentsService.findPaymentByProviderRef(pixId);
    if (!payment || payment.status !== 'PENDING') {
      return { received: true };
    }

    // PIX Cashin (deposit) — pix_receber event
    // CRITICO: SO credita em status terminal "paid". "processing" significa que o
    // banco ainda nao confirmou a transferencia - se confirmar credit a wallet
    // antes da hora, podemos perder dinheiro se o PIX falhar/cancelar depois.
    if (
      payment.type === PaymentType.DEPOSIT &&
      status === 'paid'
    ) {
      this.logger.log(`Confirming deposit ${payment.id} via webhook`);
      await this.paymentsService.confirmDeposit(payment.id);
      return { received: true, action: 'deposit_confirmed' };
    }
    if (payment.type === PaymentType.DEPOSIT && status === 'processing') {
      this.logger.log(`Deposit ${payment.id} marked as processing (wallet NAO creditado ate confirmacao final)`);
      return { received: true, action: 'deposit_processing_noted' };
    }

    // PIX Cashout (withdrawal) — pix_pagar event
    if (
      payment.type === PaymentType.WITHDRAW &&
      (status === 'completed' || status === 'paid')
    ) {
      this.logger.log(`Confirming withdrawal ${payment.id} via webhook`);
      const updated = await this.prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.APPROVED },
      });
      if (updated.count === 0) {
        return { received: true, action: 'withdrawal_already_final' };
      }
      return { received: true, action: 'withdrawal_confirmed' };
    }

    return { received: true };
  }
}
