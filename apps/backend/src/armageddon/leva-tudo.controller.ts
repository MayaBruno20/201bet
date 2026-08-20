import { Controller, Get, Param } from '@nestjs/common';
import { ArmageddonService } from './armageddon.service';

/** Hub público do Leva Tudo (/leva-tudo). Reusa o ArmageddonService. */
@Controller('leva-tudo')
export class LevaTudoController {
  constructor(private readonly service: ArmageddonService) {}

  @Get()
  list() {
    return this.service.listPublicLevaTudo();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getPublicById(id);
  }
}
