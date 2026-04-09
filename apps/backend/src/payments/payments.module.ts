import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ValutService } from './valut.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController, WebhookController],
  providers: [PaymentsService, ValutService],
})
export class PaymentsModule {}
