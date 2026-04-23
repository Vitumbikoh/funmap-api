import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  token: string;

  @IsString()
  @IsIn(['android', 'ios', 'web', 'unknown'])
  platform: 'android' | 'ios' | 'web' | 'unknown';
}
