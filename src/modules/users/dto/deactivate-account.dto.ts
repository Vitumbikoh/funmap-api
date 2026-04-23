import { IsDateString } from 'class-validator';

export class DeactivateAccountDto {
  @IsDateString()
  reactivateAt!: string;
}