import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const allowedDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

export class UpdateFunOclockDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(allowedDays, { each: true })
  days?: string[];

  @ValidateIf((o) => o.startHour !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  startHour?: number;

  @ValidateIf((o) => o.endHour !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  endHour?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  radiusKm?: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}