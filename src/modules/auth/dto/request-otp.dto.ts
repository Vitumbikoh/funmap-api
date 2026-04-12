import { IsOptional, IsPhoneNumber, IsString } from 'class-validator';

export class RequestOtpDto {
  @IsPhoneNumber()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  purpose?: string = 'LOGIN';
}

