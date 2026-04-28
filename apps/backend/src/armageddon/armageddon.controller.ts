import { Controller, Get, Param } from '@nestjs/common';
import { ArmageddonService } from './armageddon.service';

@Controller('armageddon')
export class ArmageddonController {
  constructor(private readonly service: ArmageddonService) {}

  @Get()
  list() {
    return this.service.listPublic();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getPublicById(id);
  }
}
