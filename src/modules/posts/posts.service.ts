import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Point } from 'geojson';
import { Repository } from 'typeorm';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreatePostDto } from './dto/create-post.dto';
import { Post } from './entities/post.entity';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
  ) {}

  async create(user: JwtUser, payload: CreatePostDto) {
    const location =
      payload.latitude !== undefined && payload.longitude !== undefined
        ? ({
            type: 'Point',
            coordinates: [payload.longitude, payload.latitude],
          } as Point)
        : null;

    const post = this.postsRepository.create({
      authorId: user.sub,
      caption: payload.caption,
      mediaIds: payload.mediaIds,
      visibility: payload.visibility,
      visibilityRadiusKm: payload.visibilityRadiusKm,
      location,
      hashtags: (payload.hashtags ?? []).map((tag) =>
        tag.trim().toLowerCase().replace(/^#/, ''),
      ),
      moodTag: payload.moodTag,
      township: payload.township,
      district: payload.district,
      region: payload.region,
      country: payload.country,
    });

    return this.postsRepository.save(post);
  }

  async findNearby(query: GeoQueryDto) {
    return this.postsRepository.query(
      `
        SELECT
          p.*,
          ST_Distance(
            p.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 AS distance_km
        FROM posts p
        WHERE p.location IS NOT NULL
          AND ST_DWithin(
            p.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3 * 1000
          )
        ORDER BY p.created_at DESC
        LIMIT 50
      `,
      [query.longitude, query.latitude, query.radiusKm ?? 10],
    );
  }
}

