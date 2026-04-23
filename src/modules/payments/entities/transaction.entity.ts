import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { Payment } from './payment.entity';

@Entity({ name: 'transactions' })
export class Transaction extends BaseEntity {
  @ManyToOne(() => Payment, { nullable: false })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId: string;

  @Column({ name: 'webhook_event', type: 'varchar', length: 120 })
  webhookEvent: string;

  @Column({ name: 'tx_ref', type: 'varchar', length: 120, nullable: true })
  txRef?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference?: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200, unique: true })
  idempotencyKey: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'verification_payload', type: 'jsonb', nullable: true })
  verificationPayload?: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  signature?: string | null;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;
}

