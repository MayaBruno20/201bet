import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
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

@Controller('admin/withdrawals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminWithdrawalsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('pending')
  listPending() {
    return this.paymentsService.adminListPendingWithdrawals();
  }

  @Post(':paymentId/approve')
  approve(@CurrentUser() user: { userId: string }, @Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.paymentsService.adminApproveWithdraw(paymentId, user.userId);
  }

  @Post(':paymentId/reject')
  reject(
    @CurrentUser() user: { userId: string },
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: { reason?: string },
  ) {
    return this.paymentsService.adminRejectWithdraw(paymentId, user.userId, body?.reason);
  }
}
