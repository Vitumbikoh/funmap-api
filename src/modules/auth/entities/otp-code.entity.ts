import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';

@Entity({ name: 'otp_codes' })
export class OtpCode extends BaseEntity {
  @Column({ name: 'phone_number', type: 'varchar', length: 32 })
  @Index()
  phoneNumber: string;

  @Column({ type: 'varchar', length: 120 })
  code: string;

  @Column({ type: 'varchar', length: 40, default: 'LOGIN' })
  purpose: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt?: Date | null;
}

