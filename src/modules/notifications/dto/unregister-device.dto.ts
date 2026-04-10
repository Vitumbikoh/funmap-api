import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterDeviceDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  token?: string;
}
