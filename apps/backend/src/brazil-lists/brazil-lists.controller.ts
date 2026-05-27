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

  @Get('finished-events')
  finishedEvents() {
    return this.service.listPublicFinishedListEvents();
  }

  @Get('events/:eventId/finished')
  finishedEventDetail(@Param('eventId') eventId: string) {
    return this.service.getPublicFinishedListEvent(eventId);
  }

  @Get(':areaCode')
  getByArea(@Param('areaCode', ParseIntPipe) areaCode: number) {
    return this.service.getPublicByArea(areaCode);
  }
}
