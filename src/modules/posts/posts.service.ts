import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Point } from 'geojson';
import { Repository } from 'typeorm';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { enforceCoverageForBusiness } from '../../shared/services/coverage-policy.service';
import { User } from '../users/entities/user.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { Post } from './entities/post.entity';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(user: JwtUser, payload: CreatePostDto) {
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

  async findMine(user: JwtUser) {
    const items = await this.postsRepository.find({
      where: { authorId: user.sub },
      order: { createdAt: 'DESC' },
      take: 120,
    });

    return {
      items,
      total: items.length,
    };
  }

  async update(user: JwtUser, postId: string, payload: UpdatePostDto) {
    const post = await this.getOwnedPost(user.sub, postId);
    const creator = await this.usersRepository.findOne({
      where: { id: user.sub },
      select: {
        id: true,
        subscriptionPlan: true,
      },
    });

    if (creator) {
      enforceCoverageForBusiness(user.roles, creator.subscriptionPlan, {
        township: payload.township ?? post.township,
        district: payload.district ?? post.district,
        region: payload.region ?? post.region,
        country: payload.country ?? post.country,
      });
    }

    if (payload.caption !== undefined) {
      post.caption = payload.caption;
    }

    if (payload.mediaIds !== undefined) {
      post.mediaIds = payload.mediaIds;
    }

    if (payload.visibility !== undefined) {
      post.visibility = payload.visibility;
    }

    if (payload.visibilityRadiusKm !== undefined) {
      post.visibilityRadiusKm = payload.visibilityRadiusKm;
    }

    if (payload.hashtags !== undefined) {
      post.hashtags = payload.hashtags.map((tag) =>
        tag.trim().toLowerCase().replace(/^#/, ''),
      );
    }

    if (payload.moodTag !== undefined) {
      post.moodTag = payload.moodTag;
    }

    if (payload.township !== undefined) {
      post.township = payload.township;
    }

    if (payload.district !== undefined) {
      post.district = payload.district;
    }

    if (payload.region !== undefined) {
      post.region = payload.region;
    }

    if (payload.country !== undefined) {
      post.country = payload.country;
    }

    if (payload.latitude !== undefined && payload.longitude !== undefined) {
      post.location = {
        type: 'Point',
        coordinates: [payload.longitude, payload.latitude],
      } as Point;
    }

    return this.postsRepository.save(post);
  }

  async remove(user: JwtUser, postId: string) {
    const post = await this.getOwnedPost(user.sub, postId);
    await this.postsRepository.remove(post);

    return {
      id: postId,
      deleted: true,
    };
  }

  private async getOwnedPost(userId: string, postId: string) {
    const post = await this.postsRepository.findOne({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only modify your own posts');
    }

    return post;
  }
}

