import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, Min } from 'class-validator';
import { ReportStatus } from '../enums/report-status.enum';
import { ReportTargetType } from '../enums/report-target-type.enum';

export class ListReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsEnum(ReportTargetType)
  targetType?: ReportTargetType;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;
}
