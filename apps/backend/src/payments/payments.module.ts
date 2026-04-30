import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { AdminWithdrawalsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ValutService } from './valut.service';
import { WebhookController } from './webhook.controller';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController, AdminWithdrawalsController, WebhookController],
  providers: [PaymentsService, ValutService, RolesGuard],
})
export class PaymentsModule {}
