import { NotFoundException } from '@nestjs/common';
import { PaymentStatus, PaymentType, Prisma, WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PaymentsService } from './payments.service';
import { ValutService } from './valut.service';

describe('PaymentsService', () => {
  describe('confirmDeposit', () => {
    it('does not increment wallet when claim count is zero (idempotent)', async () => {
      const walletUpdate = jest.fn();
      const walletTxCreate = jest.fn();

      const tx = {
        payment: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'pay1',
            userId: 'u1',
            amount: new Prisma.Decimal(50),
            status: PaymentStatus.APPROVED,
            type: PaymentType.DEPOSIT,
            providerRef: 'pix1',
          }),
        },
        wallet: {
          findUnique: jest.fn().mockResolvedValue({ id: 'w1', balance: new Prisma.Decimal(100) }),
          update: walletUpdate,
        },
        walletTransaction: { create: walletTxCreate },
      };

      const prisma = {
        $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      };

      const service = new PaymentsService(prisma as unknown as PrismaService, {} as ValutService);
      const result = await service.confirmDeposit('pay1');

      expect(walletUpdate).not.toHaveBeenCalled();
      expect(walletTxCreate).not.toHaveBeenCalled();
      expect(result.status).toBe(PaymentStatus.APPROVED);
      expect(result.balance).toBe(100);
    });

    it('credits wallet when claim succeeds', async () => {
      const paymentRow = {
        id: 'pay1',
        userId: 'u1',
        amount: new Prisma.Decimal(25),
        status: PaymentStatus.APPROVED,
        type: PaymentType.DEPOSIT,
        providerRef: 'pix1',
      };
      const walletRow = { id: 'w1', userId: 'u1', balance: new Prisma.Decimal(100) };
      const updatedWallet = { id: 'w1', balance: new Prisma.Decimal(125) };

      const walletUpdate = jest.fn().mockResolvedValue(updatedWallet);
      const walletTxCreate = jest.fn().mockResolvedValue({});

      const tx = {
        payment: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue(paymentRow),
        },
        wallet: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(walletRow)
            .mockResolvedValueOnce(updatedWallet),
          update: walletUpdate,
        },
        walletTransaction: { create: walletTxCreate },
      };

      const prisma = {
        $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      };

      const service = new PaymentsService(prisma as unknown as PrismaService, {} as ValutService);
      const result = await service.confirmDeposit('pay1');

      expect(walletUpdate).toHaveBeenCalled();
      expect(walletTxCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: WalletTransactionType.DEPOSIT,
          }),
        }),
      );
      expect(result.status).toBe('APPROVED');
      expect(result.balance).toBe(125);
    });

    it('throws when payment missing', async () => {
      const tx = {
        payment: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue(null),
        },
        wallet: { findUnique: jest.fn(), update: jest.fn() },
        walletTransaction: { create: jest.fn() },
      };
      const prisma = {
        $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      };
      const service = new PaymentsService(prisma as unknown as PrismaService, {} as ValutService);
      await expect(service.confirmDeposit('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
