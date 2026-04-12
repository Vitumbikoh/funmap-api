import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../base.entity';
import { ContentTarget } from '../../enums/content-target.enum';
import { User } from '../../../modules/users/entities/user.entity';

@Entity({ name: 'shares' })
@Index(['targetType', 'targetId'])
export class Share extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'target_type', type: 'enum', enum: ContentTarget })
  targetType: ContentTarget;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  destination?: string | null;
}

