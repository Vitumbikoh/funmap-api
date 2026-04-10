import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('nearby')
  findNearby(@Query() query: GeoQueryDto) {
    return this.eventsService.findNearby(query);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.eventsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: JwtUser, @Body() payload: CreateEventDto) {
    return this.eventsService.create(user, payload);
  }

  @Post(':id/rsvp')
  @UseGuards(JwtAuthGuard)
  rsvp(@CurrentUser() user: JwtUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.eventsService.rsvp(user, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateEventDto,
  ) {
    return this.eventsService.update(user, id, payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  cancel(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.eventsService.cancel(user, id);
  }
}

