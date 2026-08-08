import { Controller, Get, Param } from '@nestjs/common';
import { ArmageddonService } from './armageddon.service';

/** Hub público do Shark Tank (/shark-tank). Reusa o ArmageddonService. */
@Controller('shark-tank')
export class SharkTankController {
  constructor(private readonly service: ArmageddonService) {}

  @Get()
  list() {
    return this.service.listPublicSharkTank();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getPublicById(id);
  }
}
