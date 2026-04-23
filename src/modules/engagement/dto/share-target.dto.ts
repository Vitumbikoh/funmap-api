import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ShareTargetDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  destination?: string;
}
