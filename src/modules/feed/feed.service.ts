import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { User } from '../users/entities/user.entity';
import { FeedQueryDto } from './dto/feed-query.dto';
import {
  resolveAllowedMoodFilters,
  resolveEffectiveSubscriptionPlan,
} from '../../shared/services/subscription-access.service';
import { buildDiscoveryScopeCondition } from '../../shared/services/discovery-visibility.service';

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
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async getNearbyFeed(userId: string, query: FeedQueryDto) {
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

    const normalizedMood = query.moodTag?.trim().toUpperCase();
    if (normalizedMood) {
      const allowedMoods = resolveAllowedMoodFilters(viewer);
      if (allowedMoods.length == 0) {
        throw new ForbiddenException('Upgrade to BRONZE to unlock mood filtering.');
      }
      if (!allowedMoods.includes(normalizedMood)) {
        throw new ForbiddenException(
          `Your current tier supports only these mood filters: ${allowedMoods.join(', ')}.`,
        );
      }
    }

    const radiusKm = query.radiusKm ?? 10;

    const eventParams: unknown[] = [query.longitude, query.latitude, radiusKm];
    const eventConditions = [
      'e.end_date >= NOW()',
      'ST_DWithin(e.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)',
      buildDiscoveryScopeCondition('e', viewer, eventParams),
    ];

    const postParams: unknown[] = [query.longitude, query.latitude, radiusKm];
    const postConditions = [
      'p.location IS NOT NULL',
      'ST_DWithin(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)',
    ];
    const reelParams: unknown[] = [query.longitude, query.latitude, radiusKm];
    const reelConditions = [
      'r.location IS NOT NULL',
      'ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)',
    ];

    const { effectivePlan } = resolveEffectiveSubscriptionPlan(viewer);
    if (effectivePlan === 'LITE' && viewer.district?.trim()) {
      postParams.push(viewer.district.trim());
      postConditions.push(`p.district ILIKE $${postParams.length}`);
    } else if (viewer.country?.trim()) {
      postParams.push(viewer.country.trim());
      postConditions.push(`p.country ILIKE $${postParams.length}`);
    }

    if (query.category) {
      eventParams.push(query.category);
      eventConditions.push(`e.category = $${eventParams.length}`);
    }

    if (query.moodTag) {
      eventParams.push(query.moodTag.toLowerCase());
      eventConditions.push(
        `LOWER(COALESCE(e.mood_tag, '')) = $${eventParams.length}`,
      );
    }

    if (query.dateBucket === 'TONIGHT') {
      eventConditions.push(
        `e.start_date >= date_trunc('day', NOW()) AND e.start_date < date_trunc('day', NOW()) + INTERVAL '1 day'`,
      );
    }

    if (query.dateBucket === 'TOMORROW') {
      eventConditions.push(
        `e.start_date >= date_trunc('day', NOW()) + INTERVAL '1 day' AND e.start_date < date_trunc('day', NOW()) + INTERVAL '2 day'`,
      );
    }

    if (query.dateBucket === 'THIS_WEEK') {
      eventConditions.push(
        `e.start_date >= NOW() AND e.start_date < NOW() + INTERVAL '7 day'`,
      );
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
            COALESCE(NULLIF(post_author.business_name, ''), NULLIF(post_author.display_name, ''), NULLIF(post_author.username, ''), 'FunMap User') AS "authorName",
            post_author.avatar_url AS "authorAvatarUrl",
            post_author.roles AS "authorRoles",
            post_author.is_verified AS "authorVerified",
            p.like_count AS "likeCount",
            p.comment_count AS "commentCount",
            p.share_count AS "shareCount",
            COALESCE(post_promo.boost_multiplier, 1) AS "boostMultiplier",
            (
              (p.like_count * 1) +
              (p.comment_count * 2) +
              (p.share_count * 3) +
              (p.impression_count * 0.1) +
              GREATEST(0, 24 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600)
            ) * COALESCE(post_promo.boost_multiplier, 1) AS score
          FROM posts p
          LEFT JOIN users post_author ON post_author.id = p.author_id
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
          WHERE ${postConditions.join(' AND ')}
          ORDER BY score DESC
          LIMIT 20
        `,
        postParams,
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
            COALESCE(NULLIF(reel_author.business_name, ''), NULLIF(reel_author.display_name, ''), NULLIF(reel_author.username, ''), 'FunMap User') AS "authorName",
            reel_author.avatar_url AS "authorAvatarUrl",
            reel_author.roles AS "authorRoles",
            reel_author.is_verified AS "authorVerified",
            r.like_count AS "likeCount",
            r.comment_count AS "commentCount",
            r.share_count AS "shareCount",
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
          LEFT JOIN users reel_author ON reel_author.id = r.author_id
          WHERE ${reelConditions.join(' AND ')}
          ORDER BY score DESC
          LIMIT 20
        `,
        reelParams,
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
            COALESCE(NULLIF(event_author.business_name, ''), NULLIF(event_author.display_name, ''), NULLIF(event_author.username, ''), NULLIF(e.venue_name, ''), 'FunMap User') AS "authorName",
            event_author.avatar_url AS "authorAvatarUrl",
            event_author.roles AS "authorRoles",
            event_author.is_verified AS "authorVerified",
            COALESCE(event_like_count.value, 0) AS "likeCount",
            COALESCE(event_comment_count.value, 0) AS "commentCount",
            COALESCE(event_share_count.value, 0) AS "shareCount",
            COALESCE(event_promo.boost_multiplier, 1) AS "boostMultiplier",
            (
              (COALESCE(event_like_count.value, 0) * 1) +
              (COALESCE(event_comment_count.value, 0) * 2) +
              (COALESCE(event_share_count.value, 0) * 3) +
              (e.rsvp_count * 4) +
              (e.payment_count * 5) +
              (e.view_count * 0.1) +
              GREATEST(0, 48 - EXTRACT(EPOCH FROM (e.start_date - NOW())) / 3600)
            ) * COALESCE(event_promo.boost_multiplier, 1) AS score
          FROM events e
          LEFT JOIN users event_author ON event_author.id = e.organizer_id
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS value
            FROM likes l
            WHERE l.target_type = 'EVENT' AND l.target_id = e.id
          ) event_like_count ON TRUE
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS value
            FROM comments c
            WHERE c.target_type = 'EVENT' AND c.target_id = e.id
          ) event_comment_count ON TRUE
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS value
            FROM shares s
            WHERE s.target_type = 'EVENT' AND s.target_id = e.id
          ) event_share_count ON TRUE
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
          WHERE ${eventConditions.join(' AND ')}
          ORDER BY score DESC
          LIMIT 20
        `,
        eventParams,
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
            COALESCE(NULLIF(post_author.business_name, ''), NULLIF(post_author.display_name, ''), NULLIF(post_author.username, ''), 'FunMap User') AS "authorName",
            post_author.avatar_url AS "authorAvatarUrl",
            post_author.roles AS "authorRoles",
            post_author.is_verified AS "authorVerified",
            p.like_count AS "likeCount",
            p.comment_count AS "commentCount",
            p.share_count AS "shareCount",
            (
              (p.like_count * 1) +
              (p.comment_count * 2) +
              (p.share_count * 3) +
              (p.impression_count * 0.1) +
              GREATEST(0, 24 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600)
            ) AS score
          FROM posts p
          LEFT JOIN users post_author ON post_author.id = p.author_id
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
            COALESCE(NULLIF(reel_author.business_name, ''), NULLIF(reel_author.display_name, ''), NULLIF(reel_author.username, ''), 'FunMap User') AS "authorName",
            reel_author.avatar_url AS "authorAvatarUrl",
            reel_author.roles AS "authorRoles",
            reel_author.is_verified AS "authorVerified",
            r.like_count AS "likeCount",
            r.comment_count AS "commentCount",
            r.share_count AS "shareCount",
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
          LEFT JOIN users reel_author ON reel_author.id = r.author_id
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
            COALESCE(NULLIF(event_author.business_name, ''), NULLIF(event_author.display_name, ''), NULLIF(event_author.username, ''), NULLIF(e.venue_name, ''), 'FunMap User') AS "authorName",
            event_author.avatar_url AS "authorAvatarUrl",
            event_author.roles AS "authorRoles",
            event_author.is_verified AS "authorVerified",
            COALESCE(event_like_count.value, 0) AS "likeCount",
            COALESCE(event_comment_count.value, 0) AS "commentCount",
            COALESCE(event_share_count.value, 0) AS "shareCount",
            (
              (COALESCE(event_like_count.value, 0) * 1) +
              (COALESCE(event_comment_count.value, 0) * 2) +
              (COALESCE(event_share_count.value, 0) * 3) +
              (e.rsvp_count * 4) +
              (e.payment_count * 5) +
              (e.view_count * 0.1) +
              GREATEST(0, 48 - EXTRACT(EPOCH FROM (e.start_date - NOW())) / 3600)
            ) AS score
          FROM events e
          LEFT JOIN users event_author ON event_author.id = e.organizer_id
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS value
            FROM likes l
            WHERE l.target_type = 'EVENT' AND l.target_id = e.id
          ) event_like_count ON TRUE
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS value
            FROM comments c
            WHERE c.target_type = 'EVENT' AND c.target_id = e.id
          ) event_comment_count ON TRUE
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS value
            FROM shares s
            WHERE s.target_type = 'EVENT' AND s.target_id = e.id
          ) event_share_count ON TRUE
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
