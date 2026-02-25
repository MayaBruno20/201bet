import {
  AuditLog,
  EventStatus,
  MarketStatus,
  OddStatus,
  PrismaClient,
  UserRole,
  UserStatus,
  WalletTransactionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('Admin@201Bet123', 12);
  const userPassword = await bcrypt.hash('User@201Bet123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@201bet.local' },
    update: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      password: adminPassword,
      name: 'Admin 201Bet',
      cpf: '11111111111',
      birthDate: new Date('1990-01-10T00:00:00.000Z'),
    },
    create: {
      email: 'admin@201bet.local',
      name: 'Admin 201Bet',
      password: adminPassword,
      cpf: '11111111111',
      birthDate: new Date('1990-01-10T00:00:00.000Z'),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'user@201bet.local' },
    update: {
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      password: userPassword,
      name: 'Usuario Demo',
      cpf: '22222222222',
      birthDate: new Date('1996-05-18T00:00:00.000Z'),
    },
    create: {
      email: 'user@201bet.local',
      name: 'Usuario Demo',
      password: userPassword,
      cpf: '22222222222',
      birthDate: new Date('1996-05-18T00:00:00.000Z'),
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.wallet.upsert({
    where: { userId: admin.id },
    update: { balance: 10000 },
    create: { userId: admin.id, balance: 10000 },
  });

  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: { balance: 500 },
    create: { userId: user.id, balance: 500 },
  });

  const userWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
  const existingDeposit = await prisma.walletTransaction.findFirst({
    where: { walletId: userWallet.id, reference: 'seed-initial-deposit' },
  });

  if (!existingDeposit) {
    await prisma.walletTransaction.create({
      data: {
        walletId: userWallet.id,
        type: WalletTransactionType.DEPOSIT,
        amount: 500,
        reference: 'seed-initial-deposit',
      },
    });
  }

  const event =
    (await prisma.event.findFirst({ where: { name: 'Armageddon 2026 - Corrida Classificatoria' } })) ??
    (await prisma.event.create({
      data: {
        sport: 'DRAG_RACE',
        name: 'Armageddon 2026 - Corrida Classificatoria',
        startAt: new Date('2026-06-19T20:30:00.000Z'),
        status: EventStatus.SCHEDULED,
      },
    }));

  const driverA =
    (await prisma.driver.findFirst({ where: { name: 'Kaio V8' } })) ??
    (await prisma.driver.create({ data: { name: 'Kaio V8', nickname: 'K8' } }));

  const driverB =
    (await prisma.driver.findFirst({ where: { name: 'Luiz Turbo' } })) ??
    (await prisma.driver.create({ data: { name: 'Luiz Turbo', nickname: 'LT' } }));

  const carA =
    (await prisma.car.findFirst({ where: { name: 'Gol Turbo Preto' } })) ??
    (await prisma.car.create({ data: { driverId: driverA.id, name: 'Gol Turbo Preto', category: 'PRO_MOD', number: '07' } }));

  const carB =
    (await prisma.car.findFirst({ where: { name: 'Chevette 2JZ' } })) ??
    (await prisma.car.create({ data: { driverId: driverB.id, name: 'Chevette 2JZ', category: 'FORCA_LIVRE', number: '21' } }));

  const market =
    (await prisma.market.findFirst({ where: { eventId: event.id, name: 'Passou na frente - Duelo A x B' } })) ??
    (await prisma.market.create({
      data: {
        eventId: event.id,
        name: 'Passou na frente - Duelo A x B',
        status: MarketStatus.OPEN,
      },
    }));

  const oddA = await prisma.odd.findFirst({ where: { marketId: market.id, label: 'Carro A' } });
  if (!oddA) {
    await prisma.odd.create({
      data: { marketId: market.id, label: 'Carro A', value: 1.74, status: OddStatus.ACTIVE },
    });
  }

  const oddB = await prisma.odd.findFirst({ where: { marketId: market.id, label: 'Carro B' } });
  if (!oddB) {
    await prisma.odd.create({
      data: { marketId: market.id, label: 'Carro B', value: 1.96, status: OddStatus.ACTIVE },
    });
  }

  const duel = await prisma.duel.findFirst({ where: { eventId: event.id, leftCarId: carA.id, rightCarId: carB.id } });
  if (!duel) {
    await prisma.duel.create({
      data: {
        eventId: event.id,
        leftCarId: carA.id,
        rightCarId: carB.id,
        startsAt: new Date('2026-06-19T20:30:00.000Z'),
        bookingCloseAt: new Date('2026-06-19T20:25:00.000Z'),
        status: 'BOOKING_OPEN',
      },
    });
  }

  const setting = await prisma.globalSetting.findUnique({ where: { key: 'BOOKING_LOCK_PERCENT' } });
  if (!setting) {
    await prisma.globalSetting.create({
      data: {
        key: 'BOOKING_LOCK_PERCENT',
        value: '65',
        description: 'Percentual de bloqueio automático do lado desfavorável',
        updatedById: admin.id,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: 'SEED_RUN',
      entity: 'SYSTEM',
      entityId: null,
      payload: { createdBy: 'seed.ts', at: new Date().toISOString() },
      ipAddress: '127.0.0.1',
      userAgent: 'seed-script',
    },
  });

  console.log('Seed concluido.');
  console.log('Admin -> admin@201bet.local / Admin@201Bet123');
  console.log('User  -> user@201bet.local / User@201Bet123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
