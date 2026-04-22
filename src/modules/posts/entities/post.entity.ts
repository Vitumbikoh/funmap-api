import { Point } from 'geojson';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { ContentVisibility } from '../../../shared/enums/content-visibility.enum';
import { ContentType } from '../../../shared/enums/content-type.enum';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'posts' })
export class Post extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @Column({ name: 'content_type', type: 'enum', enum: ContentType, default: ContentType.POST })
  contentType: ContentType;

  @Column({ type: 'text', nullable: true })
  caption?: string | null;

  @Column({ name: 'media_ids', type: 'uuid', array: true, default: [] })
  mediaIds: string[];

  @Column({
    type: 'enum',
    enum: ContentVisibility,
    default: ContentVisibility.PUBLIC,
  })
  visibility: ContentVisibility;

  @Column({ name: 'visibility_radius_km', type: 'float', default: 10 })
  visibilityRadiusKm: number;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location?: Point | null;

  @Column({ name: 'hashtags', type: 'text', array: true, default: [] })
  hashtags: string[];

  @Column({ name: 'mood_tag', type: 'varchar', length: 80, nullable: true })
  moodTag?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  township?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  district?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country?: string | null;

  @Column({ name: 'like_count', type: 'int', default: 0 })
  likeCount: number;

  @Column({ name: 'comment_count', type: 'int', default: 0 })
  commentCount: number;

  @Column({ name: 'share_count', type: 'int', default: 0 })
  shareCount: number;

  @Column({ name: 'save_count', type: 'int', default: 0 })
  saveCount: number;

  @Column({ name: 'impression_count', type: 'int', default: 0 })
  impressionCount: number;
}

