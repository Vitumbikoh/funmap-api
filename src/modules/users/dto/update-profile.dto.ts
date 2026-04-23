import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { BusinessCategory } from '../../../shared/enums/business-category.enum';
import { BusinessCoverage } from '../../../shared/enums/business-coverage.enum';
import { SubscriptionPlan } from '../../../shared/enums/subscription-plan.enum';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  username?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  businessName?: string;

  @IsOptional()
  @IsEnum(BusinessCategory)
  businessCategory?: BusinessCategory;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  businessDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxiPhoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxiWhatsappNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  transportNotes?: string;

  @IsOptional()
  @IsBoolean()
  isAlwaysOpenPlace?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  openingHoursNote?: string;

  @IsOptional()
  @IsEnum(BusinessCoverage)
  operatingCoverage?: BusinessCoverage;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsUrl()
  businessCoverUrl?: string;

  @IsOptional()
  @IsUrl()
  verificationDocumentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  nationalIdNumber?: string;

  @IsOptional()
  @IsUrl()
  nationalIdDocumentUrl?: string;

  @IsOptional()
  @IsEnum(SubscriptionPlan)
  subscriptionPlan?: SubscriptionPlan;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  bio?: string;

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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsBoolean()
  acceptCapitalRules?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;
}
