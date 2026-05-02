import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { SiteDisclaimersController } from './site-disclaimers.controller';
import { SiteDisclaimersService } from './site-disclaimers.service';

@Module({
  imports: [PrismaModule],
  controllers: [SiteDisclaimersController],
  providers: [SiteDisclaimersService],
})
export class SiteDisclaimersModule {}
