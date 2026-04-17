import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Point } from 'geojson';
import { Repository } from 'typeorm';
import { EventLifecycleStatus } from '../../shared/enums/event-lifecycle-status.enum';
import { EventCategory } from '../../shared/enums/event-category.enum';
import { Role } from '../../shared/enums/role.enum';
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { enforceCoverageForBusiness } from '../../shared/services/coverage-policy.service';
import { CreateEventDto } from './dto/create-event.dto';
import { NearbyEventsQueryDto } from './dto/nearby-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Event } from './entities/event.entity';
import { Rsvp } from './entities/rsvp.entity';
import { User } from '../users/entities/user.entity';

type EventListItem = Record<string, unknown>;
type AttendeeItem = Record<string, unknown>;

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Rsvp)
    private readonly rsvpRepository: Repository<Rsvp>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(user: JwtUser, payload: CreateEventDto) {
    const canCreateEvent =
      user.roles.includes(Role.BUSINESS) ||
      user.roles.includes(Role.CAPITAL_USER);

    if (!canCreateEvent) {
      throw new ForbiddenException('Only business accounts can add events.');
    }

    const creator = await this.usersRepository.findOne({
      where: { id: user.sub },
      select: {
        id: true,
        subscriptionPlan: true,
      },
    });

    if (creator) {
      enforceCoverageForBusiness(user.roles, creator.subscriptionPlan, {
        township: payload.township,
        district: payload.district,
        region: payload.region,
        country: payload.country,
      });
    }

    const startDate = new Date(payload.startDate);
    const endDate = new Date(payload.endDate);

    const event = this.eventsRepository.create({
      organizerId: user.sub,
      title: payload.title,
      description: payload.description,
      mediaIds: payload.mediaIds,
      startDate,
      endDate,
      category: payload.category,
      moodTag: payload.moodTag,
      hashtags: this.normalizeTags(payload.hashtags),
      ticketPrice: payload.ticketPrice.toFixed(2),
      capacity: payload.capacity,
      paymentRequired: payload.paymentRequired,
      paymentLink: payload.paymentLink,
      status: payload.status ?? this.deriveStatus(startDate, endDate),
      isPublished: payload.category !== EventCategory.COMMUNITY,
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

  async findNearby(query: NearbyEventsQueryDto) {
    const params: unknown[] = [
      query.longitude,
      query.latitude,
      query.radiusKm ?? 10,
    ];

    const conditions = [
      'e.is_published = true',
      'e.end_date >= NOW()',
      'ST_DWithin(e.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)',
    ];

    if (query.category) {
      params.push(query.category);
      conditions.push(`e.category = $${params.length}`);
    }

    let moodOrderParameterIndex: number | null = null;

    if (query.moodTag) {
      params.push(query.moodTag.toLowerCase());
      conditions.push(`LOWER(COALESCE(e.mood_tag, '')) = $${params.length}`);
      moodOrderParameterIndex = params.length;
    }

    if (query.dateBucket === 'TONIGHT') {
      conditions.push(
        `e.start_date >= date_trunc('day', NOW()) AND e.start_date < date_trunc('day', NOW()) + INTERVAL '1 day'`,
      );
    }

    if (query.dateBucket === 'TOMORROW') {
      conditions.push(
        `e.start_date >= date_trunc('day', NOW()) + INTERVAL '1 day' AND e.start_date < date_trunc('day', NOW()) + INTERVAL '2 day'`,
      );
    }

    if (query.dateBucket === 'THIS_WEEK') {
      conditions.push(
        `e.start_date >= NOW() AND e.start_date < NOW() + INTERVAL '7 day'`,
      );
    }

    const trendingExpression = `(
      (
        COALESCE(event_like_count.value, 0) +
        COALESCE(event_comment_count.value, 0) +
        COALESCE(event_share_count.value, 0) +
        e.rsvp_count +
        e.payment_count
      ) >= 12
      OR e.created_at >= NOW() - INTERVAL '2 hours'
    )`;

    if (query.mapPinType === 'TRENDING') {
      conditions.push(trendingExpression);
    }

    if (query.mapPinType === 'EVENT') {
      conditions.push(`NOT ${trendingExpression}`);
    }

    const moodPriorityOrder = moodOrderParameterIndex
      ? `CASE WHEN LOWER(COALESCE(e.mood_tag, '')) = $${moodOrderParameterIndex} THEN 1 ELSE 0 END DESC,`
      : '';

    return this.eventsRepository.query(
      `
        SELECT
          e.*,
          u.display_name AS "organizerDisplayName",
          u.avatar_url AS "organizerAvatarUrl",
          COALESCE(event_like_count.value, 0) AS "likeCount",
          COALESCE(event_comment_count.value, 0) AS "commentCount",
          COALESCE(event_share_count.value, 0) AS "shareCount",
          CASE WHEN ${trendingExpression} THEN 'TRENDING' ELSE 'EVENT' END AS "pinType",
          ST_Y(e.location::geometry) AS latitude,
          ST_X(e.location::geometry) AS longitude,
          ST_Distance(
            e.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 AS distance_km
        FROM events e
        LEFT JOIN users u ON u.id = e.organizer_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS value
          FROM likes l
          WHERE l.target_type::text = 'EVENT' AND l.target_id = e.id
        ) event_like_count ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS value
          FROM comments c
          WHERE c.target_type::text = 'EVENT' AND c.target_id = e.id
        ) event_comment_count ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS value
          FROM shares s
          WHERE s.target_type::text = 'EVENT' AND s.target_id = e.id
        ) event_share_count ON TRUE
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${moodPriorityOrder} e.start_date ASC
        LIMIT 50
      `,
      params,
    );
  }

  async findMine(user: JwtUser) {
    const items = (await this.eventsRepository.query(
      `
        SELECT
          e.*,
          ST_Y(e.location::geometry) AS latitude,
          ST_X(e.location::geometry) AS longitude,
          EXISTS (
            SELECT 1
            FROM promotions promo
            WHERE promo.target_type = 'EVENT'
              AND promo.target_id = e.id
              AND promo.status = 'ACTIVE'
          ) AS "isBoosted"
        FROM events e
        WHERE e.organizer_id = $1
        ORDER BY e.start_date DESC, e.created_at DESC
      `,
      [user.sub],
    )) as EventListItem[];

    return {
      items,
      summary: {
        total: items.length,
        upcoming: items.filter(
          (item) => item.status === EventLifecycleStatus.UPCOMING,
        ).length,
        live: items.filter(
          (item) => item.status === EventLifecycleStatus.LIVE,
        ).length,
        completed: items.filter(
          (item) => item.status === EventLifecycleStatus.COMPLETED,
        ).length,
        cancelled: items.filter(
          (item) => item.status === EventLifecycleStatus.CANCELLED,
        ).length,
        views: items.reduce(
          (sum, item) => sum + toInt(item.view_count ?? item.viewCount),
          0,
        ),
        rsvps: items.reduce(
          (sum, item) => sum + toInt(item.rsvp_count ?? item.rsvpCount),
          0,
        ),
        paidAttendees: items.reduce(
          (sum, item) => sum + toInt(item.payment_count ?? item.paymentCount),
          0,
        ),
      },
    };
  }

  async findAttendees(user: JwtUser, eventId: string) {
    await this.getOwnedEvent(user.sub, eventId);

    const items = (await this.rsvpRepository.query(
      `
        SELECT
          r.id,
          r.status,
          r.payment_required AS "paymentRequired",
          r.created_at AS "bookedAt",
          r.paid_at AS "paidAt",
          u.id AS "userId",
          u.display_name AS "displayName",
          u.username,
          u.avatar_url AS "avatarUrl",
          u.phone_number AS "phoneNumber",
          p.status AS "paymentStatus",
          p.amount,
          p.currency,
          p.created_at AS "paymentCreatedAt"
        FROM rsvps r
        INNER JOIN users u ON u.id = r.user_id
        LEFT JOIN LATERAL (
          SELECT payment.status, payment.amount, payment.currency, payment.created_at
          FROM payments payment
          WHERE payment.event_id = r.event_id
            AND payment.user_id = r.user_id
          ORDER BY payment.created_at DESC
          LIMIT 1
        ) p ON true
        WHERE r.event_id = $1
        ORDER BY r.created_at DESC
      `,
      [eventId],
    )) as AttendeeItem[];

    return {
      items,
      totals: {
        total: items.length,
        confirmed: items.filter(
          (item) => item.status === RsvpStatus.CONFIRMED,
        ).length,
        pending: items.filter(
          (item) => item.status === RsvpStatus.PENDING,
        ).length,
        paid: items.filter((item) => item.paidAt != null).length,
      },
    };
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
        status: event.paymentRequired
          ? RsvpStatus.PENDING
          : RsvpStatus.CONFIRMED,
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
    const creator = await this.usersRepository.findOne({
      where: { id: user.sub },
      select: {
        id: true,
        subscriptionPlan: true,
      },
    });

    if (creator) {
      enforceCoverageForBusiness(user.roles, creator.subscriptionPlan, {
        township: payload.township ?? event.township,
        district: payload.district ?? event.district,
        region: payload.region ?? event.region,
        country: payload.country ?? event.country,
      });
    }

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

      if (payload.category === EventCategory.COMMUNITY) {
        event.isPublished = false;
      }
    }

    if (payload.moodTag !== undefined) {
      event.moodTag = payload.moodTag;
    }

    if (payload.hashtags !== undefined) {
      event.hashtags = this.normalizeTags(payload.hashtags);
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

    if (payload.paymentLink !== undefined) {
      event.paymentLink = payload.paymentLink;
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

    if (payload.status !== undefined) {
      event.status = payload.status;
      event.isPublished = payload.status !== EventLifecycleStatus.CANCELLED;
    } else {
      event.status = this.deriveStatus(event.startDate, event.endDate);
    }

    if (event.category === EventCategory.COMMUNITY && event.isPublished) {
      event.isPublished = false;
    }

    return this.eventsRepository.save(event);
  }

  async reviewCommunityEvent(eventId: string, approved: boolean) {
    const event = await this.findOne(eventId);

    if (event.category !== EventCategory.COMMUNITY) {
      throw new BadRequestException('Only COMMUNITY events require review.');
    }

    if (approved) {
      event.isPublished = true;
      event.status = this.deriveStatus(event.startDate, event.endDate);
    } else {
      event.isPublished = false;
      event.status = EventLifecycleStatus.CANCELLED;
    }

    const saved = await this.eventsRepository.save(event);

    return {
      id: saved.id,
      approved,
      isPublished: saved.isPublished,
      status: saved.status,
    };
  }

  async cancel(user: JwtUser, eventId: string) {
    const event = await this.getOwnedEvent(user.sub, eventId);
    event.isPublished = false;
    event.status = EventLifecycleStatus.CANCELLED;

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

  private deriveStatus(startDate: Date, endDate: Date) {
    const now = new Date();
    if (endDate.getTime() < now.getTime()) {
      return EventLifecycleStatus.COMPLETED;
    }
    if (
      startDate.getTime() <= now.getTime() &&
      endDate.getTime() >= now.getTime()
    ) {
      return EventLifecycleStatus.LIVE;
    }
    return EventLifecycleStatus.UPCOMING;
  }

  private normalizeTags(tags?: string[]) {
    return (tags ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
}

function toInt(value: unknown) {
  if (typeof value === 'number') {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    return Number.parseInt(value, 10) || 0;
  }

  return 0;
}
