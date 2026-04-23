import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsArray,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PromotionTargetType } from '../enums/promotion-target-type.enum';

export class CreatePromotionDto {
  @IsEnum(PromotionTargetType)
  targetType: PromotionTargetType;

  @IsUUID('4')
  targetId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  budgetAmount: number;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  currency?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(5)
  boostMultiplier?: number;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  impressionGoal?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  audienceDistrict?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  audienceRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  audienceCountry?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  externalPlatforms?: string[];

  @IsOptional()
  @IsUrl()
  externalLandingUrl?: string;
}
