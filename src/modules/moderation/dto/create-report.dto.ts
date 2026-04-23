import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ReportTargetType } from '../enums/report-target-type.enum';

export class CreateReportDto {
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @IsUUID('4')
  targetId: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
