import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Point } from 'geojson';
import { Repository } from 'typeorm';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { Role } from '../../shared/enums/role.enum';
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Event } from './entities/event.entity';
import { Rsvp } from './entities/rsvp.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Rsvp)
    private readonly rsvpRepository: Repository<Rsvp>,
  ) {}

  async create(user: JwtUser, payload: CreateEventDto) {
    const canCreateEvent =
      user.roles.includes(Role.BUSINESS) ||
      user.roles.includes(Role.CAPITAL_USER);

    if (!canCreateEvent) {
      throw new ForbiddenException('Only business accounts can add events.');
    }

    const event = this.eventsRepository.create({
      organizerId: user.sub,
      title: payload.title,
      description: payload.description,
      mediaIds: payload.mediaIds,
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
      category: payload.category,
      moodTag: payload.moodTag,
      ticketPrice: payload.ticketPrice.toFixed(2),
      capacity: payload.capacity,
      paymentRequired: payload.paymentRequired,
      location: {
        type: 'Point',
        coordinates: [payload.longitude, payload.latitude],
      } as Point,
      venueName: payload.venueName,
      township: payload.township,
      district: payload.district,
      region: payload.region,
      country: payload.country,
    });

    return this.eventsRepository.save(event);
  }

  async findOne(eventId: string) {
    const event = await this.eventsRepository.findOne({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async findNearby(query: GeoQueryDto) {
    return this.eventsRepository.query(
      `
        SELECT
          e.*,
          u.display_name AS "organizerDisplayName",
          u.avatar_url AS "organizerAvatarUrl",
          ST_Y(e.location::geometry) AS latitude,
          ST_X(e.location::geometry) AS longitude,
          ST_Distance(
            e.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 AS distance_km
        FROM events e
        LEFT JOIN users u ON u.id = e.organizer_id
        WHERE e.is_published = true
          AND ST_DWithin(
            e.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3 * 1000
          )
          AND e.end_date >= NOW()
        ORDER BY e.start_date ASC
        LIMIT 50
      `,
      [query.longitude, query.latitude, query.radiusKm ?? 10],
    );
  }

  async rsvp(user: JwtUser, eventId: string) {
    const event = await this.findOne(eventId);

    let rsvp = await this.rsvpRepository.findOne({
      where: {
        eventId,
        userId: user.sub,
      },
    });

    if (!rsvp) {
      rsvp = this.rsvpRepository.create({
        eventId,
        userId: user.sub,
        paymentRequired: event.paymentRequired,
        status: event.paymentRequired ? RsvpStatus.PENDING : RsvpStatus.CONFIRMED,
      });
    }

    const wasConfirmed = rsvp.status === RsvpStatus.CONFIRMED;

    if (!event.paymentRequired) {
      rsvp.status = RsvpStatus.CONFIRMED;
    }

    const savedRsvp = await this.rsvpRepository.save(rsvp);

    if (!event.paymentRequired && !wasConfirmed) {
      event.rsvpCount += 1;
      await this.eventsRepository.save(event);
    }

    return savedRsvp;
  }

  async update(user: JwtUser, eventId: string, payload: UpdateEventDto) {
    const event = await this.getOwnedEvent(user.sub, eventId);

    if (payload.title !== undefined) {
      event.title = payload.title;
    }

    if (payload.description !== undefined) {
      event.description = payload.description;
    }

    if (payload.mediaIds !== undefined) {
      event.mediaIds = payload.mediaIds;
    }

    if (payload.startDate !== undefined) {
      event.startDate = new Date(payload.startDate);
    }

    if (payload.endDate !== undefined) {
      event.endDate = new Date(payload.endDate);
    }

    if (payload.category !== undefined) {
      event.category = payload.category;
    }

    if (payload.moodTag !== undefined) {
      event.moodTag = payload.moodTag;
    }

    if (payload.ticketPrice !== undefined) {
      event.ticketPrice = payload.ticketPrice.toFixed(2);
    }

    if (payload.capacity !== undefined) {
      event.capacity = payload.capacity;
    }

    if (payload.paymentRequired !== undefined) {
      event.paymentRequired = payload.paymentRequired;
    }

    if (payload.venueName !== undefined) {
      event.venueName = payload.venueName;
    }

    if (payload.township !== undefined) {
      event.township = payload.township;
    }

    if (payload.district !== undefined) {
      event.district = payload.district;
    }

    if (payload.region !== undefined) {
      event.region = payload.region;
    }

    if (payload.country !== undefined) {
      event.country = payload.country;
    }

    if (payload.latitude !== undefined && payload.longitude !== undefined) {
      event.location = {
        type: 'Point',
        coordinates: [payload.longitude, payload.latitude],
      } as Point;
    }

    return this.eventsRepository.save(event);
  }

  async cancel(user: JwtUser, eventId: string) {
    const event = await this.getOwnedEvent(user.sub, eventId);
    event.isPublished = false;

    if (event.endDate > new Date()) {
      event.endDate = new Date();
    }

    await this.eventsRepository.save(event);

    return {
      id: eventId,
      cancelled: true,
      isPublished: false,
    };
  }

  private async getOwnedEvent(userId: string, eventId: string) {
    const event = await this.findOne(eventId);

    if (event.organizerId !== userId) {
      throw new ForbiddenException('You can only modify your own events');
    }

    return event;
  }
}

