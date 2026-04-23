import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../base.entity';
import { ContentTarget } from '../../enums/content-target.enum';
import { User } from '../../../modules/users/entities/user.entity';

@Entity({ name: 'views' })
@Index(['targetType', 'targetId'])
export class View extends BaseEntity {
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null;

  @Column({ name: 'target_type', type: 'enum', enum: ContentTarget })
  targetType: ContentTarget;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ name: 'watch_time_seconds', type: 'int', default: 0 })
  watchTimeSeconds: number;

  @Column({ type: 'boolean', default: false })
  completed: boolean;
}

