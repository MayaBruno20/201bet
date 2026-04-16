import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthModule } from '../../src/auth/auth.module';
import { AUTH_ACCESS_COOKIE } from '../../src/auth/auth-cookie';
import { PrismaModule } from '../../src/database/prisma.module';
import { PrismaService } from '../../src/database/prisma.service';

describe('AuthModule (integration)', () => {
  let app: INestApplication<App>;
  let prisma: {
    user: { findUnique: jest.Mock };
  };

  beforeAll(() => {
    process.env.JWT_SECRET = 'jest-integration-secret-32chars!!';
    process.env.JWT_EXPIRES_IN = '1h';
  });

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('POST /api/auth/login sets httpOnly cookie and returns user without token in body', async () => {
    const hash = await bcrypt.hash('CorrectPass1', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.local',
      password: hash,
      name: 'Integration',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      wallet: { balance: { toNumber: () => 0 } },
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'user@test.local', password: 'CorrectPass1' })
      .expect(201);

    expect(res.body.user).toMatchObject({
      email: 'user@test.local',
      role: 'USER',
    });
    expect(res.body.accessToken).toBeUndefined();

    const setCookie = res.headers['set-cookie'] as string[] | undefined;
    expect(setCookie?.some((c) => c.startsWith(`${AUTH_ACCESS_COOKIE}=`))).toBe(true);
    expect(setCookie?.some((c) => c.toLowerCase().includes('httponly'))).toBe(true);
  });

  it('POST /api/auth/logout clears cookie', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/logout').expect(201);
    const setCookie = res.headers['set-cookie'] as string[] | undefined;
    expect(setCookie?.some((c) => c.includes(`${AUTH_ACCESS_COOKIE}=`))).toBe(true);
  });
});
