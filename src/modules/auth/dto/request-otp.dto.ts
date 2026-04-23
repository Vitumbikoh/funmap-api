import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[\s\-()]/g, '').trim() : value,
  )
  @Matches(/^(?:\+?265|0)\d{9}$/, {
    message: 'phone number must be a valid Malawi number (+265xxxxxxxxx or 0xxxxxxxxx)',
  })
  phoneNumber: string;

  @IsOptional()
  @IsString()
  purpose?: string = 'LOGIN';
}

