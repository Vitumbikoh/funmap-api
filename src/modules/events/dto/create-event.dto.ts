import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { EventCategory } from '../../../shared/enums/event-category.enum';
import { EventLifecycleStatus } from '../../../shared/enums/event-lifecycle-status.enum';

export class CreateEventDto {
  @IsString()
  @MaxLength(150)
  title: string;

  @IsString()
  @MaxLength(4000)
  description: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  mediaIds: string[];

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsEnum(EventCategory)
  category: EventCategory;

  @IsOptional()
  @IsString()
  moodTag?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  hashtags?: string[];

  @Type(() => Number)
  @Min(0)
  ticketPrice: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  capacity?: number;

  @IsBoolean()
  paymentRequired: boolean;

  @IsOptional()
  @IsUrl()
  paymentLink?: string;

  @IsOptional()
  @IsEnum(EventLifecycleStatus)
  status?: EventLifecycleStatus;

  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @IsString()
  venueName: string;

  @IsOptional()
  @IsString()
  township?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  country?: string;
}
