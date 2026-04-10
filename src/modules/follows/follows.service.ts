import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { User } from '../users/entities/user.entity';
import { Follow } from './entities/follow.entity';

@Injectable()
export class FollowsService {
  constructor(
    @InjectRepository(Follow)
    private readonly followsRepository: Repository<Follow>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async follow(user: JwtUser, targetUserId: string) {
    if (user.sub === targetUserId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const targetExists = await this.usersRepository.exist({ where: { id: targetUserId } });
    if (!targetExists) {
      throw new NotFoundException('User to follow was not found');
    }

    const existing = await this.followsRepository.findOne({
      where: {
        followerUserId: user.sub,
        followingUserId: targetUserId,
      },
    });

    if (existing) {
      return {
        followingUserId: targetUserId,
        following: true,
        duplicate: true,
      };
    }

    const follow = this.followsRepository.create({
      followerUserId: user.sub,
      followingUserId: targetUserId,
    });
    await this.followsRepository.save(follow);

    return {
      followingUserId: targetUserId,
      following: true,
    };
  }

  async unfollow(user: JwtUser, targetUserId: string) {
    const existing = await this.followsRepository.findOne({
      where: {
        followerUserId: user.sub,
        followingUserId: targetUserId,
      },
    });

    if (!existing) {
      return {
        followingUserId: targetUserId,
        following: false,
        alreadyUnfollowed: true,
      };
    }

    await this.followsRepository.remove(existing);

    return {
      followingUserId: targetUserId,
      following: false,
    };
  }

  async listFollowing(user: JwtUser) {
    return this.followsRepository.query(
      `
        SELECT
          f.following_user_id AS "userId",
          u.username,
          u.display_name AS "displayName",
          u.avatar_url AS "avatarUrl",
          u.is_verified AS "isVerified",
          f.created_at AS "followedAt"
        FROM follows f
        INNER JOIN users u ON u.id = f.following_user_id
        WHERE f.follower_user_id = $1
        ORDER BY f.created_at DESC
      `,
      [user.sub],
    );
  }

  async listFollowers(userId: string) {
    return this.followsRepository.query(
      `
        SELECT
          f.follower_user_id AS "userId",
          u.username,
          u.display_name AS "displayName",
          u.avatar_url AS "avatarUrl",
          u.is_verified AS "isVerified",
          f.created_at AS "followedAt"
        FROM follows f
        INNER JOIN users u ON u.id = f.follower_user_id
        WHERE f.following_user_id = $1
        ORDER BY f.created_at DESC
      `,
      [userId],
    );
  }

  async countFollowingIds(userId: string) {
    const rows = await this.followsRepository.find({
      where: {
        followerUserId: userId,
      },
      select: {
        followingUserId: true,
      },
    });

    return rows.map((item) => item.followingUserId);
  }
}