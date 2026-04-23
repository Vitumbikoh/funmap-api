import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'sessions' })
export class Session extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 120 })
  refreshTokenHash: string;

  @Column({ name: 'device_id', type: 'varchar', length: 120, nullable: true })
  deviceId?: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt?: Date | null;
}

