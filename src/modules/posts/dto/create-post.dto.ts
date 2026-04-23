import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ContentVisibility } from '../../../shared/enums/content-visibility.enum';
import { ContentType } from '../../../shared/enums/content-type.enum';
import { MoodTag } from '../../../shared/enums/mood-tag.enum';

export class CreatePostDto {
  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType = ContentType.POST;

  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  mediaIds: string[];

  @IsOptional()
  @IsEnum(ContentVisibility)
  visibility?: ContentVisibility = ContentVisibility.PUBLIC;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  visibilityRadiusKm?: number = 10;

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

