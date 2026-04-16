import type { PrismaService } from '../../src/database/prisma.service';

/**
 * Mock mínimo para subir o AppModule em testes HTTP sem Postgres.
 * Estenda com jest.fn().mockResolvedValue conforme o caso de teste.
 */
export function createE2ePrismaMock(): Record<string, unknown> {
  const txClient = {
    payment: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    wallet: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    bet: { create: jest.fn() },
    walletTransaction: { create: jest.fn() },
    duelPoolState: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    duel: { findUnique: jest.fn() },
  };

  return {
    duel: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
    },
    wallet: {
      findUnique: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (t: typeof txClient) => unknown) => cb(txClient as never)),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    enableShutdownHooks: jest.fn(),
  } as unknown as PrismaService;
}
