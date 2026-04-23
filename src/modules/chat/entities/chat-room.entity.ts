import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { ChatRoomType } from '../../../shared/enums/chat-room-type.enum';
import { Event } from '../../events/entities/event.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'chat_rooms' })
export class ChatRoom extends BaseEntity {
  @Column({ type: 'enum', enum: ChatRoomType })
  type: ChatRoomType;

  @Column({ type: 'varchar', length: 150, nullable: true })
  title?: string | null;

  @ManyToOne(() => Event, { nullable: true })
  @JoinColumn({ name: 'event_id' })
  event?: Event | null;

  @Column({ name: 'event_id', type: 'uuid', nullable: true })
  eventId?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser?: User | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId?: string | null;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt?: Date | null;
}

