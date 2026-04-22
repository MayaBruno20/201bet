import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { TokensService } from './tokens.service';

@Module({
  imports: [PrismaModule],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}
