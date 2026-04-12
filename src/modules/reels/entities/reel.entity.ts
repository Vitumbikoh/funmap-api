import { Point } from 'geojson';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'reels' })
export class Reel extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @Column({ type: 'text', nullable: true })
  caption?: string | null;

  @Column({ name: 'media_id', type: 'uuid' })
  mediaId: string;

  @Column({ name: 'thumbnail_media_id', type: 'uuid', nullable: true })
  thumbnailMediaId?: string | null;

  @Column({ name: 'duration_seconds', type: 'int' })
  durationSeconds: number;

  @Column({ name: 'audio_name', type: 'varchar', length: 150, nullable: true })
  audioName?: string | null;

  @Column({ name: 'hashtags', type: 'text', array: true, default: [] })
  hashtags: string[];

  @Column({ name: 'mood_tag', type: 'varchar', length: 80, nullable: true })
  moodTag?: string | null;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location?: Point | null;

  @Column({ name: 'like_count', type: 'int', default: 0 })
  likeCount: number;

  @Column({ name: 'comment_count', type: 'int', default: 0 })
  commentCount: number;

  @Column({ name: 'share_count', type: 'int', default: 0 })
  shareCount: number;

  @Column({ name: 'replay_count', type: 'int', default: 0 })
  replayCount: number;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @Column({ name: 'completion_rate', type: 'float', default: 0 })
  completionRate: number;

  @Column({ name: 'average_watch_time_seconds', type: 'float', default: 0 })
  averageWatchTimeSeconds: number;
}

