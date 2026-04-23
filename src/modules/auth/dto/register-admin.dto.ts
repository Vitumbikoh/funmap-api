import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterAdminDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[\s\-()]/g, '').trim() : value,
  )
  @Matches(/^(?:\+?265|0)\d{9}$/, {
    message: 'phone number must be a valid Malawi number (+265xxxxxxxxx or 0xxxxxxxxx)',
  })
  phoneNumber!: string;

  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsString()
  @MaxLength(60)
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(8)
  adminSecret!: string;
}
