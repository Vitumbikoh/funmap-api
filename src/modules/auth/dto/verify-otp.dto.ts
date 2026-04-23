import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[\s\-()]/g, '').trim() : value,
  )
  @Matches(/^(?:\+?265|0)\d{9}$/, {
    message: 'phone number must be a valid Malawi number (+265xxxxxxxxx or 0xxxxxxxxx)',
  })
  phoneNumber: string;

  @IsString()
  @Length(4, 6)
  code: string;

  @IsOptional()
  @IsString()
  purpose?: string = 'LOGIN';

  @IsOptional()
  @IsString()
  deviceId?: string;
}

