import { IsOptional, IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterRequestOtpDto {
  @IsPhoneNumber()
  phoneNumber!: string;

  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  username?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
