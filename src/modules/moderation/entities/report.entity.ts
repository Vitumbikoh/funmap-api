import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../shared/database/base.entity';
import { ReportStatus } from '../enums/report-status.enum';
import { ReportTargetType } from '../enums/report-target-type.enum';

@Entity({ name: 'reports' })
@Index(['status', 'createdAt'])
@Index(['targetType', 'targetId'])
@Index(['reporterUserId', 'status'])
export class Report extends BaseEntity {
  @Column({ name: 'reporter_user_id', type: 'uuid' })
  reporterUserId: string;

  @Column({ name: 'target_type', type: 'enum', enum: ReportTargetType })
  targetType: ReportTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ type: 'varchar', length: 120 })
  reason: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.OPEN })
  status: ReportStatus;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId?: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote?: string | null;
}
