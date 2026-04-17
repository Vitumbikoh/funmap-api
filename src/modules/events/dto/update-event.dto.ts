import { Transform, Type } from 'class-transformer';
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
import { MoodTag } from '../../../shared/enums/mood-tag.enum';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeCategory(value))
  @IsEnum(EventCategory)
  category?: EventCategory;

  @IsOptional()
  @Transform(({ value }) => normalizeMoodTag(value))
  @IsEnum(MoodTag)
  moodTag?: MoodTag;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  ticketPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  paymentRequired?: boolean;

  @IsOptional()
  @IsUrl()
  paymentLink?: string;

  @IsOptional()
  @IsEnum(EventLifecycleStatus)
  status?: EventLifecycleStatus;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  venueName?: string;

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

function normalizeCategory(value: unknown): EventCategory | undefined {
  const normalized = normalizeText(value)?.toUpperCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === 'DINING') {
    return EventCategory.FOOD;
  }

  return normalized as EventCategory;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeMoodTag(value: unknown): MoodTag | undefined {
  const normalized = normalizeText(value)
    ?.toUpperCase()
    .replaceAll('_', '-')
    .replaceAll(' ', '-');

  if (!normalized) {
    return undefined;
  }

  if (normalized === 'RNB') {
    return MoodTag.RNB;
  }

  return normalized as MoodTag;
}
