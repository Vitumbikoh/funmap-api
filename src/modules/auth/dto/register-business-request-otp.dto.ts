import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Gender } from '../../../shared/enums/gender.enum';

export class RegisterBusinessRequestOtpDto {
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

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  businessName?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
