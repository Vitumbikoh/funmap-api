import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { RsvpStatus } from '../../../shared/enums/rsvp-status.enum';
import { User } from '../../users/entities/user.entity';
import { Event } from './event.entity';

@Entity({ name: 'rsvps' })
@Unique(['userId', 'eventId'])
export class Rsvp extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => Event, { nullable: false })
  @JoinColumn({ name: 'event_id' })
  event: Event;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ type: 'enum', enum: RsvpStatus, default: RsvpStatus.PENDING })
  status: RsvpStatus;

  @Column({ name: 'payment_required', type: 'boolean', default: false })
  paymentRequired: boolean;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date | null;
}

