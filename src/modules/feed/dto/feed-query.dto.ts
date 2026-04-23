import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { GeoQueryDto } from '../../../shared/dto/geo-query.dto';
import { EventCategory } from '../../../shared/enums/event-category.enum';

const dateBuckets = ['TONIGHT', 'TOMORROW', 'THIS_WEEK'] as const;

export class FeedQueryDto extends GeoQueryDto {
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

