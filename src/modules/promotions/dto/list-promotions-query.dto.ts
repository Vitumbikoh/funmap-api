import { PromotionStatus } from '../enums/promotion-status.enum';
import { PromotionTargetType } from '../enums/promotion-target-type.enum';

export class ListPromotionsQueryDto {
  page?: number = 1;

  limit?: number = 20;

  status?: PromotionStatus;

  targetType?: PromotionTargetType;
}