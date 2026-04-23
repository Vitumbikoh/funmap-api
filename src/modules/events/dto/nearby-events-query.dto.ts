import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EventCategory } from '../../../shared/enums/event-category.enum';

const dateBuckets = ['TONIGHT', 'TOMORROW', 'THIS_WEEK'] as const;
const mapPinTypes = ['EVENT', 'TRENDING'] as const;

export class NearbyEventsQueryDto {
  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0.5)
  @Max(500)
  radiusKm?: number = 10;

  @IsOptional()
  @Transform(({ value }) => normalizeCategory(value))
  @IsEnum(EventCategory)
  category?: EventCategory;

  @IsOptional()
  @Transform(({ value }) => normalizeText(value))
  @IsString()
  moodTag?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeText(value)?.toUpperCase())
  @IsIn(dateBuckets)
  dateBucket?: (typeof dateBuckets)[number];

  @IsOptional()
  @Transform(({ value }) => normalizeText(value)?.toUpperCase())
  @IsIn(mapPinTypes)
  mapPinType?: (typeof mapPinTypes)[number];
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