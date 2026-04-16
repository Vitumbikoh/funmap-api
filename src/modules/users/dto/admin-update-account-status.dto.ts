import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { AccountStatus } from '../../../shared/enums/account-status.enum';

export class AdminUpdateAccountStatusDto {
  @IsEnum(AccountStatus)
  status!: AccountStatus;

  @IsOptional()
  @IsDateString()
  reactivateAt?: string;
}
