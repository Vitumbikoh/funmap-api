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
import { Roles } from '../../shared/decorators/roles.decorator';
import { Role } from '../../shared/enums/role.enum';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { ApproveCommunityEventDto } from './dto/approve-community-event.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { NearbyEventsQueryDto } from './dto/nearby-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('community/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findPendingCommunityEvents() {
    return this.eventsService.findPendingCommunityEvents();
  }

  @Get('nearby')
  findNearby(@Query() query: NearbyEventsQueryDto) {
    return this.eventsService.findNearby(query);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: JwtUser) {
    return this.eventsService.findMine(user);
  }

  @Get(':id/attendees')
  @UseGuards(JwtAuthGuard)
  findAttendees(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.eventsService.findAttendees(user, id);
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

  @Patch(':id/community-review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  reviewCommunityEvent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: ApproveCommunityEventDto,
  ) {
    return this.eventsService.reviewCommunityEvent(id, payload.approved);
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
