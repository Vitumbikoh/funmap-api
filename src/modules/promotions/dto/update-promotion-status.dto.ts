import { IsEnum } from 'class-validator';
import { PromotionStatus } from '../enums/promotion-status.enum';

export class UpdatePromotionStatusDto {
  @IsEnum(PromotionStatus)
  status: PromotionStatus;
}