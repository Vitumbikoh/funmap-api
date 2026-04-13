import { IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';

export class VerifyRegistrationOtpDto {
  @IsPhoneNumber()
  phoneNumber!: string;

  @IsString()
  @Length(4, 6)
  code!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
