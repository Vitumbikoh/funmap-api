import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ReportStatus } from '../enums/report-status.enum';

export class BulkResolveReportsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids: string[];

  @IsEnum(ReportStatus)
  status: ReportStatus.RESOLVED | ReportStatus.DISMISSED;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
