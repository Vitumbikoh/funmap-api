import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MoodTag } from '../../../shared/enums/mood-tag.enum';

export class CreateReelDto {
  @IsUUID()
  mediaId: string;

  @IsOptional()
  @IsUUID()
  thumbnailMediaId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(180)
  durationSeconds: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @IsOptional()
  @IsString()
  audioName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @Transform(({ value }) => normalizeMoodTag(value))
  @IsEnum(MoodTag)
  moodTag?: MoodTag;
}

function normalizeMoodTag(value: unknown): MoodTag | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value
    .trim()
    .toUpperCase()
    .replaceAll('_', '-')
    .replaceAll(' ', '-');
  if (normalized == 'RNB') {
    return MoodTag.RNB;
  }

  return normalized as MoodTag;
}

