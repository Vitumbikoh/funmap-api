import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { User } from '../../users/entities/user.entity';
import { ChatRoom } from './chat-room.entity';

@Entity({ name: 'chat_participants' })
@Unique(['roomId', 'userId'])
export class ChatParticipant extends BaseEntity {
  @ManyToOne(() => ChatRoom, { nullable: false })
  @JoinColumn({ name: 'room_id' })
  room: ChatRoom;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
  lastReadAt?: Date | null;
}

