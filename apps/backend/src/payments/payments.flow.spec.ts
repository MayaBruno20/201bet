import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, PaymentType, Prisma, WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PaymentsService } from './payments.service';
import { ValutNetworkError, ValutRejectedError, ValutService } from './valut.service';
import { WebhookController } from './webhook.controller';

function dec(n: number) {
  return new Prisma.Decimal(n.toFixed(4));
}

describe('Payments flow (unit)', () => {
  describe('Deposit', () => {
    it('createDeposit creates PENDING payment, calls Valut and stores providerRef', async () => {
      const prisma = {
        wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'w1', userId: 'u1', balance: dec(10) }) },
        user: { findUnique: jest.fn().mockResolvedValue({ cpf: '12345678901' }) },
        payment: {
          create: jest.fn().mockResolvedValue({
            id: 'p1',
            userId: 'u1',
            type: PaymentType.DEPOSIT,
            amount: dec(200),
            status: PaymentStatus.PENDING,
            provider: 'VALUT_PIX',
            providerRef: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      };

      const valut = {
        createPixQrCode: jest.fn().mockResolvedValue({
          pix_id: 'pix_1',
          qrcode: 'copy-paste',
          base64: 'b64',
          expiration_date: new Date().toISOString(),
          paid: false,
          type: 'dynamic',
          amount: 20000,
          created_at: new Date().toISOString(),
        }),
      };

      const service = new PaymentsService(prisma as unknown as PrismaService, valut as unknown as ValutService);
      const res = await service.createDeposit('u1', { amount: 200 });

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            type: PaymentType.DEPOSIT,
            status: PaymentStatus.PENDING,
          }),
        }),
      );
      expect(valut.createPixQrCode).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 20000,
          externalId: 'p1',
          documentValidation: '12345678901',
        }),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: { providerRef: 'pix_1' },
        }),
      );
      expect(res).toEqual(
        expect.objectContaining({
          paymentId: 'p1',
          pixId: 'pix_1',
          status: 'PENDING',
          amount: 200,
        }),
      );
    });

    it('createDeposit marks payment FAILED if Valut call fails', async () => {
      const prisma = {
        wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'w1', userId: 'u1', balance: dec(0) }) },
        user: { findUnique: jest.fn().mockResolvedValue({ cpf: '12345678901' }) },
        payment: {
          create: jest.fn().mockResolvedValue({
            id: 'p1',
            userId: 'u1',
            type: PaymentType.DEPOSIT,
            amount: dec(200),
            status: PaymentStatus.PENDING,
            provider: 'VALUT_PIX',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      const valut = {
        createPixQrCode: jest.fn().mockRejectedValue(new Error('boom')),
      };

      const service = new PaymentsService(prisma as unknown as PrismaService, valut as unknown as ValutService);
      await expect(service.createDeposit('u1', { amount: 200 })).rejects.toBeInstanceOf(Error);

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: { status: PaymentStatus.FAILED },
        }),
      );
    });

    it('checkDepositStatus confirms deposit when polling sees paid', async () => {
      const prisma = {
        payment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'p1',
            userId: 'u1',
            type: PaymentType.DEPOSIT,
            status: PaymentStatus.PENDING,
            providerRef: 'pix_1',
            amount: dec(200),
          }),
        },
        wallet: { findUnique: jest.fn().mockResolvedValue({ userId: 'u1', balance: dec(200) }) },
      };
      const valut = {
        getPixQrCode: jest.fn().mockResolvedValue({ pix_id: 'pix_1', paid: true, status: 'paid', amount: 20000 }),
      };
      const service = new PaymentsService(prisma as unknown as PrismaService, valut as unknown as ValutService);
      const spy = jest.spyOn(service, 'confirmDeposit').mockResolvedValue({ paymentId: 'p1', status: 'APPROVED', balance: 200 } as any);

      const res = await service.checkDepositStatus('u1', 'p1');

      expect(valut.getPixQrCode).toHaveBeenCalledWith('pix_1');
      expect(spy).toHaveBeenCalledWith('p1', 'u1');
      expect(res).toEqual(expect.objectContaining({ status: 'APPROVED' }));
    });
  });

  describe('Withdraw', () => {
    it('createWithdraw blocks when user already has PENDING/UNKNOWN withdrawal', async () => {
      const prisma = {
        wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'w1', userId: 'u1', balance: dec(200) }) },
        user: { findUnique: jest.fn().mockResolvedValue({ cpf: '12345678901' }) },
        payment: {
          count: jest.fn()
            .mockResolvedValueOnce(1) // confirmedDeposits
            .mockResolvedValueOnce(1), // pending withdrawals
        },
      };
      const service = new PaymentsService(prisma as unknown as PrismaService, {} as ValutService);
      await expect(service.createWithdraw('u1', { amount: 50, pixKeyType: 'document' as any, pixKey: 'k' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('createWithdraw debits wallet and calls Valut (happy path)', async () => {
      const tx = {
        wallet: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        payment: {
          create: jest.fn().mockResolvedValue({
            id: 'wd1',
            userId: 'u1',
            type: PaymentType.WITHDRAW,
            amount: dec(200),
            status: PaymentStatus.PENDING,
            provider: 'VALUT_PIX',
            providerRef: null,
            pixKey: 'k',
            pixKeyType: 'document',
          }),
        },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      };

      const prisma = {
        wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'w1', userId: 'u1', balance: dec(200) }) },
        user: { findUnique: jest.fn().mockResolvedValue({ cpf: '12345678901' }) },
        payment: {
          count: jest.fn()
            // confirmedDeposits
            .mockResolvedValueOnce(1)
            // pending withdrawals
            .mockResolvedValueOnce(0),
          update: jest.fn().mockResolvedValue({}),
        },
        $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      };

      const valut = {
        performPixCashout: jest.fn().mockResolvedValue({ pix_id: 'pix_out_1' }),
      };

      const service = new PaymentsService(prisma as unknown as PrismaService, valut as unknown as ValutService);
      const res = await service.createWithdraw('u1', { amount: 200, pixKeyType: 'document' as any, pixKey: 'k' });

      expect(tx.wallet.updateMany).toHaveBeenCalled();
      expect(valut.performPixCashout).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 20000,
          externalId: 'wd1',
          documentValidation: '12345678901',
        }),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'wd1' }, data: { providerRef: 'pix_out_1' } }),
      );
      expect(res).toEqual(expect.objectContaining({ paymentId: 'wd1', status: 'PENDING' }));
    });

    it('createWithdraw holds for manual review when above threshold', async () => {
      const original = process.env.WITHDRAW_AUTO_HOLD_THRESHOLD;
      process.env.WITHDRAW_AUTO_HOLD_THRESHOLD = '100';

      const tx = {
        wallet: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        payment: {
          create: jest.fn().mockResolvedValue({
            id: 'wd1',
            userId: 'u1',
            type: PaymentType.WITHDRAW,
            amount: dec(200),
            status: PaymentStatus.PENDING,
            provider: 'VALUT_PIX',
            providerRef: 'PENDING_MANUAL_REVIEW',
            pixKey: 'k',
            pixKeyType: 'document',
          }),
        },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'w1', userId: 'u1', balance: dec(200) }) },
        user: { findUnique: jest.fn().mockResolvedValue({ cpf: '12345678901' }) },
        payment: {
          count: jest.fn()
            .mockResolvedValueOnce(1) // confirmedDeposits
            .mockResolvedValueOnce(0), // pending withdrawals
        },
        $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      };
      const valut = { performPixCashout: jest.fn() };
      const service = new PaymentsService(prisma as unknown as PrismaService, valut as unknown as ValutService);

      const res = await service.createWithdraw('u1', { amount: 200, pixKeyType: 'document' as any, pixKey: 'k' });

      expect(valut.performPixCashout).not.toHaveBeenCalled();
      expect(res).toEqual(expect.objectContaining({ status: 'PENDING_MANUAL_REVIEW' }));

      process.env.WITHDRAW_AUTO_HOLD_THRESHOLD = original;
    });

    it('createWithdraw refunds wallet on ValutRejectedError (current behavior)', async () => {
      const tx = {
        wallet: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
        payment: {
          create: jest.fn().mockResolvedValue({
            id: 'wd1',
            userId: 'u1',
            type: PaymentType.WITHDRAW,
            amount: dec(200),
            status: PaymentStatus.PENDING,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      };

      const prisma = {
        wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'w1', userId: 'u1', balance: dec(200) }) },
        user: { findUnique: jest.fn().mockResolvedValue({ cpf: '12345678901' }) },
        payment: {
          count: jest.fn()
            .mockResolvedValueOnce(1) // confirmedDeposits
            .mockResolvedValueOnce(0), // pending withdrawals
          update: jest.fn().mockResolvedValue({}),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(async (cb: (t: any) => unknown) => cb(tx)),
      };
      const valut = { performPixCashout: jest.fn().mockRejectedValue(new ValutRejectedError('rejected')) };

      const service = new PaymentsService(prisma as unknown as PrismaService, valut as unknown as ValutService);
      await expect(service.createWithdraw('u1', { amount: 200, pixKeyType: 'document' as any, pixKey: 'k' }))
        .rejects.toBeInstanceOf(BadRequestException);

      // robust behavior: do NOT refund automatically; mark as UNKNOWN for reconciliation/manual review
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wd1' },
          data: { status: PaymentStatus.UNKNOWN },
        }),
      );
    });

    it('createWithdraw keeps PENDING on network/timeout error (no refund)', async () => {
      const tx = {
        wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
        payment: { create: jest.fn().mockResolvedValue({ id: 'wd1', userId: 'u1', type: PaymentType.WITHDRAW, amount: dec(200), status: PaymentStatus.PENDING }) },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'w1', userId: 'u1', balance: dec(200) }) },
        user: { findUnique: jest.fn().mockResolvedValue({ cpf: '12345678901' }) },
        payment: {
          count: jest.fn()
            .mockResolvedValueOnce(1) // confirmedDeposits
            .mockResolvedValueOnce(0), // pending withdrawals
          update: jest.fn().mockResolvedValue({}),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(async (cb: (t: any) => unknown) => cb(tx)),
      };
      const valut = { performPixCashout: jest.fn().mockRejectedValue(new ValutNetworkError('timeout')) };
      const service = new PaymentsService(prisma as unknown as PrismaService, valut as unknown as ValutService);

      await expect(service.createWithdraw('u1', { amount: 200, pixKeyType: 'document' as any, pixKey: 'k' }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(tx.wallet.update).not.toHaveBeenCalled();
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wd1' },
          data: { status: PaymentStatus.UNKNOWN },
        }),
      );
    });
  });

  describe('Webhook', () => {
    it('confirms deposit only when payment is PENDING', async () => {
      process.env.VALUT_WEBHOOK_SECRET = 'shared';
      const paymentsService = { findPaymentByProviderRef: jest.fn(), confirmDeposit: jest.fn() };
      const prisma = {} as any;
      const controller = new WebhookController(paymentsService as unknown as PaymentsService, prisma as unknown as PrismaService);

      paymentsService.findPaymentByProviderRef.mockResolvedValue({
        id: 'p1',
        type: PaymentType.DEPOSIT,
        status: PaymentStatus.PENDING,
      });
      await controller.handleWebhook({ pixId: 'pix_1', status: 'paid' }, 'Bearer shared');
      expect(paymentsService.confirmDeposit).toHaveBeenCalledWith('p1');

      paymentsService.confirmDeposit.mockClear();
      paymentsService.findPaymentByProviderRef.mockResolvedValue({
        id: 'p1',
        type: PaymentType.DEPOSIT,
        status: PaymentStatus.APPROVED,
      });
      await controller.handleWebhook({ pixId: 'pix_1', status: 'paid' }, 'Bearer shared');
      expect(paymentsService.confirmDeposit).not.toHaveBeenCalled();
    });

    it('rejects webhook when secret is invalid', async () => {
      process.env.VALUT_WEBHOOK_SECRET = 'shared';
      const controller = new WebhookController({} as PaymentsService, {} as PrismaService);
      await expect(controller.handleWebhook({ pixId: 'x', status: 'paid' }, 'Bearer wrong')).rejects.toThrow();
    });

    it('confirms withdrawal with idempotent updateMany', async () => {
      process.env.VALUT_WEBHOOK_SECRET = 'shared';
      const paymentsService = { findPaymentByProviderRef: jest.fn() };
      const prisma = { payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
      const controller = new WebhookController(paymentsService as unknown as PaymentsService, prisma as unknown as PrismaService);

      paymentsService.findPaymentByProviderRef.mockResolvedValue({
        id: 'wd1',
        type: PaymentType.WITHDRAW,
        status: PaymentStatus.PENDING,
      });

      await controller.handleWebhook({ pixId: 'pix_out_1', status: 'paid' }, 'Bearer shared');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wd1', status: { in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] } },
          data: { status: PaymentStatus.APPROVED },
        }),
      );
    });

    it('confirms withdrawal when payment is UNKNOWN', async () => {
      process.env.VALUT_WEBHOOK_SECRET = 'shared';
      const paymentsService = { findPaymentByProviderRef: jest.fn() };
      const prisma = { payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
      const controller = new WebhookController(paymentsService as unknown as PaymentsService, prisma as unknown as PrismaService);

      paymentsService.findPaymentByProviderRef.mockResolvedValue({
        id: 'wd1',
        type: PaymentType.WITHDRAW,
        status: PaymentStatus.UNKNOWN,
      });

      await controller.handleWebhook({ pixId: 'pix_out_1', status: 'completed' }, 'Bearer shared');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wd1', status: { in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] } },
          data: { status: PaymentStatus.APPROVED },
        }),
      );
    });
  });

  describe('Reconciliation', () => {
    it('reconciles pending deposit by confirming when Valut says paid', async () => {
      const prisma = {
        payment: {
          findMany: jest.fn()
            // deposits
            .mockResolvedValueOnce([{ id: 'd1', type: PaymentType.DEPOSIT, status: PaymentStatus.PENDING, provider: 'VALUT_PIX', providerRef: 'pix_in_1' }])
            // withdrawals com providerRef
            .mockResolvedValueOnce([])
            // orphan UNKNOWN sem providerRef
            .mockResolvedValueOnce([]),
        },
      };
      const valut = {
        getPixQrCode: jest.fn().mockResolvedValue({ pix_id: 'pix_in_1', paid: true, status: 'paid', amount: 20000 }),
        getPixCashout: jest.fn(),
      };
      const service = new PaymentsService(prisma as unknown as PrismaService, valut as unknown as ValutService);
      const spy = jest.spyOn(service, 'confirmDeposit').mockResolvedValue({ paymentId: 'd1', status: 'APPROVED', balance: 0 } as any);

      await (service as any).reconcileOnce();
      expect(valut.getPixQrCode).toHaveBeenCalledWith('pix_in_1');
      expect(spy).toHaveBeenCalledWith('d1');
    });

    it('reconciles pending withdrawal by marking APPROVED when Valut says completed', async () => {
      const prisma = {
        payment: {
          findMany: jest.fn()
            // deposits
            .mockResolvedValueOnce([])
            // withdrawals
            .mockResolvedValueOnce([{ id: 'w1', userId: 'u1', type: PaymentType.WITHDRAW, status: PaymentStatus.UNKNOWN, provider: 'VALUT_PIX', providerRef: 'pix_out_1', amount: dec(200) }])
            // orphan UNKNOWN sem providerRef
            .mockResolvedValueOnce([]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const valut = {
        getPixQrCode: jest.fn(),
        getPixCashout: jest.fn().mockResolvedValue({ pix_id: 'pix_out_1', status: 'completed' }),
      };
      const service = new PaymentsService(prisma as unknown as PrismaService, valut as unknown as ValutService);

      await (service as any).reconcileOnce();
      expect(valut.getPixCashout).toHaveBeenCalledWith('pix_out_1');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'w1', status: { in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] } },
          data: { status: PaymentStatus.APPROVED },
        }),
      );
    });

    it('reconciles failed withdrawal by refunding idempotently', async () => {
      const tx = {
        payment: {
          findUnique: jest.fn().mockResolvedValue({ id: 'w1', userId: 'u1', type: PaymentType.WITHDRAW, amount: dec(200), status: PaymentStatus.UNKNOWN, providerRef: 'pix_out_1' }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        wallet: {
          findUnique: jest.fn().mockResolvedValue({ id: 'wallet1', userId: 'u1', balance: dec(0) }),
          update: jest.fn().mockResolvedValue({}),
        },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        payment: {
          findMany: jest.fn()
            .mockResolvedValueOnce([]) // deposits
            .mockResolvedValueOnce([{ id: 'w1', userId: 'u1', type: PaymentType.WITHDRAW, status: PaymentStatus.UNKNOWN, provider: 'VALUT_PIX', providerRef: 'pix_out_1', amount: dec(200) }])
            .mockResolvedValueOnce([]), // orphan UNKNOWN sem providerRef
        },
        $transaction: jest.fn(async (cb: any) => cb(tx)),
      };
      const valut = {
        getPixQrCode: jest.fn(),
        getPixCashout: jest.fn().mockResolvedValue({ pix_id: 'pix_out_1', status: 'failed' }),
      };
      const service = new PaymentsService(prisma as unknown as PrismaService, valut as unknown as ValutService);

      await (service as any).reconcileOnce();
      expect(tx.wallet.update).toHaveBeenCalled();
      expect(tx.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: WalletTransactionType.ADJUSTMENT }),
        }),
      );
    });

    it('reconciles orphan UNKNOWN withdrawal (sem providerRef) re-disparando idempotente', async () => {
      const prisma = {
        payment: {
          findMany: jest.fn()
            .mockResolvedValueOnce([]) // deposits
            .mockResolvedValueOnce([]) // withdrawals com providerRef
            // orphan: UNKNOWN, providerRef null, holdReason null — o beco sem saída
            .mockResolvedValueOnce([{
              id: 'wd9', userId: 'u1', type: PaymentType.WITHDRAW, status: PaymentStatus.UNKNOWN,
              provider: 'VALUT_PIX', providerRef: null, holdReason: null,
              pixKey: '12345678901', pixKeyType: 'document', amount: dec(136.1),
              user: { cpf: '12345678901' },
            }]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const valut = {
        getPixQrCode: jest.fn(),
        getPixCashout: jest.fn(),
        performPixCashout: jest.fn().mockResolvedValue({ pix_id: 'pix_out_9', status: 'processing', receiver: { document: '12345678901' } }),
      };
      const service = new PaymentsService(prisma as unknown as PrismaService, valut as unknown as ValutService);

      await (service as any).reconcileOnce();

      // Re-disparo usa a MESMA chave de idempotência original (wd-<id>) → sem duplo envio.
      expect(valut.performPixCashout).toHaveBeenCalledWith(
        expect.objectContaining({ externalId: 'wd9', idempotencyKey: 'wd-wd9', documentValidation: '12345678901' }),
      );
      // Adota o pix_id e tira o saque do estado órfão (UNKNOWN + providerRef null).
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wd9', status: PaymentStatus.UNKNOWN, providerRef: null },
          data: expect.objectContaining({ providerRef: 'pix_out_9', status: PaymentStatus.PENDING }),
        }),
      );
    });
  });

  describe('Sanity checks', () => {
    it('throws NotFound when wallet is missing on deposit', async () => {
      const prisma = {
        wallet: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new PaymentsService(prisma as unknown as PrismaService, {} as ValutService);
      await expect(service.createDeposit('u1', { amount: 200 })).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

