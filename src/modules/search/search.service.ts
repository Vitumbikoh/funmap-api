import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from '../users/entities/user.entity';
import { SearchQueryDto } from './dto/search-query.dto';
import { resolveEffectiveSubscriptionPlan } from '../../shared/services/subscription-access.service';

type DiscoverySection = 'users' | 'posts' | 'reels' | 'events' | 'hashtags';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(Reel)
    private readonly reelsRepository: Repository<Reel>,
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
  ) {}

  async discover(userId: string, query: SearchQueryDto) {
    const viewer = await this.usersRepository.findOne({
      where: { id: userId },
      select: {
        id: true,
        subscriptionPlan: true,
        subscriptionExpiresAt: true,
        township: true,
        district: true,
        region: true,
        country: true,
      },
    });

    if (!viewer) {
      throw new NotFoundException('User not found');
    }

    const term = (query.q ?? '').trim();
    const parsedLimit = Number(query.limit ?? 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(50, Math.floor(parsedLimit)))
      : 10;

    const include = this.parseInclude(query.include);
    const latitude = this.toNullableNumber(query.latitude);
    const longitude = this.toNullableNumber(query.longitude);
    const parsedRadius = this.toNullableNumber(query.radiusKm);
    const radiusKm = parsedRadius !== null ? Math.max(1, Math.min(parsedRadius, 100)) : 15;
    const district = query.district?.trim() || null;
    const country = query.country?.trim() || null;

    if (term.length < 2) {
      return {
        query: term,
        include: Array.from(include),
        users: [],
        hashtags: [],
        posts: [],
        reels: [],
        events: [],
      };
    }

    const [users, hashtags, posts, reels, events] = await Promise.all([
      include.has('users')
        ? this.searchUsers(term, limit, district, country, viewer)
        : Promise.resolve([]),
      include.has('hashtags') ? this.searchHashtags(term, limit) : Promise.resolve([]),
      include.has('posts')
        ? this.searchPosts(term, limit, latitude, longitude, radiusKm, district, country, viewer)
        : Promise.resolve([]),
      include.has('reels')
        ? this.searchReels(term, limit, latitude, longitude, radiusKm, district, country, viewer)
        : Promise.resolve([]),
      include.has('events')
        ? this.searchEvents(term, limit, latitude, longitude, radiusKm, district, country, viewer)
        : Promise.resolve([]),
    ]);

    return {
      query: term,
      include: Array.from(include),
      users,
      hashtags,
      posts,
      reels,
      events,
    };
  }

  private parseInclude(rawInclude?: string) {
    const all: DiscoverySection[] = ['users', 'posts', 'reels', 'events', 'hashtags'];

    if (!rawInclude?.trim()) {
      return new Set<DiscoverySection>(all);
    }

    const selected = rawInclude
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part): part is DiscoverySection => all.includes(part as DiscoverySection));

    return new Set<DiscoverySection>(selected.length ? selected : all);
  }

  private toNullableNumber(raw?: string) {
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async searchUsers(term: string, limit: number, district: string | null, country: string | null, viewer: User) {
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .select([
        'user.id AS id',
        'user.username AS "username"',
        'user.displayName AS "displayName"',
        'user.avatarUrl AS "avatarUrl"',
        'user.bio AS bio',
        'user.isVerified AS "isVerified"',
        'user.district AS district',
        'user.country AS country',
      ])
      .where(
        '(user.username ILIKE :keyword OR user.displayName ILIKE :keyword OR user.bio ILIKE :keyword)',
        {
          keyword: `%${term}%`,
        },
      )
      .orderBy('user.isVerified', 'DESC')
      .addOrderBy('user.updatedAt', 'DESC')
      .limit(limit);

    this.applyLocationScopeToUserQuery(qb, district, country, viewer);

    return qb.getRawMany();
  }

  private async searchHashtags(term: string, limit: number) {
    return this.postsRepository.query(
      `
        SELECT
          tag,
          COUNT(*)::int AS usage_count
        FROM (
          SELECT LOWER(UNNEST(p.hashtags)) AS tag
          FROM posts p
          UNION ALL
          SELECT LOWER(UNNEST(r.hashtags)) AS tag
          FROM reels r
        ) tags
        WHERE tag ILIKE $1
        GROUP BY tag
        ORDER BY usage_count DESC, tag ASC
        LIMIT $2
      `,
      [`%${term.replace(/^#/, '')}%`, limit],
    );
  }

  private async searchPosts(
    term: string,
    limit: number,
    latitude: number | null,
    longitude: number | null,
    radiusKm: number,
    district: string | null,
    country: string | null,
    viewer: User,
  ) {
    const hasGeo = latitude !== null && longitude !== null;
    const params: unknown[] = [`%${term}%`, limit];
    const conditions = [
      '(p.caption ILIKE $1 OR EXISTS (SELECT 1 FROM UNNEST(p.hashtags) tag WHERE tag ILIKE $1))',
    ];

    this.applyLocationScopeToSqlConditions({
      alias: 'p',
      params,
      conditions,
      district,
      country,
      viewer,
      supportsRegion: false,
      supportsTownship: false,
    });

    if (hasGeo) {
      params.push(longitude, latitude, radiusKm);
      const lonIndex = params.length - 2;
      const latIndex = params.length - 1;
      const radiusIndex = params.length;
      conditions.push(
        `p.location IS NOT NULL AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint($${lonIndex}, $${latIndex}), 4326)::geography, $${radiusIndex} * 1000)`,
      );
    }

    return this.postsRepository.query(
      `
        SELECT
          p.id,
          p.author_id AS "authorId",
          p.caption,
          p.media_ids AS "mediaIds",
          p.hashtags,
          p.mood_tag AS "moodTag",
          p.like_count AS "likeCount",
          p.comment_count AS "commentCount",
          p.share_count AS "shareCount",
          p.impression_count AS "impressionCount",
          p.created_at AS "createdAt",
          p.district,
          p.country
        FROM posts p
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.created_at DESC
        LIMIT $2
      `,
      params,
    );
  }

  private async searchReels(
    term: string,
    limit: number,
    latitude: number | null,
    longitude: number | null,
    radiusKm: number,
    _district: string | null,
    _country: string | null,
    viewer: User,
  ) {
    const hasGeo = latitude !== null && longitude !== null;
    const params: unknown[] = [`%${term}%`, limit];
    const conditions = [
      '(r.caption ILIKE $1 OR EXISTS (SELECT 1 FROM UNNEST(r.hashtags) tag WHERE tag ILIKE $1))',
    ];

    if (hasGeo) {
      params.push(longitude, latitude, radiusKm);
      const lonIndex = params.length - 2;
      const latIndex = params.length - 1;
      const radiusIndex = params.length;
      conditions.push(
        `r.location IS NOT NULL AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($${lonIndex}, $${latIndex}), 4326)::geography, $${radiusIndex} * 1000)`,
      );
    }

    return this.reelsRepository.query(
      `
        SELECT
          r.id,
          r.author_id AS "authorId",
          r.caption,
          r.media_id AS "mediaId",
          r.thumbnail_media_id AS "thumbnailMediaId",
          r.duration_seconds AS "durationSeconds",
          r.hashtags,
          r.like_count AS "likeCount",
          r.comment_count AS "commentCount",
          r.share_count AS "shareCount",
          r.view_count AS "viewCount",
          r.completion_rate AS "completionRate",
          r.created_at AS "createdAt",
          NULL::text AS district,
          NULL::text AS country
        FROM reels r
        WHERE ${conditions.join(' AND ')}
        ORDER BY r.created_at DESC
        LIMIT $2
      `,
      params,
    );
  }

  private async searchEvents(
    term: string,
    limit: number,
    latitude: number | null,
    longitude: number | null,
    radiusKm: number,
    district: string | null,
    country: string | null,
    viewer: User,
  ) {
    const hasGeo = latitude !== null && longitude !== null;
    const params: unknown[] = [`%${term}%`, limit];
    const conditions = [
      '(e.title ILIKE $1 OR e.description ILIKE $1 OR e.venue_name ILIKE $1)',
      'e.is_published = true',
      'e.end_date >= NOW()',
    ];

    this.applyLocationScopeToSqlConditions({
      alias: 'e',
      params,
      conditions,
      district,
      country,
      viewer,
      supportsRegion: true,
      supportsTownship: true,
    });

    if (hasGeo) {
      params.push(longitude, latitude, radiusKm);
      const lonIndex = params.length - 2;
      const latIndex = params.length - 1;
      const radiusIndex = params.length;
      conditions.push(
        `ST_DWithin(e.location, ST_SetSRID(ST_MakePoint($${lonIndex}, $${latIndex}), 4326)::geography, $${radiusIndex} * 1000)`,
      );
    }

    return this.eventsRepository.query(
      `
        SELECT
          e.id,
          e.organizer_id AS "organizerId",
          e.title,
          e.description,
          e.media_ids AS "mediaIds",
          e.start_date AS "startDate",
          e.end_date AS "endDate",
          e.venue_name AS "venueName",
          e.category,
          e.ticket_price AS "ticketPrice",
          e.rsvp_count AS "rsvpCount",
          e.payment_count AS "paymentCount",
          e.view_count AS "viewCount",
          e.created_at AS "createdAt",
          e.district,
          e.country,
          ST_Y(e.location::geometry) AS latitude,
          ST_X(e.location::geometry) AS longitude
        FROM events e
        WHERE ${conditions.join(' AND ')}
        ORDER BY e.start_date ASC
        LIMIT $2
      `,
      params,
    );
  }

  private applyLocationScopeToUserQuery(
    qb: any,
    district: string | null,
    country: string | null,
    viewer: User,
  ) {
    const { effectivePlan } = resolveEffectiveSubscriptionPlan(viewer);

    if (effectivePlan === 'LITE' && viewer.township?.trim()) {
      qb.andWhere('user.township ILIKE :township', { township: viewer.township.trim() });
      return;
    }

    if (effectivePlan === 'BRONZE' && (district ?? viewer.district?.trim())) {
      qb.andWhere('user.district ILIKE :district', {
        district: district ?? viewer.district?.trim(),
      });
      return;
    }

    if (effectivePlan === 'SILVER' && viewer.region?.trim()) {
      qb.andWhere('user.region ILIKE :region', { region: viewer.region.trim() });
      return;
    }

    qb.andWhere('user.country ILIKE :country', {
      country: country ?? viewer.country?.trim() ?? '',
    });
  }

  private applyLocationScopeToSqlConditions(options: {
    alias: string;
    params: unknown[];
    conditions: string[];
    district: string | null;
    country: string | null;
    viewer: User;
    supportsRegion: boolean;
    supportsTownship: boolean;
  }) {
    const { effectivePlan } = resolveEffectiveSubscriptionPlan(options.viewer);

    if (effectivePlan === 'LITE' && options.supportsTownship && options.viewer.township?.trim()) {
      options.params.push(options.viewer.township.trim());
      options.conditions.push(`${options.alias}.township ILIKE $${options.params.length}`);
      return;
    }

    if (effectivePlan === 'BRONZE' && (options.district ?? options.viewer.district?.trim())) {
      options.params.push(options.district ?? options.viewer.district!.trim());
      options.conditions.push(`${options.alias}.district ILIKE $${options.params.length}`);
      return;
    }

    if (effectivePlan === 'SILVER' && options.supportsRegion && options.viewer.region?.trim()) {
      options.params.push(options.viewer.region.trim());
      options.conditions.push(`${options.alias}.region ILIKE $${options.params.length}`);
      return;
    }

    options.params.push(options.country ?? options.viewer.country?.trim() ?? '');
    options.conditions.push(`${options.alias}.country ILIKE $${options.params.length}`);
  }
}
