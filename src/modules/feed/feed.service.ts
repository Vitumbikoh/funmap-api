import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from '../../shared/database/entities/comment.entity';
import { Like } from '../../shared/database/entities/like.entity';
import { Share } from '../../shared/database/entities/share.entity';
import { View } from '../../shared/database/entities/view.entity';
import { Event } from '../events/entities/event.entity';
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
            (
              (p.like_count * 1) +
              (p.comment_count * 2) +
              (p.share_count * 3) +
              (p.impression_count * 0.1) +
              GREATEST(0, 24 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600)
            ) AS score
          FROM posts p
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
            (
              (e.rsvp_count * 4) +
              (e.payment_count * 5) +
              (e.view_count * 0.1) +
              GREATEST(0, 48 - EXTRACT(EPOCH FROM (e.start_date - NOW())) / 3600)
            ) AS score
          FROM events e
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
    const [likes, comments, shares, views] = await Promise.all([
      this.likesRepository.count(),
      this.commentsRepository.count(),
      this.sharesRepository.count(),
      this.viewsRepository.count(),
    ]);

    return {
      engagement: {
        likes,
        comments,
        shares,
        views,
      },
      formula: '(likes*1)+(comments*2)+(shares*3)+(rsvps*4)+(payments*5)+(views*0.1)+recency',
    };
  }
}

