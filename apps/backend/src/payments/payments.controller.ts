import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EmailVerifiedGuard } from '../auth/email-verified.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateWithdrawDto } from './dto/create-withdraw.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('deposit')
  @UseGuards(EmailVerifiedGuard)
  createDeposit(
    @CurrentUser() user: { userId: string },
    @Body() payload: CreateDepositDto,
  ) {
    return this.paymentsService.createDeposit(user.userId, payload);
  }

  @Get('deposit/:paymentId/status')
  checkDepositStatus(
    @CurrentUser() user: { userId: string },
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentsService.checkDepositStatus(user.userId, paymentId);
  }

  @Post('withdraw')
  @UseGuards(EmailVerifiedGuard)
  createWithdraw(
    @CurrentUser() user: { userId: string },
    @Body() payload: CreateWithdrawDto,
  ) {
    return this.paymentsService.createWithdraw(user.userId, payload);
  }

  @Get('withdrawals')
  listWithdrawals(@CurrentUser() user: { userId: string }) {
    return this.paymentsService.listWithdrawals(user.userId);
  }

  @Get('summary')
  getSummary(@CurrentUser() user: { userId: string }) {
    return this.paymentsService.getDepositSummary(user.userId);
  }
}
