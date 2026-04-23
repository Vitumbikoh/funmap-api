import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportStatus } from '../enums/report-status.enum';

export class ResolveReportDto {
  @IsEnum(ReportStatus)
  status: ReportStatus.RESOLVED | ReportStatus.DISMISSED;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
