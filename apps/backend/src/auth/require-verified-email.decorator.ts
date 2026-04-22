import { applyDecorators, UseGuards } from '@nestjs/common';
import { EmailVerifiedGuard } from './email-verified.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

export function RequireVerifiedEmail() {
  return applyDecorators(UseGuards(JwtAuthGuard, EmailVerifiedGuard));
}
