import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';

export class GeoQueryDto {
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
}

