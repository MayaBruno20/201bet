import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
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
@UseGuards(AdminJwtAuthGuard, RolesGuard)
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

/**
 * Listagens centralizadas de pagamentos (depósitos + saques) para a aba
 * Financeiro do admin. Suporta filtros, busca e paginação.
 */
@Controller('admin/payments')
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.AUDITOR)
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('deposits')
  listDeposits(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.paymentsService.adminListPayments({
      type: 'DEPOSIT',
      status,
      search,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      offset: offset ? Number.parseInt(offset, 10) : undefined,
    });
  }

  @Get('withdrawals')
  listWithdrawals(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.paymentsService.adminListPayments({
      type: 'WITHDRAW',
      status,
      search,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      offset: offset ? Number.parseInt(offset, 10) : undefined,
    });
  }

  @Get('summary')
  summary(@Query('hours') hours?: string) {
    // hours=0 (ou negativo) → "Total" sem filtro temporal. Caso contrário,
    // janela em horas, limitada a 8760 (1 ano) pra evitar abuso.
    const h = hours !== undefined ? Number.parseInt(hours, 10) : 24;
    if (Number.isFinite(h) && h <= 0) return this.paymentsService.adminPaymentsSummary(0);
    return this.paymentsService.adminPaymentsSummary(Number.isFinite(h) ? Math.min(Math.max(h, 1), 8760) : 24);
  }
}
