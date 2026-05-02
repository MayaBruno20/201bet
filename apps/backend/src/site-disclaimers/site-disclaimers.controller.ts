import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SiteDisclaimersService } from './site-disclaimers.service';
import type { UpsertDisclaimerInput } from './site-disclaimers.service';

@Controller()
export class SiteDisclaimersController {
  constructor(private readonly svc: SiteDisclaimersService) {}

  // ── Público ──
  @Get('site-disclaimers')
  listPublic() {
    return this.svc.listPublic();
  }

  // ── Admin ──
  @Get('admin/site-disclaimers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  listAll() {
    return this.svc.listAll();
  }

  @Post('admin/site-disclaimers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  create(@Body() body: UpsertDisclaimerInput) {
    return this.svc.create(body);
  }

  @Patch('admin/site-disclaimers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpsertDisclaimerInput) {
    return this.svc.update(id, body);
  }

  @Delete('admin/site-disclaimers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(id);
  }
}
