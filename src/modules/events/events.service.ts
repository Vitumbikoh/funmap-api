import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Point } from 'geojson';
import { Repository } from 'typeorm';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreateEventDto } from './dto/create-event.dto';
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
          ST_Distance(
            e.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 AS distance_km
        FROM events e
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

    if (!event.paymentRequired) {
      rsvp.status = RsvpStatus.CONFIRMED;
    }

    const savedRsvp = await this.rsvpRepository.save(rsvp);

    if (!event.paymentRequired) {
      event.rsvpCount += 1;
      await this.eventsRepository.save(event);
    }

    return savedRsvp;
  }
}

