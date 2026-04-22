import {
  PrismaClient,
  UserRole,
  UserStatus,
  WalletTransactionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { BRAZIL_LISTS } from './brazil-lists-data';

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

  console.log('Seeding Listas Brasil...');
  let seededLists = 0;
  let seededDrivers = 0;
  let seededRosters = 0;
  for (const list of BRAZIL_LISTS) {
    const brazilList = await prisma.brazilList.upsert({
      where: { areaCode: list.areaCode },
      update: {
        name: list.name,
        format: list.format,
        administratorName: list.administratorName ?? null,
        hometown: list.hometown ?? null,
        active: list.active ?? true,
      },
      create: {
        areaCode: list.areaCode,
        name: list.name,
        format: list.format,
        administratorName: list.administratorName ?? null,
        hometown: list.hometown ?? null,
        active: list.active ?? true,
      },
    });
    seededLists += 1;

    for (const roster of list.roster) {
      if (roster.vacancy) continue;

      const driverId = `bl-${list.areaCode}-${roster.position}`;
      await prisma.driver.upsert({
        where: { id: driverId },
        update: {
          name: roster.name,
          nickname: roster.nickname ?? null,
          carNumber: roster.carNumber ?? null,
          team: roster.team ?? null,
          active: true,
        },
        create: {
          id: driverId,
          name: roster.name,
          nickname: roster.nickname ?? null,
          carNumber: roster.carNumber ?? null,
          team: roster.team ?? null,
          active: true,
        },
      });
      seededDrivers += 1;

      await prisma.listRoster.upsert({
        where: { listId_position: { listId: brazilList.id, position: roster.position } },
        update: {
          driverId,
          isKing: roster.isKing ?? false,
        },
        create: {
          listId: brazilList.id,
          driverId,
          position: roster.position,
          isKing: roster.isKing ?? false,
        },
      });
      seededRosters += 1;
    }
  }
  console.log(`Listas Brasil: ${seededLists} listas, ${seededDrivers} pilotos, ${seededRosters} entradas de roster.`);

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
