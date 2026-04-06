import { Body, Controller, Headers, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PaymentsService } from './payments.service';

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
    const webhookSecret = process.env.VALUT_WEBHOOK_SECRET;
    if (webhookSecret && authHeader) {
      const token = authHeader.replace(/^(Basic|Bearer)\s+/i, '');
      if (token !== webhookSecret) {
        throw new UnauthorizedException('Webhook secret inválido');
      }
    }

    this.logger.log(`Valut webhook received: ${JSON.stringify(body)}`);

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
    if (payment.type === 'DEPOSIT' && (status === 'paid' || status === 'processing')) {
      this.logger.log(`Confirming deposit ${payment.id} via webhook`);
      await this.paymentsService.confirmDeposit(payment.id);
      return { received: true, action: 'deposit_confirmed' };
    }

    // PIX Cashout (withdrawal) — pix_pagar event
    if (payment.type === 'WITHDRAW' && (status === 'completed' || status === 'paid')) {
      this.logger.log(`Confirming withdrawal ${payment.id} via webhook`);
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'APPROVED' },
      });
      return { received: true, action: 'withdrawal_confirmed' };
    }

    return { received: true };
  }
}
