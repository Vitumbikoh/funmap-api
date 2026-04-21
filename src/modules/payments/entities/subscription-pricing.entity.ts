import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { PricingAudience } from '../../../shared/enums/pricing-audience.enum';
import { SubscriptionPlan } from '../../../shared/enums/subscription-plan.enum';

@Entity({ name: 'subscription_pricing' })
@Index(['audience', 'subscriptionPlan'], { unique: true })
export class SubscriptionPricing extends BaseEntity {
  @Column({
    type: 'enum',
    enum: PricingAudience,
  })
  audience: PricingAudience;

  @Column({
    name: 'subscription_plan',
    type: 'enum',
    enum: SubscriptionPlan,
  })
  subscriptionPlan: SubscriptionPlan;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId?: string | null;
}
