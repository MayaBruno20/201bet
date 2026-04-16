import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';

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

async function bootstrap() {
  assertJwtSecretForRuntime();

  const app = await NestFactory.create(AppModule);
  const prismaService = app.get(PrismaService);
  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) =>
    origin.trim(),
  ) ?? [
    'http://localhost:3501',
    'http://localhost:3511',
    'http://localhost:3503',
  ];

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(helmet());
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
  await prismaService.enableShutdownHooks(app);

  await app.listen(process.env.PORT ?? 3502, '0.0.0.0');
}

bootstrap();
