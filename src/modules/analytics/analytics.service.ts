import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentTarget } from '../../shared/enums/content-target.enum';
import { PaymentStatus } from '../../shared/enums/payment-status.enum';
import { Event } from '../events/entities/event.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class AnalyticsService {
  constructor(
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

  async getCreatorAnalytics(userId: string) {
    await this.usersService.findById(userId);

    const [
      postCount,
      reelCount,
      eventCount,
      interactionStats,
      paymentStats,
      audienceLocation,
    ] = await Promise.all([
      this.postsRepository.count({ where: { authorId: userId } }),
      this.reelsRepository.count({ where: { authorId: userId } }),
      this.eventsRepository.count({ where: { organizerId: userId } }),
      this.fetchInteractionStats(userId),
      this.fetchPaymentStats(userId),
      this.fetchAudienceLocation(userId),
    ]);

    const views = Number(interactionStats.views ?? 0);
    const engagement =
      Number(interactionStats.likes ?? 0) +
      Number(interactionStats.comments ?? 0) +
      Number(interactionStats.shares ?? 0);

    const engagementRate = views > 0 ? (engagement / views) * 100 : 0;

    return {
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
      },
      revenue: {
        successfulPayments: Number(paymentStats.successfulPayments ?? 0),
        totalRevenue: Number(paymentStats.totalRevenue ?? 0),
        currency: 'MWK',
      },
      audience: {
        locations: audienceLocation,
      },
    };
  }

  private async fetchInteractionStats(userId: string) {
    const [row] = await this.postsRepository.query(
      `
        SELECT
          (
            SELECT COUNT(*)
            FROM likes l
            WHERE
              (l.target_type = $2 AND EXISTS (SELECT 1 FROM posts p WHERE p.id = l.target_id AND p.author_id = $1))
              OR (l.target_type = $3 AND EXISTS (SELECT 1 FROM reels r WHERE r.id = l.target_id AND r.author_id = $1))
              OR (l.target_type = $4 AND EXISTS (SELECT 1 FROM events e WHERE e.id = l.target_id AND e.organizer_id = $1))
          )::int AS likes,
          (
            SELECT COUNT(*)
            FROM comments c
            WHERE
              (c.target_type = $2 AND EXISTS (SELECT 1 FROM posts p WHERE p.id = c.target_id AND p.author_id = $1))
              OR (c.target_type = $3 AND EXISTS (SELECT 1 FROM reels r WHERE r.id = c.target_id AND r.author_id = $1))
              OR (c.target_type = $4 AND EXISTS (SELECT 1 FROM events e WHERE e.id = c.target_id AND e.organizer_id = $1))
          )::int AS comments,
          (
            SELECT COUNT(*)
            FROM shares s
            WHERE
              (s.target_type = $2 AND EXISTS (SELECT 1 FROM posts p WHERE p.id = s.target_id AND p.author_id = $1))
              OR (s.target_type = $3 AND EXISTS (SELECT 1 FROM reels r WHERE r.id = s.target_id AND r.author_id = $1))
              OR (s.target_type = $4 AND EXISTS (SELECT 1 FROM events e WHERE e.id = s.target_id AND e.organizer_id = $1))
          )::int AS shares,
          (
            SELECT COUNT(*)
            FROM views v
            WHERE
              (v.target_type = $2 AND EXISTS (SELECT 1 FROM posts p WHERE p.id = v.target_id AND p.author_id = $1))
              OR (v.target_type = $3 AND EXISTS (SELECT 1 FROM reels r WHERE r.id = v.target_id AND r.author_id = $1))
              OR (v.target_type = $4 AND EXISTS (SELECT 1 FROM events e WHERE e.id = v.target_id AND e.organizer_id = $1))
          )::int AS views
      `,
      [userId, ContentTarget.POST, ContentTarget.REEL, ContentTarget.EVENT],
    );

    return row ?? {
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
    };
  }

  private async fetchPaymentStats(userId: string) {
    const [row] = await this.paymentsRepository.query(
      `
        SELECT
          COUNT(*)::int AS "successfulPayments",
          COALESCE(SUM(p.amount::numeric), 0)::float AS "totalRevenue"
        FROM payments p
        INNER JOIN events e ON e.id = p.event_id
        WHERE e.organizer_id = $1
          AND p.status = $2
      `,
      [userId, PaymentStatus.SUCCESS],
    );

    return row ?? {
      successfulPayments: 0,
      totalRevenue: 0,
    };
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
}
