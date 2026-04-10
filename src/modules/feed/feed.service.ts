import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from '../../shared/database/entities/comment.entity';
import { Like } from '../../shared/database/entities/like.entity';
import { Share } from '../../shared/database/entities/share.entity';
import { View } from '../../shared/database/entities/view.entity';
import { Event } from '../events/entities/event.entity';
import { Follow } from '../follows/entities/follow.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { FeedQueryDto } from './dto/feed-query.dto';

@Injectable()
export class FeedService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(Reel)
    private readonly reelsRepository: Repository<Reel>,
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Follow)
    private readonly followsRepository: Repository<Follow>,
    @InjectRepository(Like)
    private readonly likesRepository: Repository<Like>,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Share)
    private readonly sharesRepository: Repository<Share>,
    @InjectRepository(View)
    private readonly viewsRepository: Repository<View>,
  ) {}

  async getNearbyFeed(query: FeedQueryDto) {
    const radiusKm = query.radiusKm ?? 10;

    const [posts, reels, events] = await Promise.all([
      this.postsRepository.query(
        `
          SELECT
            'POST' AS type,
            p.id,
            p.caption AS title,
            p.media_ids AS "mediaIds",
            p.created_at AS "createdAt",
            COALESCE(post_promo.boost_multiplier, 1) AS "boostMultiplier",
            (
              (p.like_count * 1) +
              (p.comment_count * 2) +
              (p.share_count * 3) +
              (p.impression_count * 0.1) +
              GREATEST(0, 24 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600)
            ) * COALESCE(post_promo.boost_multiplier, 1) AS score
          FROM posts p
          LEFT JOIN LATERAL (
            SELECT promo.boost_multiplier
            FROM promotions promo
            WHERE promo.target_type = 'POST'
              AND promo.target_id = p.id
              AND promo.status = 'ACTIVE'
              AND promo.starts_at <= NOW()
              AND promo.ends_at >= NOW()
            ORDER BY promo.boost_multiplier DESC, promo.created_at DESC
            LIMIT 1
          ) post_promo ON TRUE
          WHERE p.location IS NOT NULL
            AND ST_DWithin(
              p.location,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
              $3 * 1000
            )
          ORDER BY score DESC
          LIMIT 20
        `,
        [query.longitude, query.latitude, radiusKm],
      ),
      this.reelsRepository.query(
        `
          SELECT
            'REEL' AS type,
            r.id,
            r.caption AS title,
            ARRAY[r.media_id] AS "mediaIds",
            r.created_at AS "createdAt",
            (
              (r.like_count * 1) +
              (r.comment_count * 2) +
              (r.share_count * 3) +
              (r.replay_count * 2) +
              (r.completion_rate * 20) +
              (r.average_watch_time_seconds * 0.5) +
              GREATEST(0, 24 - EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600)
            ) AS score
          FROM reels r
          WHERE r.location IS NOT NULL
            AND ST_DWithin(
              r.location,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
              $3 * 1000
            )
          ORDER BY score DESC
          LIMIT 20
        `,
        [query.longitude, query.latitude, radiusKm],
      ),
      this.eventsRepository.query(
        `
          SELECT
            'EVENT' AS type,
            e.id,
            e.title,
            e.media_ids AS "mediaIds",
            e.created_at AS "createdAt",
            COALESCE(event_promo.boost_multiplier, 1) AS "boostMultiplier",
            (
              (e.rsvp_count * 4) +
              (e.payment_count * 5) +
              (e.view_count * 0.1) +
              GREATEST(0, 48 - EXTRACT(EPOCH FROM (e.start_date - NOW())) / 3600)
            ) * COALESCE(event_promo.boost_multiplier, 1) AS score
          FROM events e
          LEFT JOIN LATERAL (
            SELECT promo.boost_multiplier
            FROM promotions promo
            WHERE promo.target_type = 'EVENT'
              AND promo.target_id = e.id
              AND promo.status = 'ACTIVE'
              AND promo.starts_at <= NOW()
              AND promo.ends_at >= NOW()
            ORDER BY promo.boost_multiplier DESC, promo.created_at DESC
            LIMIT 1
          ) event_promo ON TRUE
          WHERE e.end_date >= NOW()
            AND ST_DWithin(
              e.location,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
              $3 * 1000
            )
          ORDER BY score DESC
          LIMIT 20
        `,
        [query.longitude, query.latitude, radiusKm],
      ),
    ]);

    return [...posts, ...reels, ...events].sort((a, b) => Number(b.score) - Number(a.score));
  }

  async getTrendingSummary() {
    const [likes, comments, shares, views, totals] = await Promise.all([
      this.likesRepository.count(),
      this.commentsRepository.count(),
      this.sharesRepository.count(),
      this.viewsRepository.count(),
      this.eventsRepository
        .createQueryBuilder('event')
        .select('COALESCE(SUM(event.rsvpCount), 0)', 'rsvps')
        .addSelect('COALESCE(SUM(event.paymentCount), 0)', 'payments')
        .getRawOne<{ rsvps: string; payments: string }>(),
    ]);

    return {
      engagement: {
        likes,
        comments,
        shares,
        views,
        rsvps: Number(totals?.rsvps ?? 0),
        payments: Number(totals?.payments ?? 0),
      },
      formula: '(likes*1)+(comments*2)+(shares*3)+(rsvps*4)+(payments*5)+(views*0.1)+recency',
    };
  }

  async getFollowingFeed(userId: string, query: FeedQueryDto) {
    const limit = 20;
    const radiusKm = query.radiusKm ?? 50;
    const hasGeo = Number.isFinite(query.latitude) && Number.isFinite(query.longitude);

    const followingRows = await this.followsRepository.find({
      where: {
        followerUserId: userId,
      },
      select: {
        followingUserId: true,
      },
    });

    const followingIds = followingRows.map((row) => row.followingUserId);
    if (!followingIds.length) {
      return [];
    }

    const [posts, reels, events] = await Promise.all([
      this.postsRepository.query(
        `
          SELECT
            'POST' AS type,
            p.id,
            p.caption AS title,
            p.media_ids AS "mediaIds",
            p.created_at AS "createdAt",
            p.author_id AS "authorId",
            (
              (p.like_count * 1) +
              (p.comment_count * 2) +
              (p.share_count * 3) +
              (p.impression_count * 0.1) +
              GREATEST(0, 24 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600)
            ) AS score
          FROM posts p
          WHERE p.author_id = ANY($1)
          ${hasGeo ? 'AND p.location IS NOT NULL AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4 * 1000)' : ''}
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `,
        hasGeo
          ? [followingIds, query.longitude, query.latitude, radiusKm]
          : [followingIds],
      ),
      this.reelsRepository.query(
        `
          SELECT
            'REEL' AS type,
            r.id,
            r.caption AS title,
            ARRAY[r.media_id] AS "mediaIds",
            r.created_at AS "createdAt",
            r.author_id AS "authorId",
            (
              (r.like_count * 1) +
              (r.comment_count * 2) +
              (r.share_count * 3) +
              (r.replay_count * 2) +
              (r.completion_rate * 20) +
              (r.average_watch_time_seconds * 0.5) +
              GREATEST(0, 24 - EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600)
            ) AS score
          FROM reels r
          WHERE r.author_id = ANY($1)
          ${hasGeo ? 'AND r.location IS NOT NULL AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4 * 1000)' : ''}
          ORDER BY r.created_at DESC
          LIMIT ${limit}
        `,
        hasGeo
          ? [followingIds, query.longitude, query.latitude, radiusKm]
          : [followingIds],
      ),
      this.eventsRepository.query(
        `
          SELECT
            'EVENT' AS type,
            e.id,
            e.title,
            e.media_ids AS "mediaIds",
            e.created_at AS "createdAt",
            e.organizer_id AS "authorId",
            (
              (e.rsvp_count * 4) +
              (e.payment_count * 5) +
              (e.view_count * 0.1) +
              GREATEST(0, 48 - EXTRACT(EPOCH FROM (e.start_date - NOW())) / 3600)
            ) AS score
          FROM events e
          WHERE e.organizer_id = ANY($1)
            AND e.is_published = true
            AND e.end_date >= NOW()
          ${hasGeo ? 'AND ST_DWithin(e.location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4 * 1000)' : ''}
          ORDER BY e.created_at DESC
          LIMIT ${limit}
        `,
        hasGeo
          ? [followingIds, query.longitude, query.latitude, radiusKm]
          : [followingIds],
      ),
    ]);

    return [...posts, ...reels, ...events]
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, limit);
  }
}

