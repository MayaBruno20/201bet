import { UnauthorizedException } from '@nestjs/common';
import { PaymentStatus, PaymentType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PaymentsService } from './payments.service';
import { WebhookController } from './webhook.controller';

describe('WebhookController', () => {
  const originalSecret = process.env.VALUT_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.VALUT_WEBHOOK_SECRET = originalSecret;
  });

  it('rejects when secret is not configured', async () => {
    delete process.env.VALUT_WEBHOOK_SECRET;
    const controller = new WebhookController({} as PaymentsService, {} as PrismaService);
    await expect(controller.handleWebhook({}, undefined)).rejects.toThrow();
  });

  it('rejects when Authorization is missing', async () => {
    process.env.VALUT_WEBHOOK_SECRET = 'shared';
    const controller = new WebhookController({} as PaymentsService, {} as PrismaService);
    await expect(controller.handleWebhook({}, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when token does not match', async () => {
    process.env.VALUT_WEBHOOK_SECRET = 'shared';
    const controller = new WebhookController({} as PaymentsService, {} as PrismaService);
    await expect(controller.handleWebhook({}, 'Bearer wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('confirms withdraw with idempotent updateMany', async () => {
    process.env.VALUT_WEBHOOK_SECRET = 'shared';
    const payments = { findPaymentByProviderRef: jest.fn() };
    const prisma = {
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const controller = new WebhookController(payments as unknown as PaymentsService, prisma as unknown as PrismaService);

    payments.findPaymentByProviderRef.mockResolvedValue({
      id: 'p1',
      type: PaymentType.WITHDRAW,
      status: PaymentStatus.PENDING,
    });

    const res = await controller.handleWebhook({ pixId: 'x', status: 'paid' }, 'Bearer shared');
    expect(res).toEqual(expect.objectContaining({ received: true }));
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1', status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.APPROVED },
      }),
    );
  });
});
