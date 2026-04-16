import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentTarget } from '../../shared/enums/content-target.enum';
import { PaymentStatus } from '../../shared/enums/payment-status.enum';
import { Event } from '../events/entities/event.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CreatorAnalyticsRange } from './dto/creator-analytics-query.dto';

type MetricName = 'views' | 'rsvps' | 'paidAttendees';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(Reel)
    private readonly reelsRepository: Repository<Reel>,
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    private readonly usersService: UsersService,
  ) {}

  async getCreatorAnalytics(
    userId: string,
    range: CreatorAnalyticsRange = CreatorAnalyticsRange.WEEK,
  ) {
    await this.usersService.findById(userId);
    const windowStart = this.resolveWindowStart(range);

    const [
      postCount,
      reelCount,
      eventCount,
      interactionStats,
      paymentStats,
      rsvpStats,
      audienceLocation,
      activeEvents,
      topEvent,
      topPost,
      topContent,
      performance,
    ] = await Promise.all([
      this.countPosts(userId, windowStart),
      this.countReels(userId, windowStart),
      this.countEvents(userId, windowStart),
      this.fetchInteractionStats(userId, windowStart),
      this.fetchPaymentStats(userId, windowStart),
      this.fetchRsvpStats(userId, windowStart),
      this.fetchAudienceLocation(userId),
      this.fetchActiveEventCount(userId),
      this.fetchTopEvent(userId),
      this.fetchTopPost(userId),
      this.fetchTopContent(userId),
      this.fetchPerformanceSeries(userId, range, windowStart),
    ]);

    const views = Number(interactionStats.views ?? 0);
    const engagement =
      Number(interactionStats.likes ?? 0) +
      Number(interactionStats.comments ?? 0) +
      Number(interactionStats.shares ?? 0);
    const engagementRate = views > 0 ? (engagement / views) * 100 : 0;

    return {
      filter: {
        range,
        windowStart: windowStart.toISOString(),
        generatedAt: new Date().toISOString(),
      },
      content: {
        posts: postCount,
        reels: reelCount,
        events: eventCount,
      },
      metrics: {
        views,
        likes: Number(interactionStats.likes ?? 0),
        comments: Number(interactionStats.comments ?? 0),
        shares: Number(interactionStats.shares ?? 0),
        engagement,
        engagementRate: Number(engagementRate.toFixed(2)),
        rsvps: Number(rsvpStats.rsvps ?? 0),
        paidAttendees: Number(rsvpStats.paidAttendees ?? 0),
        activeEvents,
      },
      revenue: {
        successfulPayments: Number(paymentStats.successfulPayments ?? 0),
        totalRevenue: Number(paymentStats.totalRevenue ?? 0),
        currency: 'MWK',
      },
      audience: {
        locations: audienceLocation,
      },
      highlights: {
        mostViewedEvent: topEvent,
        mostEngagingPost: topPost,
        topPerformingContent: topContent,
      },
      performance: {
        series: performance,
      },
    };
  }

  async getAdminPlatformOverview(
    range: CreatorAnalyticsRange = CreatorAnalyticsRange.WEEK,
  ) {
    const windowStart = this.resolveWindowStart(range);

    const [
      usage,
      content,
      engagement,
      commerce,
      safety,
      topDistricts,
      topMoods,
      timeline,
    ] = await Promise.all([
      this.fetchAdminUsage(windowStart),
      this.fetchAdminContent(windowStart),
      this.fetchAdminEngagement(windowStart),
      this.fetchAdminCommerce(windowStart),
      this.fetchAdminSafety(windowStart),
      this.fetchAdminTopDistricts(windowStart),
      this.fetchAdminTopMoods(windowStart),
      this.fetchAdminTimeline(range, windowStart),
    ]);

    const totalUsers = Number(usage.totalUsers ?? 0);
    const activeUsers = Number(usage.activeUsers ?? 0);
    const funOclockUsers = Number(usage.funOclockEnabledUsers ?? 0);

    const funOclockAdoptionRate =
      totalUsers > 0 ? (funOclockUsers / totalUsers) * 100 : 0;
    const activeUserRate =
      totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;

    return {
      filter: {
        range,
        windowStart: windowStart.toISOString(),
        generatedAt: new Date().toISOString(),
      },
      usage: {
        ...usage,
        activeUserRate: Number(activeUserRate.toFixed(2)),
      },
      content,
      engagement,
      commerce,
      safety,
      behavior: {
        topDistricts,
        topMoodTags: topMoods,
        funOclockAdoptionRate: Number(funOclockAdoptionRate.toFixed(2)),
      },
      timeline,
    };
  }

  private async fetchAdminUsage(windowStart: Date) {
    const [row] = await this.usersRepository.query(
      `
        SELECT
          COUNT(*)::int AS "totalUsers",
          COUNT(*) FILTER (WHERE u.created_at >= $1)::int AS "newUsers",
          COUNT(*) FILTER (WHERE u.last_active_at IS NOT NULL AND u.last_active_at >= $1)::int AS "activeUsers",
          COUNT(*) FILTER (WHERE 'CAPITAL_USER' = ANY(u.roles) OR 'BUSINESS' = ANY(u.roles))::int AS "capitalUsers",
          COUNT(*) FILTER (WHERE 'ADMIN' = ANY(u.roles))::int AS "adminUsers",
          COUNT(*) FILTER (WHERE u.fun_oclock_enabled = true)::int AS "funOclockEnabledUsers"
        FROM users u
      `,
      [windowStart],
    );

    return {
      totalUsers: Number(row?.totalUsers ?? 0),
      newUsers: Number(row?.newUsers ?? 0),
      activeUsers: Number(row?.activeUsers ?? 0),
      capitalUsers: Number(row?.capitalUsers ?? 0),
      adminUsers: Number(row?.adminUsers ?? 0),
      funOclockEnabledUsers: Number(row?.funOclockEnabledUsers ?? 0),
    };
  }

  private async fetchAdminContent(windowStart: Date) {
    const [row] = await this.postsRepository.query(
      `
        SELECT
          (SELECT COUNT(*) FROM posts p WHERE p.created_at >= $1)::int AS posts,
          (SELECT COUNT(*) FROM reels r WHERE r.created_at >= $1)::int AS reels,
          (SELECT COUNT(*) FROM events e WHERE e.created_at >= $1)::int AS events,
          (SELECT COUNT(*) FROM events e WHERE e.created_at >= $1 AND e.status = 'LIVE')::int AS "liveEvents",
          (SELECT COUNT(*) FROM events e WHERE e.created_at >= $1 AND e.status = 'UPCOMING')::int AS "upcomingEvents",
          (SELECT COUNT(*) FROM events e WHERE e.created_at >= $1 AND e.payment_required = true)::int AS "ticketedEvents"
      `,
      [windowStart],
    );

    return {
      posts: Number(row?.posts ?? 0),
      reels: Number(row?.reels ?? 0),
      events: Number(row?.events ?? 0),
      liveEvents: Number(row?.liveEvents ?? 0),
      upcomingEvents: Number(row?.upcomingEvents ?? 0),
      ticketedEvents: Number(row?.ticketedEvents ?? 0),
    };
  }

  private async fetchAdminEngagement(windowStart: Date) {
    const [row] = await this.postsRepository.query(
      `
        SELECT
          (SELECT COUNT(*) FROM views v WHERE v.created_at >= $1)::int AS views,
          (SELECT COUNT(*) FROM likes l WHERE l.created_at >= $1)::int AS likes,
          (SELECT COUNT(*) FROM comments c WHERE c.created_at >= $1)::int AS comments,
          (SELECT COUNT(*) FROM shares s WHERE s.created_at >= $1)::int AS shares,
          (SELECT COUNT(*) FROM rsvps r WHERE r.created_at >= $1)::int AS rsvps,
          (SELECT COUNT(*) FROM rsvps r WHERE r.created_at >= $1 AND r.paid_at IS NOT NULL)::int AS "paidRsvps"
      `,
      [windowStart],
    );

    const views = Number(row?.views ?? 0);
    const likes = Number(row?.likes ?? 0);
    const comments = Number(row?.comments ?? 0);
    const shares = Number(row?.shares ?? 0);
    const rsvps = Number(row?.rsvps ?? 0);
    const paidRsvps = Number(row?.paidRsvps ?? 0);

    const totalInteractions = likes + comments + shares;
    const conversionRate = rsvps > 0 ? (paidRsvps / rsvps) * 100 : 0;

    return {
      views,
      likes,
      comments,
      shares,
      totalInteractions,
      rsvps,
      paidRsvps,
      paidRsvpConversionRate: Number(conversionRate.toFixed(2)),
    };
  }

  private async fetchAdminCommerce(windowStart: Date) {
    const [row] = await this.paymentsRepository.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE p.created_at >= $1)::int AS "paymentAttempts",
          COUNT(*) FILTER (WHERE p.created_at >= $1 AND p.status = $2)::int AS "successfulPayments",
          COALESCE(SUM(CASE WHEN p.created_at >= $1 AND p.status = $2 THEN p.amount::numeric ELSE 0 END), 0)::float AS "totalRevenue"
        FROM payments p
      `,
      [windowStart, PaymentStatus.SUCCESS],
    );

    const paymentAttempts = Number(row?.paymentAttempts ?? 0);
    const successfulPayments = Number(row?.successfulPayments ?? 0);
    const successRate =
      paymentAttempts > 0 ? (successfulPayments / paymentAttempts) * 100 : 0;

    return {
      paymentAttempts,
      successfulPayments,
      successRate: Number(successRate.toFixed(2)),
      totalRevenue: Number(row?.totalRevenue ?? 0),
      currency: 'MWK',
    };
  }

  private async fetchAdminSafety(windowStart: Date) {
    const [row] = await this.usersRepository.query(
      `
        SELECT
          (SELECT COUNT(*) FROM reports rp WHERE rp.created_at >= $1)::int AS "reportsCreated",
          (SELECT COUNT(*) FROM reports rp WHERE rp.status = 'OPEN')::int AS "openReports",
          (SELECT COUNT(*) FROM reports rp WHERE rp.created_at >= $1 AND rp.status = 'RESOLVED')::int AS "resolvedReports",
          (SELECT COUNT(*) FROM users u WHERE u.national_id_status = 'PENDING')::int AS "pendingNationalIdReviews",
          (SELECT COUNT(*) FROM users u WHERE u.national_id_status = 'VERIFIED')::int AS "verifiedNationalIds"
      `,
      [windowStart],
    );

    return {
      reportsCreated: Number(row?.reportsCreated ?? 0),
      openReports: Number(row?.openReports ?? 0),
      resolvedReports: Number(row?.resolvedReports ?? 0),
      pendingNationalIdReviews: Number(row?.pendingNationalIdReviews ?? 0),
      verifiedNationalIds: Number(row?.verifiedNationalIds ?? 0),
    };
  }

  private async fetchAdminTopDistricts(windowStart: Date) {
    const rows = (await this.postsRepository.query(
      `
        SELECT district, COUNT(*)::int AS count
        FROM (
          SELECT p.district
          FROM posts p
          WHERE p.created_at >= $1 AND p.district IS NOT NULL AND btrim(p.district) <> ''

          UNION ALL

          SELECT e.district
          FROM events e
          WHERE e.created_at >= $1 AND e.district IS NOT NULL AND btrim(e.district) <> ''

          UNION ALL

          SELECT u.district
          FROM users u
          WHERE u.created_at >= $1 AND u.district IS NOT NULL AND btrim(u.district) <> ''
        ) source
        GROUP BY district
        ORDER BY count DESC, district ASC
        LIMIT 5
      `,
      [windowStart],
    )) as Array<{ district: string; count: number }>;

    return rows.map((row) => ({
      district: row.district,
      count: Number(row.count ?? 0),
    }));
  }

  private async fetchAdminTopMoods(windowStart: Date) {
    const rows = (await this.postsRepository.query(
      `
        SELECT mood_tag AS mood, COUNT(*)::int AS count
        FROM (
          SELECT p.mood_tag
          FROM posts p
          WHERE p.created_at >= $1 AND p.mood_tag IS NOT NULL AND btrim(p.mood_tag) <> ''

          UNION ALL

          SELECT r.mood_tag
          FROM reels r
          WHERE r.created_at >= $1 AND r.mood_tag IS NOT NULL AND btrim(r.mood_tag) <> ''

          UNION ALL

          SELECT e.mood_tag
          FROM events e
          WHERE e.created_at >= $1 AND e.mood_tag IS NOT NULL AND btrim(e.mood_tag) <> ''
        ) source
        GROUP BY mood_tag
        ORDER BY count DESC, mood_tag ASC
        LIMIT 5
      `,
      [windowStart],
    )) as Array<{ mood: string; count: number }>;

    return rows.map((row) => ({
      mood: row.mood,
      count: Number(row.count ?? 0),
    }));
  }

  private async fetchAdminTimeline(
    range: CreatorAnalyticsRange,
    windowStart: Date,
  ) {
    const [signups, contentItems, successfulPayments] = await Promise.all([
      this.fetchTimedRows(
        `
          SELECT u.created_at AS "createdAt"
          FROM users u
          WHERE u.created_at >= $1
        `,
        [windowStart],
      ),
      this.fetchTimedRows(
        `
          SELECT p.created_at AS "createdAt"
          FROM posts p
          WHERE p.created_at >= $1

          UNION ALL

          SELECT r.created_at AS "createdAt"
          FROM reels r
          WHERE r.created_at >= $1

          UNION ALL

          SELECT e.created_at AS "createdAt"
          FROM events e
          WHERE e.created_at >= $1
        `,
        [windowStart],
      ),
      this.fetchTimedRows(
        `
          SELECT p.created_at AS "createdAt"
          FROM payments p
          WHERE p.created_at >= $1
            AND p.status = $2
        `,
        [windowStart, PaymentStatus.SUCCESS],
      ),
    ]);

    const buckets = this.createBuckets(range, windowStart);

    for (const value of signups) {
      this.incrementTimelineBucket(buckets, value, 'signups');
    }

    for (const value of contentItems) {
      this.incrementTimelineBucket(buckets, value, 'contentItems');
    }

    for (const value of successfulPayments) {
      this.incrementTimelineBucket(buckets, value, 'successfulPayments');
    }

    return buckets.map((bucket) => ({
      label: bucket.label,
      signups: bucket.signups,
      contentItems: bucket.contentItems,
      successfulPayments: bucket.successfulPayments,
    }));
  }

  private incrementTimelineBucket(
    buckets: _AnalyticsBucket[],
    value: Date,
    metric: 'signups' | 'contentItems' | 'successfulPayments',
  ) {
    for (const bucket of buckets) {
      if (value.getTime() >= bucket.start.getTime() &&
          value.getTime() < bucket.end.getTime()) {
        bucket.incrementTimeline(metric);
        break;
      }
    }
  }

  private async countPosts(userId: string, windowStart: Date) {
    return this.postsRepository
      .createQueryBuilder('post')
      .where('post.authorId = :userId', { userId })
      .andWhere('post.createdAt >= :windowStart', { windowStart })
      .getCount();
  }

  private async countReels(userId: string, windowStart: Date) {
    return this.reelsRepository
      .createQueryBuilder('reel')
      .where('reel.authorId = :userId', { userId })
      .andWhere('reel.createdAt >= :windowStart', { windowStart })
      .getCount();
  }

  private async countEvents(userId: string, windowStart: Date) {
    return this.eventsRepository
      .createQueryBuilder('event')
      .where('event.organizerId = :userId', { userId })
      .andWhere('event.createdAt >= :windowStart', { windowStart })
      .getCount();
  }

  private async fetchInteractionStats(userId: string, windowStart: Date) {
    const [row] = await this.postsRepository.query(
      `
        SELECT
          (
            SELECT COUNT(*)
            FROM likes l
            WHERE l.created_at >= $5
              AND (
                (l.target_type::text = $2 AND EXISTS (SELECT 1 FROM posts p WHERE p.id = l.target_id AND p.author_id = $1))
                OR (l.target_type::text = $3 AND EXISTS (SELECT 1 FROM reels r WHERE r.id = l.target_id AND r.author_id = $1))
                OR (l.target_type::text = $4 AND EXISTS (SELECT 1 FROM events e WHERE e.id = l.target_id AND e.organizer_id = $1))
              )
          )::int AS likes,
          (
            SELECT COUNT(*)
            FROM comments c
            WHERE c.created_at >= $5
              AND (
                (c.target_type::text = $2 AND EXISTS (SELECT 1 FROM posts p WHERE p.id = c.target_id AND p.author_id = $1))
                OR (c.target_type::text = $3 AND EXISTS (SELECT 1 FROM reels r WHERE r.id = c.target_id AND r.author_id = $1))
                OR (c.target_type::text = $4 AND EXISTS (SELECT 1 FROM events e WHERE e.id = c.target_id AND e.organizer_id = $1))
              )
          )::int AS comments,
          (
            SELECT COUNT(*)
            FROM shares s
            WHERE s.created_at >= $5
              AND (
                (s.target_type::text = $2 AND EXISTS (SELECT 1 FROM posts p WHERE p.id = s.target_id AND p.author_id = $1))
                OR (s.target_type::text = $3 AND EXISTS (SELECT 1 FROM reels r WHERE r.id = s.target_id AND r.author_id = $1))
                OR (s.target_type::text = $4 AND EXISTS (SELECT 1 FROM events e WHERE e.id = s.target_id AND e.organizer_id = $1))
              )
          )::int AS shares,
          (
            SELECT COUNT(*)
            FROM views v
            WHERE v.created_at >= $5
              AND (
                (v.target_type::text = $2 AND EXISTS (SELECT 1 FROM posts p WHERE p.id = v.target_id AND p.author_id = $1))
                OR (v.target_type::text = $3 AND EXISTS (SELECT 1 FROM reels r WHERE r.id = v.target_id AND r.author_id = $1))
                OR (v.target_type::text = $4 AND EXISTS (SELECT 1 FROM events e WHERE e.id = v.target_id AND e.organizer_id = $1))
              )
          )::int AS views
      `,
      [userId, ContentTarget.POST, ContentTarget.REEL, ContentTarget.EVENT, windowStart],
    );

    return row ?? {
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
    };
  }

  private async fetchPaymentStats(userId: string, windowStart: Date) {
    const [row] = await this.paymentsRepository.query(
      `
        SELECT
          COUNT(*)::int AS "successfulPayments",
          COALESCE(SUM(p.amount::numeric), 0)::float AS "totalRevenue"
        FROM payments p
        INNER JOIN events e ON e.id = p.event_id
        WHERE e.organizer_id = $1
          AND p.status = $2
          AND p.created_at >= $3
      `,
      [userId, PaymentStatus.SUCCESS, windowStart],
    );

    return row ?? {
      successfulPayments: 0,
      totalRevenue: 0,
    };
  }

  private async fetchRsvpStats(userId: string, windowStart: Date) {
    const [row] = await this.eventsRepository.query(
      `
        SELECT
          COUNT(*)::int AS rsvps,
          COUNT(CASE WHEN r.paid_at IS NOT NULL THEN 1 END)::int AS "paidAttendees"
        FROM rsvps r
        INNER JOIN events e ON e.id = r.event_id
        WHERE e.organizer_id = $1
          AND r.created_at >= $2
      `,
      [userId, windowStart],
    );

    return row ?? {
      rsvps: 0,
      paidAttendees: 0,
    };
  }

  private async fetchActiveEventCount(userId: string) {
    return this.eventsRepository
      .createQueryBuilder('event')
      .where('event.organizerId = :userId', { userId })
      .andWhere('event.isPublished = true')
      .andWhere('event.endDate >= :now', { now: new Date() })
      .getCount();
  }

  private async fetchAudienceLocation(userId: string) {
    const rows = await this.postsRepository.query(
      `
        SELECT location_key AS location, COUNT(*)::int AS count
        FROM (
          SELECT
            CASE
              WHEN p.district IS NOT NULL AND p.country IS NOT NULL THEN p.district || ', ' || p.country
              WHEN p.district IS NOT NULL THEN p.district
              WHEN p.country IS NOT NULL THEN p.country
              ELSE 'Unknown'
            END AS location_key
          FROM posts p
          WHERE p.author_id = $1

          UNION ALL

          SELECT
            CASE
              WHEN e.district IS NOT NULL AND e.country IS NOT NULL THEN e.district || ', ' || e.country
              WHEN e.district IS NOT NULL THEN e.district
              WHEN e.country IS NOT NULL THEN e.country
              ELSE 'Unknown'
            END AS location_key
          FROM events e
          WHERE e.organizer_id = $1
        ) src
        GROUP BY location_key
        ORDER BY count DESC
        LIMIT 10
      `,
      [userId],
    );

    return rows.map((row: { location: string; count: number }) => ({
      location: row.location,
      count: Number(row.count ?? 0),
    }));
  }

  private async fetchTopEvent(userId: string) {
    const row = await this.eventsRepository
      .createQueryBuilder('event')
      .select('event.id', 'id')
      .addSelect('event.title', 'title')
      .addSelect('event.venueName', 'venueName')
      .addSelect('event.status', 'status')
      .addSelect('event.startDate', 'startDate')
      .addSelect('event.viewCount', 'views')
      .addSelect('event.rsvpCount', 'rsvps')
      .addSelect('event.paymentCount', 'paidAttendees')
      .where('event.organizerId = :userId', { userId })
      .orderBy('event.viewCount', 'DESC')
      .addOrderBy('event.rsvpCount', 'DESC')
      .addOrderBy('event.paymentCount', 'DESC')
      .addOrderBy('event.startDate', 'DESC')
      .getRawOne<Record<string, unknown>>();

    return row ?? null;
  }

  private async fetchTopPost(userId: string) {
    const row = await this.postsRepository
      .createQueryBuilder('post')
      .select('post.id', 'id')
      .addSelect(`COALESCE(post.caption, 'Promotional post')`, 'title')
      .addSelect('post.likeCount', 'likes')
      .addSelect('post.commentCount', 'comments')
      .addSelect('post.shareCount', 'shares')
      .addSelect('post.impressionCount', 'impressions')
      .addSelect(
        '(post.likeCount + (post.commentCount * 2) + (post.shareCount * 3) + (post.impressionCount * 0.1))',
        'score',
      )
      .where('post.authorId = :userId', { userId })
      .orderBy('score', 'DESC')
      .addOrderBy('post.createdAt', 'DESC')
      .getRawOne<Record<string, unknown>>();

    return row ?? null;
  }

  private async fetchTopContent(userId: string) {
    const [row] = await this.postsRepository.query(
      `
        SELECT *
        FROM (
          SELECT
            p.id,
            'POST' AS type,
            COALESCE(p.caption, 'Promotional post') AS title,
            (p.like_count + (p.comment_count * 2) + (p.share_count * 3) + (p.impression_count * 0.1))::float AS score,
            p.created_at AS "createdAt"
          FROM posts p
          WHERE p.author_id = $1

          UNION ALL

          SELECT
            r.id,
            'REEL' AS type,
            COALESCE(r.caption, 'Business reel') AS title,
            (r.like_count + (r.comment_count * 2) + (r.share_count * 3) + (r.view_count * 0.2))::float AS score,
            r.created_at AS "createdAt"
          FROM reels r
          WHERE r.author_id = $1

          UNION ALL

          SELECT
            e.id,
            'EVENT' AS type,
            e.title,
            (e.view_count + (e.rsvp_count * 4) + (e.payment_count * 5))::float AS score,
            e.created_at AS "createdAt"
          FROM events e
          WHERE e.organizer_id = $1
        ) ranked
        ORDER BY score DESC, "createdAt" DESC
        LIMIT 1
      `,
      [userId],
    );

    return row ?? null;
  }

  private async fetchPerformanceSeries(
    userId: string,
    range: CreatorAnalyticsRange,
    windowStart: Date,
  ) {
    const [viewRows, rsvpRows, paymentRows] = await Promise.all([
      this.fetchTimedRows(
        `
          SELECT v.created_at AS "createdAt"
          FROM views v
          WHERE v.created_at >= $2
            AND (
              (v.target_type::text = $3 AND EXISTS (SELECT 1 FROM posts p WHERE p.id = v.target_id AND p.author_id = $1))
              OR (v.target_type::text = $4 AND EXISTS (SELECT 1 FROM reels r WHERE r.id = v.target_id AND r.author_id = $1))
              OR (v.target_type::text = $5 AND EXISTS (SELECT 1 FROM events e WHERE e.id = v.target_id AND e.organizer_id = $1))
            )
        `,
        [
          userId,
          windowStart,
          ContentTarget.POST,
          ContentTarget.REEL,
          ContentTarget.EVENT,
        ],
      ),
      this.fetchTimedRows(
        `
          SELECT r.created_at AS "createdAt"
          FROM rsvps r
          INNER JOIN events e ON e.id = r.event_id
          WHERE e.organizer_id = $1
            AND r.created_at >= $2
        `,
        [userId, windowStart],
      ),
      this.fetchTimedRows(
        `
          SELECT p.created_at AS "createdAt"
          FROM payments p
          INNER JOIN events e ON e.id = p.event_id
          WHERE e.organizer_id = $1
            AND p.status = $2
            AND p.created_at >= $3
        `,
        [userId, PaymentStatus.SUCCESS, windowStart],
      ),
    ]);

    const buckets = this.createBuckets(range, windowStart);
    this.applyTimedRows(buckets, viewRows, 'views');
    this.applyTimedRows(buckets, rsvpRows, 'rsvps');
    this.applyTimedRows(buckets, paymentRows, 'paidAttendees');

    return buckets.map((bucket) => ({
      label: bucket.label,
      views: bucket.views,
      rsvps: bucket.rsvps,
      paidAttendees: bucket.paidAttendees,
    }));
  }

  private async fetchTimedRows(query: string, params: unknown[]) {
    const rows = (await this.eventsRepository.query(query, params)) as Array<{
      createdAt?: string | Date;
    }>;

    return rows
      .map((row) => {
        const value = row.createdAt;
        return value instanceof Date ? value : new Date(String(value));
      })
      .filter((value) => !Number.isNaN(value.getTime()));
  }

  private createBuckets(
    range: CreatorAnalyticsRange,
    windowStart: Date,
  ): _AnalyticsBucket[] {
    switch (range) {
      case CreatorAnalyticsRange.TODAY:
        return Array.from({ length: 6 }, (_, index) => {
          const start = new Date(windowStart);
          start.setHours(index * 4, 0, 0, 0);
          const end = new Date(start);
          end.setHours(start.getHours() + 4, 0, 0, 0);
          return new _AnalyticsBucket(
            `${start.getHours().toString().padStart(2, '0')}:00`,
            start,
            end,
          );
        });
      case CreatorAnalyticsRange.MONTH:
        return Array.from({ length: 6 }, (_, index) => {
          const start = new Date(windowStart);
          start.setDate(windowStart.getDate() + (index * 5));
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setDate(start.getDate() + 5);
          return new _AnalyticsBucket(
            `${(start.getMonth() + 1).toString().padStart(2, '0')}/${start.getDate().toString().padStart(2, '0')}`,
            start,
            end,
          );
        });
      case CreatorAnalyticsRange.WEEK:
        return Array.from({ length: 7 }, (_, index) => {
          const start = new Date(windowStart);
          start.setDate(windowStart.getDate() + index);
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setDate(start.getDate() + 1);
          return new _AnalyticsBucket(_weekdayLabel(start), start, end);
        });
    }
  }

  private applyTimedRows(
    buckets: _AnalyticsBucket[],
    rows: Date[],
    metric: MetricName,
  ) {
    for (const value of rows) {
      for (const bucket of buckets) {
        if (value.getTime() >= bucket.start.getTime() &&
            value.getTime() < bucket.end.getTime()) {
          bucket.increment(metric);
          break;
        }
      }
    }
  }

  private resolveWindowStart(range: CreatorAnalyticsRange) {
    const now = new Date();
    switch (range) {
      case CreatorAnalyticsRange.TODAY:
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case CreatorAnalyticsRange.MONTH:
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      case CreatorAnalyticsRange.WEEK:
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    }
  }
}

function _weekdayLabel(value: Date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[value.getDay()];
}

class _AnalyticsBucket {
  views = 0;
  rsvps = 0;
  paidAttendees = 0;
  signups = 0;
  contentItems = 0;
  successfulPayments = 0;

  constructor(
    readonly label: string,
    readonly start: Date,
    readonly end: Date,
  ) {}

  increment(metric: MetricName) {
    this[metric] += 1;
  }

  incrementTimeline(metric: 'signups' | 'contentItems' | 'successfulPayments') {
    this[metric] += 1;
  }
}
