import { IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsPhoneNumber()
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

