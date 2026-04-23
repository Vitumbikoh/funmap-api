import { ForbiddenException } from '@nestjs/common';
import { BusinessCoverage } from '../enums/business-coverage.enum';
import { Role } from '../enums/role.enum';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';

const COVERAGE_ORDER: Record<BusinessCoverage, number> = {
  [BusinessCoverage.TOWNSHIP]: 1,
  [BusinessCoverage.DISTRICT]: 2,
  [BusinessCoverage.REGION]: 3,
  [BusinessCoverage.COUNTRY]: 4,
};

const PLAN_ORDER: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.LITE]: 1,
  [SubscriptionPlan.BRONZE]: 2,
  [SubscriptionPlan.SILVER]: 3,
  [SubscriptionPlan.GOLD]: 4,
};

type CoveragePayload = {
  township?: string | null;
  district?: string | null;
  region?: string | null;
  country?: string | null;
};

export function enforceCoverageForBusiness(
  roles: Role[],
  subscriptionPlan: SubscriptionPlan,
  payload: CoveragePayload,
) {
  const isBusinessPublisher =
    roles.includes(Role.BUSINESS) || roles.includes(Role.CAPITAL_USER);

  if (!isBusinessPublisher) {
    return;
  }

  const requestedCoverage = resolveRequestedCoverage(payload);
  if (!requestedCoverage) {
    return;
  }

  const requestedOrder = COVERAGE_ORDER[requestedCoverage];
  const allowedOrder = PLAN_ORDER[subscriptionPlan];

  if (requestedOrder > allowedOrder) {
    throw new ForbiddenException(
      `Your ${subscriptionPlan} plan does not allow ${requestedCoverage} coverage. Upgrade your plan to publish at this level.`,
    );
  }
}

function resolveRequestedCoverage(payload: CoveragePayload): BusinessCoverage | null {
  if (hasValue(payload.country)) {
    return BusinessCoverage.COUNTRY;
  }

  if (hasValue(payload.region)) {
    return BusinessCoverage.REGION;
  }

  if (hasValue(payload.district)) {
    return BusinessCoverage.DISTRICT;
  }

  if (hasValue(payload.township)) {
    return BusinessCoverage.TOWNSHIP;
  }

  return null;
}

function hasValue(value?: string | null) {
  return Boolean(value && value.trim().length > 0);
}