import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { AppEnv } from '../config/env.validation';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { TokensService } from '../tokens/tokens.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<Pick<PrismaService, 'user' | '$transaction'>>;
  let jwtService: { signAsync: jest.Mock };
  let tokens: { issue: jest.Mock; consume: jest.Mock; invalidateAllOfType: jest.Mock };
  let mail: { sendVerification: jest.Mock; sendPasswordReset: jest.Mock; sendPasswordChanged: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      } as never,
      $transaction: jest.fn(),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
    tokens = {
      issue: jest.fn().mockResolvedValue({
        rawToken: 'raw-token',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 3600_000),
        id: 'tok-id',
      }),
      consume: jest.fn(),
      invalidateAllOfType: jest.fn().mockResolvedValue(0),
    };
    mail = {
      sendVerification: jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendPasswordChanged: jest.fn().mockResolvedValue(undefined),
    };
    config = { get: jest.fn().mockReturnValue(24) };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      tokens as unknown as TokensService,
      mail as unknown as MailService,
      config as unknown as ConfigService<AppEnv, true>,
    );
  });

  describe('login', () => {
    it('throws when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'a@b.com', password: 'x' } as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws when password invalid', async () => {
      const hash = await bcrypt.hash('right', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'a@b.com',
        password: hash,
        name: 'T',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        wallet: { balance: 0 },
      } as never);
      await expect(
        service.login({ email: 'a@b.com', password: 'wrong' } as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns accessToken and user on success', async () => {
      const hash = await bcrypt.hash('secret', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        password: hash,
        name: 'Tester',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        wallet: { balance: { toNumber: () => 10 } },
      } as never);

      const out = await service.login({ email: 'a@b.com', password: 'secret' } as never);
      expect(out.accessToken).toBe('signed-jwt');
      expect(out.user.email).toBe('a@b.com');
      expect(jwtService.signAsync).toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('throws when passwords differ', async () => {
      await expect(
        service.register({
          email: 'a@b.com',
          password: 'a',
          confirmPassword: 'b',
          name: 'N',
          cpf: '12345678901',
          birthDate: '1990-01-01',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates user with USER role and returns token payload', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
        fn(prisma as never),
      );
      prisma.user.create.mockResolvedValue({
        id: 'new-id',
        email: 'new@b.com',
        name: 'Novo',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        wallet: { balance: { toNumber: () => 0 } },
      } as never);

      const out = await service.register({
        email: 'new@b.com',
        password: 'senha1234',
        confirmPassword: 'senha1234',
        name: 'Novo',
        cpf: '12345678901',
        birthDate: '1990-06-15',
      });

      expect(out.user.role).toBe(UserRole.USER);
      expect(out.user.email).toBe('new@b.com');
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'new-id', role: UserRole.USER }),
      );
    });
  });
});
