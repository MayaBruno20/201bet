import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { BrazilListsService } from './brazil-lists.service';

@Controller('brazil-lists')
export class BrazilListsController {
  constructor(private readonly service: BrazilListsService) {}

  @Get()
  list() {
    return this.service.listPublic();
  }

  @Get('live-events')
  liveEvents() {
    return this.service.listLiveEvents();
  }

  @Get(':areaCode')
  getByArea(@Param('areaCode', ParseIntPipe) areaCode: number) {
    return this.service.getPublicByArea(areaCode);
  }
}
