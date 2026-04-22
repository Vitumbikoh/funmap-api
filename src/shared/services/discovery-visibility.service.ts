import { ForbiddenException } from '@nestjs/common';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import {
  resolveAllowedMoodFilters,
  resolveEffectiveSubscriptionPlan,
  resolveGeographicScopeForPlan,
} from './subscription-access.service';

type DiscoveryUser = {
  roles?: string[];
  subscriptionPlan?: SubscriptionPlan | null;
  subscriptionExpiresAt?: Date | null;
  township?: string | null;
  district?: string | null;
  region?: string | null;
  country?: string | null;
};

export function buildDiscoveryScopeCondition(
  alias: string,
  user: DiscoveryUser,
  params: unknown[],
): string {
  const { effectivePlan } = resolveEffectiveSubscriptionPlan({ roles: [], ...user });
  const scope = resolveGeographicScopeForPlan(effectivePlan);

  switch (scope) {
    case 'TOWNSHIP':
      return buildCondition(alias, 'township', user.township, params, user);
    case 'DISTRICT':
      return buildCondition(alias, 'district', user.district, params, user);
    case 'REGION':
      return buildCondition(alias, 'region', user.region, params, user);
    case 'COUNTRY':
    default:
      return buildCondition(alias, 'country', user.country, params, user);
  }
}

export function assertAllowedMoodFilter(user: DiscoveryUser, moodTag?: string | null) {
  const normalizedMood = moodTag?.trim().toUpperCase();
  if (!normalizedMood) {
    return;
  }

  const allowed = resolveAllowedMoodFilters({ roles: [], ...user });
  if (allowed.length === 0) {
    throw new ForbiddenException('Upgrade to BRONZE to unlock mood filtering.');
  }

  if (!allowed.includes(normalizedMood)) {
    throw new ForbiddenException(
      `Your current tier supports only these mood filters: ${allowed.join(', ')}.`,
    );
  }
}

function buildCondition(
  alias: string,
  field: 'township' | 'district' | 'region' | 'country',
  value: string | null | undefined,
  params: unknown[],
  user: DiscoveryUser,
): string {
  const normalized = value?.trim();
  if (normalized) {
    params.push(normalized);
    return `${alias}.${field} ILIKE $${params.length}`;
  }

  const fallbackCountry = user.country?.trim();
  if (fallbackCountry) {
    params.push(fallbackCountry);
    return `${alias}.country ILIKE $${params.length}`;
  }

  params.push('__NO_DISCOVERY_SCOPE__');
  return `${alias}.country = $${params.length}`;
}
