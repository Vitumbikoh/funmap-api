import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { MediaType } from '../../../shared/enums/media-type.enum';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'media' })
export class Media extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'owner_user_id' })
  ownerUser: User;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'enum', enum: MediaType })
  type: MediaType;

  @Column({ name: 'public_id', type: 'varchar', length: 255, unique: true })
  publicId: string;

  @Column({ name: 'secure_url', type: 'text' })
  secureUrl: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  format?: string | null;

  @Column({ type: 'int', nullable: true })
  width?: number | null;

  @Column({ type: 'int', nullable: true })
  height?: number | null;

  @Column({ type: 'int', nullable: true })
  bytes?: number | null;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  durationSeconds?: number | null;

  @Column({ name: 'is_processed', type: 'boolean', default: false })
  isProcessed: boolean;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;
}

