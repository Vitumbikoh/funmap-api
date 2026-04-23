import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { User } from '../../users/entities/user.entity';

export enum ChatRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

@Entity({ name: 'chat_requests' })
export class ChatRequest extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'recipient_id' })
  recipient: User;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId: string;

  @Column({
    type: 'enum',
    enum: ChatRequestStatus,
    default: ChatRequestStatus.PENDING,
  })
  status: ChatRequestStatus;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt?: Date | null;

  @Column({ name: 'room_id', type: 'uuid', nullable: true })
  roomId?: string | null;
}
