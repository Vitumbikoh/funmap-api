import {
  Column,
  Entity,
  Index,
} from 'typeorm';
import { Point } from 'geojson';
import { BaseEntity } from '../../../shared/database/base.entity';
import { AccountStatus } from '../../../shared/enums/account-status.enum';
import { BusinessCategory } from '../../../shared/enums/business-category.enum';
import { BusinessCoverage } from '../../../shared/enums/business-coverage.enum';
import { BusinessVerificationStatus } from '../../../shared/enums/business-verification-status.enum';
import { NationalIdStatus } from '../../../shared/enums/national-id-status.enum';
import { Role } from '../../../shared/enums/role.enum';
import { SubscriptionPlan } from '../../../shared/enums/subscription-plan.enum';

@Entity({ name: 'users' })
export class User extends BaseEntity {
  @Column({ name: 'phone_number', type: 'varchar', length: 32, unique: true })
  @Index({ unique: true })
  phoneNumber: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 100, nullable: true })
  passwordHash?: string | null;

  @Column({ type: 'varchar', length: 160, unique: true, nullable: true })
  @Index({ unique: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 60, unique: true, nullable: true })
  @Index({ unique: true })
  username?: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 100, nullable: true })
  displayName?: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl?: string | null;

  @Column({ name: 'business_name', type: 'varchar', length: 140, nullable: true })
  businessName?: string | null;

  @Column({
    name: 'business_category',
    type: 'enum',
    enum: BusinessCategory,
    nullable: true,
  })
  businessCategory?: BusinessCategory | null;

  @Column({ name: 'business_description', type: 'text', nullable: true })
  businessDescription?: string | null;

  @Column({
    name: 'operating_coverage',
    type: 'enum',
    enum: BusinessCoverage,
    nullable: true,
  })
  operatingCoverage?: BusinessCoverage | null;

  @Column({ name: 'business_cover_url', type: 'text', nullable: true })
  businessCoverUrl?: string | null;

  @Column({ name: 'verification_document_url', type: 'text', nullable: true })
  verificationDocumentUrl?: string | null;

  @Column({
    name: 'business_verification_status',
    type: 'enum',
    enum: BusinessVerificationStatus,
    default: BusinessVerificationStatus.PENDING,
  })
  businessVerificationStatus: BusinessVerificationStatus;

  @Column({
    name: 'subscription_plan',
    type: 'enum',
    enum: SubscriptionPlan,
    default: SubscriptionPlan.LITE,
  })
  subscriptionPlan: SubscriptionPlan;

  @Column({ type: 'text', nullable: true })
  bio?: string | null;

  @Column({
    type: 'enum',
    enum: Role,
    array: true,
    default: [Role.CLIENT],
  })
  roles: Role[];

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;

  @Column({
    name: 'home_location',
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  homeLocation?: Point | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  township?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  district?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country?: string | null;

  @Column({ name: 'interests', type: 'text', array: true, default: [] })
  interests: string[];

  @Column({ name: 'capital_rules_accepted_at', type: 'timestamptz', nullable: true })
  capitalRulesAcceptedAt?: Date | null;

  @Column({ name: 'last_active_at', type: 'timestamptz', nullable: true })
  lastActiveAt?: Date | null;

  @Column({
    name: 'account_status',
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  accountStatus: AccountStatus;

  @Column({ name: 'deactivated_until', type: 'timestamptz', nullable: true })
  deactivatedUntil?: Date | null;

  @Column({ name: 'national_id_number', type: 'varchar', length: 40, nullable: true, unique: true })
  @Index({ unique: true })
  nationalIdNumber?: string | null;

  @Column({ name: 'national_id_document_url', type: 'text', nullable: true })
  nationalIdDocumentUrl?: string | null;

  @Column({
    name: 'national_id_status',
    type: 'enum',
    enum: NationalIdStatus,
    default: NationalIdStatus.NOT_SUBMITTED,
  })
  nationalIdStatus: NationalIdStatus;

  @Column({ name: 'fun_oclock_enabled', type: 'boolean', default: false })
  funOclockEnabled: boolean;

  @Column({ name: 'fun_oclock_days', type: 'text', array: true, default: ['FRI', 'SAT'] })
  funOclockDays: string[];

  @Column({ name: 'fun_oclock_start_hour', type: 'int', nullable: true })
  funOclockStartHour?: number | null;

  @Column({ name: 'fun_oclock_end_hour', type: 'int', nullable: true })
  funOclockEndHour?: number | null;

  @Column({ name: 'fun_oclock_radius_km', type: 'int', default: 5 })
  funOclockRadiusKm: number;

  @Column({ name: 'fun_oclock_timezone', type: 'varchar', length: 64, default: 'Africa/Blantyre' })
  funOclockTimezone: string;
}
