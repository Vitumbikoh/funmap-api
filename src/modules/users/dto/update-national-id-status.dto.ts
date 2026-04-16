import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { NationalIdStatus } from '../../../shared/enums/national-id-status.enum';

export class UpdateNationalIdStatusDto {
  @IsEnum(NationalIdStatus)
  status!: NationalIdStatus;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}