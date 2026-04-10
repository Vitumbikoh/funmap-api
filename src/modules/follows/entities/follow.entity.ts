import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';

@Entity({ name: 'follows' })
@Unique(['followerUserId', 'followingUserId'])
@Index(['followerUserId', 'createdAt'])
@Index(['followingUserId', 'createdAt'])
export class Follow extends BaseEntity {
  @Column({ name: 'follower_user_id', type: 'uuid' })
  followerUserId: string;

  @Column({ name: 'following_user_id', type: 'uuid' })
  followingUserId: string;
}