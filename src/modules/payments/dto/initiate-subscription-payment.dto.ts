import { IsEnum } from 'class-validator';
import { SubscriptionPlan } from '../../../shared/enums/subscription-plan.enum';

export class InitiateSubscriptionPaymentDto {
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;
}
