import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { PaymentStatus } from '../../../shared/enums/payment-status.enum';
import { User } from '../../users/entities/user.entity';
import { Event } from '../../events/entities/event.entity';

@Entity({ name: 'payments' })
export class Payment extends BaseEntity {
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

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 10, default: 'MWK' })
  currency: string;

  @Column({ type: 'varchar', length: 60, default: 'PAYCHANGU' })
  provider: string;

  @Column({ name: 'provider_reference', type: 'varchar', length: 120, unique: true })
  providerReference: string;

  @Column({ name: 'checkout_url', type: 'text', nullable: true })
  checkoutUrl?: string | null;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;
}

