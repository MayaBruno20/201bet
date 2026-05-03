import { mkdirSync } from 'fs';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import Redis from 'ioredis';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { UPLOADS_ROOT, CARS_UPLOAD_DIR } from './common/uploads';

function logRuntimeEnv() {
  const logger = new Logger('Env');
  const pick = (key: string) => (process.env[key] ?? '').toString();

  const line = [
    `NODE_ENV=${pick('NODE_ENV') || 'development'}`,
    `PORT=${pick('PORT') || '3502'}`,
    `EMAIL_PROVIDER=${pick('EMAIL_PROVIDER') || 'noop'}`,
    `EMAIL_FROM_ADDRESS=${pick('EMAIL_FROM_ADDRESS') || '(missing)'}`,
    `REDIS_HOST=${pick('REDIS_HOST') || 'localhost'}`,
    `REDIS_PORT=${pick('REDIS_PORT') || '3505'}`,
    `REDIS_TLS=${pick('REDIS_TLS') || 'false'}`,
    `REDIS_USERNAME=${pick('REDIS_USERNAME') || 'default'}`,
    `REDIS_PASSWORD_SET=${pick('REDIS_PASSWORD') ? 'true' : 'false'}`,
  ].join(' ');

  // Render às vezes “come” logs iniciais; imprime via ambos.
  logger.log(line);
  // eslint-disable-next-line no-console
  console.log(`[Env] ${line}`);
}

async function probeRedisConnection(): Promise<void> {
  const logger = new Logger('RedisProbe');
  const host = process.env.REDIS_HOST || 'localhost';
  const port = Number(process.env.REDIS_PORT || 3505);
  const username = process.env.REDIS_USERNAME || 'default';
  const password = process.env.REDIS_PASSWORD || undefined;
  const tls = process.env.REDIS_TLS === 'true' ? {} : undefined;

  const client = new Redis({
    host,
    port,
    username,
    password,
    tls,
    lazyConnect: false,
    // Allow queueing commands while connecting.
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
  });

  try {
    await client.connect();
    const pong = await client.ping();
    const msg = `PING ok host=${host} port=${port} tls=${tls ? 'true' : 'false'} username=${username} (${pong})`;
    logger.log(msg);
    // eslint-disable-next-line no-console
    console.log(`[RedisProbe] ${msg}`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const msg = `PING failed host=${host} port=${port} tls=${tls ? 'true' : 'false'} username=${username}: ${errMsg}`;
    logger.error(msg);
    // eslint-disable-next-line no-console
    console.error(`[RedisProbe] ${msg}`);
  } finally {
    try {
      client.disconnect();
    } catch {
      // ignore
    }
  }
}

function assertJwtSecretForRuntime() {
  const secret = process.env.JWT_SECRET?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret || secret === 'change-me-in-production') {
    if (isProd) {
      throw new Error(
        'Defina JWT_SECRET forte (não use valor padrão) em produção.',
      );
    }
    return;
  }

  if (isProd && secret.length < 32) {
    throw new Error(
      'JWT_SECRET em produção deve ter pelo menos 32 caracteres.',
    );
  }
}

function assertCorsForRuntime(): string[] {
  const isProd = process.env.NODE_ENV === 'production';
  const env = process.env.CORS_ORIGIN?.trim();
  if (isProd && !env) {
    throw new Error('CORS_ORIGIN é obrigatório em produção (lista de URLs do frontend separadas por vírgula)');
  }
  return env?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [
    'http://localhost:3501',
    'http://localhost:3511',
    'http://localhost:3503',
  ];
}

async function bootstrap() {
  assertJwtSecretForRuntime();
  logRuntimeEnv();
  await probeRedisConnection();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const prismaService = app.get(PrismaService);
  const corsOrigins = assertCorsForRuntime();

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Serve uploads sob /api/uploads para passar pelo nginx (que só roteia /api/ → backend).
  // Garantimos que o diretório existe para o multer não estourar no primeiro upload.
  mkdirSync(CARS_UPLOAD_DIR, { recursive: true });
  app.useStaticAssets(UPLOADS_ROOT, {
    prefix: '/api/uploads/',
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  });
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await prismaService.enableShutdownHooks(app);

  await app.listen(process.env.PORT ?? 3502, '0.0.0.0');
}

bootstrap();
