import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CredentialLoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  identifier!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
