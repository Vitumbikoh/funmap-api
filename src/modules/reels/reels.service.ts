import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Point } from 'geojson';
import { Repository } from 'typeorm';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreateReelDto } from './dto/create-reel.dto';
import { Reel } from './entities/reel.entity';

@Injectable()
export class ReelsService {
  constructor(
    @InjectRepository(Reel)
    private readonly reelsRepository: Repository<Reel>,
  ) {}

  async create(user: JwtUser, payload: CreateReelDto) {
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
}

