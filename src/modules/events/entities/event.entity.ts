import { Point } from 'geojson';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { EventCategory } from '../../../shared/enums/event-category.enum';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'events' })
export class Event extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'organizer_id' })
  organizer: User;

  @Column({ name: 'organizer_id', type: 'uuid' })
  organizerId: string;

  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'media_ids', type: 'uuid', array: true, default: [] })
  mediaIds: string[];

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate: Date;

  @Column({ type: 'enum', enum: EventCategory })
  category: EventCategory;

  @Column({ name: 'mood_tag', type: 'varchar', length: 80, nullable: true })
  moodTag?: string | null;

  @Column({ name: 'ticket_price', type: 'numeric', precision: 12, scale: 2, default: 0 })
  ticketPrice: string;

  @Column({ type: 'int', nullable: true })
  capacity?: number | null;

  @Column({ name: 'payment_required', type: 'boolean', default: false })
  paymentRequired: boolean;

  @Column({ name: 'is_published', type: 'boolean', default: true })
  isPublished: boolean;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location: Point;

  @Column({ name: 'venue_name', type: 'varchar', length: 150 })
  venueName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  township?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  district?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country?: string | null;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @Column({ name: 'rsvp_count', type: 'int', default: 0 })
  rsvpCount: number;

  @Column({ name: 'payment_count', type: 'int', default: 0 })
  paymentCount: number;
}

