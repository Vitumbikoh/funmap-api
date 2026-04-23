import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'notification_devices' })
@Unique(['token'])
@Index(['userId', 'isActive'])
export class NotificationDevice extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  token: string;

  @Column({ type: 'varchar', length: 20, default: 'unknown' })
  platform: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt?: Date | null;
}
