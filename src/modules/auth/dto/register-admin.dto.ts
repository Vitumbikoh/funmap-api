import { IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterAdminDto {
  @IsPhoneNumber()
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
