import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Point } from 'geojson';
import { Repository } from 'typeorm';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { Role } from '../../shared/enums/role.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { assertSubscriptionFeatureAccess } from '../../shared/services/subscription-access.service';
import { User } from '../users/entities/user.entity';
import { CreateReelDto } from './dto/create-reel.dto';
import { Reel } from './entities/reel.entity';

@Injectable()
export class ReelsService {
  constructor(
    @InjectRepository(Reel)
    private readonly reelsRepository: Repository<Reel>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(user: JwtUser, payload: CreateReelDto) {
    const author = await this.usersRepository.findOne({
      where: { id: user.sub },
      select: {
        id: true,
        roles: true,
        subscriptionPlan: true,
        subscriptionExpiresAt: true,
      },
    });

    const isCapitalUser =
      author?.roles.includes(Role.BUSINESS) || author?.roles.includes(Role.CAPITAL_USER);

    if (author && isCapitalUser) {
      assertSubscriptionFeatureAccess(author, 'video_reels_uploads');
    }

    const location =
      payload.latitude !== undefined && payload.longitude !== undefined
        ? ({
            type: 'Point',
            coordinates: [payload.longitude, payload.latitude],
          } as Point)
        : null;

    const reel = this.reelsRepository.create({
      authorId: user.sub,
      caption: payload.caption,
      mediaId: payload.mediaId,
      thumbnailMediaId: payload.thumbnailMediaId,
      durationSeconds: payload.durationSeconds,
      audioName: payload.audioName,
      hashtags: (payload.hashtags ?? []).map((tag) =>
        tag.trim().toLowerCase().replace(/^#/, ''),
      ),
      moodTag: payload.moodTag,
      location,
    });

    return this.reelsRepository.save(reel);
  }

  async findNearby(query: GeoQueryDto) {
    return this.reelsRepository.query(
      `
        SELECT
          r.*,
          ST_Distance(
            r.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 AS distance_km
        FROM reels r
        WHERE r.location IS NOT NULL
          AND ST_DWithin(
            r.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3 * 1000
          )
        ORDER BY r.created_at DESC
        LIMIT 50
      `,
      [query.longitude, query.latitude, query.radiusKm ?? 10],
    );
  }

  async findTrending(query: GeoQueryDto) {
    const hasGeo = Number.isFinite(query.latitude) && Number.isFinite(query.longitude);
    const radiusKm = query.radiusKm ?? 20;

    const params: unknown[] = [];
    let geoFilter = '';

    if (hasGeo) {
      params.push(query.longitude, query.latitude, radiusKm);
      geoFilter = `
        AND r.location IS NOT NULL
        AND ST_DWithin(
          r.location,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3 * 1000
        )
      `;
    }

    return this.reelsRepository.query(
      `
        SELECT
          r.*,
          (
            (
              (r.like_count * 1) +
              (r.comment_count * 2) +
              (r.share_count * 3) +
              (r.replay_count * 2) +
              (r.completion_rate * 20) +
              (r.average_watch_time_seconds * 0.5)
            ) /
            GREATEST(1, EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600)
          ) AS velocity_score
        FROM reels r
        WHERE TRUE
          ${geoFilter}
        ORDER BY velocity_score DESC, r.created_at DESC
        LIMIT 50
      `,
      params,
    );
  }

  async findForYou(user: JwtUser, query: GeoQueryDto) {
    const profile = await this.usersRepository.findOne({
      where: { id: user.sub },
      select: {
        id: true,
        interests: true,
      },
    });

    const interests = (profile?.interests ?? [])
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 1);

    const hasGeo = Number.isFinite(query.latitude) && Number.isFinite(query.longitude);
    const radiusKm = query.radiusKm ?? 30;

    const params: unknown[] = [user.sub];
    let geoScoreClause = '0';

    if (hasGeo) {
      params.push(query.longitude, query.latitude, radiusKm);
      const lonIndex = params.length - 2;
      const latIndex = params.length - 1;
      const radiusIndex = params.length;
      geoScoreClause = `
        CASE
          WHEN r.location IS NOT NULL
           AND ST_DWithin(
             r.location,
             ST_SetSRID(ST_MakePoint($${lonIndex}, $${latIndex}), 4326)::geography,
             $${radiusIndex} * 1000
           )
          THEN 6 ELSE 0
        END
      `;
    }

    let interestScoreClause = '0';
    if (interests.length) {
      params.push(interests);
      const interestIndex = params.length;
      interestScoreClause = `
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM UNNEST(r.hashtags) tag
            WHERE LOWER(tag) = ANY($${interestIndex})
          )
          OR (r.mood_tag IS NOT NULL AND LOWER(r.mood_tag) = ANY($${interestIndex}))
          THEN 10 ELSE 0
        END
      `;
    }

    return this.reelsRepository.query(
      `
        SELECT
          r.*,
          (
            (r.like_count * 1) +
            (r.comment_count * 2) +
            (r.share_count * 3) +
            (r.replay_count * 2) +
            (r.completion_rate * 20) +
            (r.average_watch_time_seconds * 0.5) +
            ${geoScoreClause} +
            ${interestScoreClause} +
            GREATEST(0, 24 - EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600)
          ) AS for_you_score
        FROM reels r
        WHERE r.author_id <> $1
        ORDER BY for_you_score DESC, r.created_at DESC
        LIMIT 50
      `,
      params,
    );
  }

  async findMine(user: JwtUser) {
    const items = await this.reelsRepository.find({
      where: { authorId: user.sub },
      order: { createdAt: 'DESC' },
      take: 120,
    });

    return {
      items,
      total: items.length,
    };
  }
}
