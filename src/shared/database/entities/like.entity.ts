import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../base.entity';
import { ContentTarget } from '../../enums/content-target.enum';
import { User } from '../../../modules/users/entities/user.entity';

@Entity({ name: 'likes' })
@Unique(['userId', 'targetType', 'targetId'])
@Index(['targetType', 'targetId'])
export class Like extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'target_type', type: 'enum', enum: ContentTarget })
  targetType: ContentTarget;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;
}

