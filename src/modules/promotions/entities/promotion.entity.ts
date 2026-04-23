import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { User } from '../../users/entities/user.entity';
import { PromotionStatus } from '../enums/promotion-status.enum';
import { PromotionTargetType } from '../enums/promotion-target-type.enum';

@Entity({ name: 'promotions' })
export class Promotion extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'owner_user_id' })
  ownerUser: User;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @Column({ name: 'target_type', type: 'enum', enum: PromotionTargetType })
  targetType: PromotionTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ name: 'budget_amount', type: 'numeric', precision: 12, scale: 2 })
  budgetAmount: string;

  @Column({ name: 'currency', type: 'varchar', length: 12, default: 'MWK' })
  currency: string;

  @Column({ name: 'spent_amount', type: 'numeric', precision: 12, scale: 2, default: 0 })
  spentAmount: string;

  @Column({ name: 'boost_multiplier', type: 'float', default: 1.25 })
  boostMultiplier: number;

  @Column({ name: 'impression_goal', type: 'int', nullable: true })
  impressionGoal?: number | null;

  @Column({ name: 'delivered_impressions', type: 'int', default: 0 })
  deliveredImpressions: number;

  @Column({ name: 'audience_district', type: 'varchar', length: 100, nullable: true })
  audienceDistrict?: string | null;

  @Column({ name: 'audience_region', type: 'varchar', length: 100, nullable: true })
  audienceRegion?: string | null;

  @Column({ name: 'audience_country', type: 'varchar', length: 100, nullable: true })
  audienceCountry?: string | null;

  @Column({ name: 'external_platforms', type: 'text', array: true, default: [] })
  externalPlatforms: string[];

  @Column({ name: 'external_landing_url', type: 'text', nullable: true })
  externalLandingUrl?: string | null;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Column({ name: 'status', type: 'enum', enum: PromotionStatus, default: PromotionStatus.SCHEDULED })
  status: PromotionStatus;
}
