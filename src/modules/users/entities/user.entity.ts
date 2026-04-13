import {
  Column,
  Entity,
  Index,
} from 'typeorm';
import { Point } from 'geojson';
import { BaseEntity } from '../../../shared/database/base.entity';
import { Role } from '../../../shared/enums/role.enum';

@Entity({ name: 'users' })
export class User extends BaseEntity {
  @Column({ name: 'phone_number', type: 'varchar', length: 32, unique: true })
  @Index({ unique: true })
  phoneNumber: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 100, nullable: true })
  passwordHash?: string | null;

  @Column({ type: 'varchar', length: 60, unique: true, nullable: true })
  @Index({ unique: true })
  username?: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 100, nullable: true })
  displayName?: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl?: string | null;

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

  @Column({ name: 'last_active_at', type: 'timestamptz', nullable: true })
  lastActiveAt?: Date | null;
}

