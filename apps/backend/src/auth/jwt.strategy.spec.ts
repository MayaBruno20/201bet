import { UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(prisma as unknown as PrismaService);
  });

  it('throws when payload is incomplete', async () => {
    await expect(strategy.validate({} as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when user inactive', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      role: UserRole.USER,
      status: UserStatus.BANNED,
    });
    await expect(
      strategy.validate({ sub: '1', email: 'a@b.com', role: UserRole.USER }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when role changed in database', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    await expect(
      strategy.validate({ sub: '1', email: 'a@b.com', role: UserRole.USER }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns user when valid', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    });
    const out = await strategy.validate({ sub: '1', email: 'a@b.com', role: UserRole.USER });
    expect(out).toEqual({ userId: '1', email: 'a@b.com', role: UserRole.USER });
  });
});
