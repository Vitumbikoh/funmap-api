import { IsEnum, IsOptional } from 'class-validator';

export enum CreatorAnalyticsRange {
  TODAY = 'TODAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

export class CreatorAnalyticsQueryDto {
  @IsOptional()
  @IsEnum(CreatorAnalyticsRange)
  range?: CreatorAnalyticsRange;
}
