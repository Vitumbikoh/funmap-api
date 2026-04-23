import { ForbiddenException } from '@nestjs/common';
import { PricingAudience } from '../enums/pricing-audience.enum';
import { Role } from '../enums/role.enum';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';

type FeatureKey =
  | 'events_map_access'
  | 'basic_location_browsing'
  | 'places_map_access'
  | 'trending_map_access'
  | 'promoted_pin_access'
  | 'likes_and_reactions'
  | 'limited_rsvp'
  | 'unlimited_rsvp'
  | 'direct_messaging'
  | 'basic_filters'
  | 'advanced_filters'
  | 'basic_mood_filters'
  | 'full_mood_filters'
  | 'fun_oclock_notifications'
  | 'priority_recommendations'
  | 'trending_priority_notifications'
  | 'create_events'
  | 'basic_media_uploads'
  | 'video_reels_uploads'
  | 'basic_rsvp_tracking'
  | 'basic_analytics'
  | 'advanced_analytics'
  | 'full_analytics'
  | 'attendee_interaction'
  | 'promotions'
  | 'external_promotion'
  | 'priority_feed_ranking'
  | 'featured_placement'
  | 'promoted_map_pins'
  | 'verified_badge';

type FeatureDefinition = {
  key: FeatureKey;
  label: string;
  upgradeTitle: string;
  upgradeDescription: string;
  clienteleMinPlan?: SubscriptionPlan;
  capitalMinPlan?: SubscriptionPlan;
};

type SubscriptionAccessUser = {
  roles: string[];
  subscriptionPlan?: SubscriptionPlan | null;
  subscriptionExpiresAt?: Date | null;
  township?: string | null;
  district?: string | null;
  region?: string | null;
  country?: string | null;
};

type GeographicScope = 'TOWNSHIP' | 'DISTRICT' | 'REGION' | 'COUNTRY';
type AnalyticsAccessLevel = 'NONE' | 'BASIC' | 'ADVANCED' | 'FULL';

const PLAN_ORDER: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.LITE]: 1,
  [SubscriptionPlan.BRONZE]: 2,
  [SubscriptionPlan.SILVER]: 3,
  [SubscriptionPlan.GOLD]: 4,
};

const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: 'events_map_access',
    label: 'Events and map access',
    upgradeTitle: 'Keep discovering with any tier',
    upgradeDescription: 'Core discovery stays available so FunMap remains useful before upgrading.',
    clienteleMinPlan: SubscriptionPlan.LITE,
  },
  {
    key: 'basic_location_browsing',
    label: 'Basic location browsing',
    upgradeTitle: 'Browse by location',
    upgradeDescription: 'Lite keeps map and nearby discovery open for everyone.',
    clienteleMinPlan: SubscriptionPlan.LITE,
  },
  {
    key: 'places_map_access',
    label: 'Always-open places on map',
    upgradeTitle: 'Unlock place discovery with BRONZE',
    upgradeDescription: 'Bronze adds always-available places to map discovery.',
    clienteleMinPlan: SubscriptionPlan.BRONZE,
    capitalMinPlan: SubscriptionPlan.BRONZE,
  },
  {
    key: 'trending_map_access',
    label: 'Trending map view',
    upgradeTitle: 'Upgrade to SILVER for trending map signals',
    upgradeDescription: 'Silver unlocks hot and trending locations in map discovery.',
    clienteleMinPlan: SubscriptionPlan.SILVER,
    capitalMinPlan: SubscriptionPlan.SILVER,
  },
  {
    key: 'promoted_pin_access',
    label: 'Promoted pins view',
    upgradeTitle: 'Upgrade to GOLD for promoted pins',
    upgradeDescription: 'Gold unlocks full promoted-pin visibility on the map.',
    clienteleMinPlan: SubscriptionPlan.GOLD,
    capitalMinPlan: SubscriptionPlan.GOLD,
  },
  {
    key: 'likes_and_reactions',
    label: 'Likes and reactions',
    upgradeTitle: 'Stay social on Lite',
    upgradeDescription: 'Basic reactions remain available even without a paid plan.',
    clienteleMinPlan: SubscriptionPlan.LITE,
  },
  {
    key: 'limited_rsvp',
    label: 'Limited RSVP',
    upgradeTitle: 'Upgrade for more RSVP headroom',
    upgradeDescription: 'Lite keeps RSVP available in a lighter monthly allowance.',
    clienteleMinPlan: SubscriptionPlan.LITE,
  },
  {
    key: 'unlimited_rsvp',
    label: 'Unlimited RSVP',
    upgradeTitle: 'Upgrade to SILVER for unlimited RSVP',
    upgradeDescription: 'Silver removes monthly RSVP limits for frequent event-goers.',
    clienteleMinPlan: SubscriptionPlan.SILVER,
  },
  {
    key: 'direct_messaging',
    label: 'Messaging',
    upgradeTitle: 'Unlock messaging with BRONZE',
    upgradeDescription: 'Bronze opens event-driven messaging, while higher tiers improve access depth.',
    clienteleMinPlan: SubscriptionPlan.BRONZE,
  },
  {
    key: 'basic_filters',
    label: 'Basic discovery filters',
    upgradeTitle: 'Unlock filters with BRONZE',
    upgradeDescription: 'Bronze adds distance and category filtering for faster discovery.',
    clienteleMinPlan: SubscriptionPlan.BRONZE,
  },
  {
    key: 'advanced_filters',
    label: 'Advanced filters',
    upgradeTitle: 'Upgrade to SILVER for mood and time filters',
    upgradeDescription: 'Silver unlocks mood, time, and richer discovery controls.',
    clienteleMinPlan: SubscriptionPlan.SILVER,
  },
  {
    key: 'basic_mood_filters',
    label: 'Basic mood filters',
    upgradeTitle: 'Unlock mood filters with BRONZE',
    upgradeDescription: 'Bronze adds a smaller starter set of mood filters.',
    clienteleMinPlan: SubscriptionPlan.BRONZE,
  },
  {
    key: 'full_mood_filters',
    label: 'Full mood filters',
    upgradeTitle: 'Upgrade to SILVER for all mood filters',
    upgradeDescription: 'Silver and Gold unlock the full mood-based discovery system.',
    clienteleMinPlan: SubscriptionPlan.SILVER,
  },
  {
    key: 'fun_oclock_notifications',
    label: 'Fun O\'clock notifications',
    upgradeTitle: 'Upgrade to SILVER for Fun O\'clock',
    upgradeDescription: 'Silver turns on smart nearby nightlife notifications.',
    clienteleMinPlan: SubscriptionPlan.SILVER,
  },
  {
    key: 'priority_recommendations',
    label: 'Priority recommendations',
    upgradeTitle: 'Upgrade to SILVER for better recommendations',
    upgradeDescription: 'Silver prioritizes more relevant events and places in discovery.',
    clienteleMinPlan: SubscriptionPlan.SILVER,
  },
  {
    key: 'trending_priority_notifications',
    label: 'Trending priority alerts',
    upgradeTitle: 'Upgrade to GOLD for premium discovery',
    upgradeDescription: 'Gold gets earlier and stronger signals for nearby trending events.',
    clienteleMinPlan: SubscriptionPlan.GOLD,
  },
  {
    key: 'create_events',
    label: 'Create and publish events',
    upgradeTitle: 'Create events on Lite',
    upgradeDescription: 'Capital users can start publishing even on Lite, with smaller reach.',
    capitalMinPlan: SubscriptionPlan.LITE,
  },
  {
    key: 'basic_media_uploads',
    label: 'Poster and image uploads',
    upgradeTitle: 'Start with basic media',
    upgradeDescription: 'Lite supports core event posters and image-led publishing.',
    capitalMinPlan: SubscriptionPlan.LITE,
  },
  {
    key: 'video_reels_uploads',
    label: 'Video and reels uploads',
    upgradeTitle: 'Unlock video uploads with BRONZE',
    upgradeDescription: 'Bronze opens richer media formats for stronger promotion.',
    capitalMinPlan: SubscriptionPlan.BRONZE,
  },
  {
    key: 'basic_rsvp_tracking',
    label: 'Basic RSVP tracking',
    upgradeTitle: 'Unlock attendee counts with BRONZE',
    upgradeDescription: 'Bronze lets capital users track RSVP volume.',
    capitalMinPlan: SubscriptionPlan.BRONZE,
  },
  {
    key: 'basic_analytics',
    label: 'Basic analytics',
    upgradeTitle: 'Unlock analytics with BRONZE',
    upgradeDescription: 'Bronze opens starter organizer insights like RSVP volume.',
    capitalMinPlan: SubscriptionPlan.BRONZE,
  },
  {
    key: 'advanced_analytics',
    label: 'Advanced analytics dashboard',
    upgradeTitle: 'Upgrade to SILVER to view analytics',
    upgradeDescription: 'Silver reveals engagement, paid attendee, and performance insights.',
    capitalMinPlan: SubscriptionPlan.SILVER,
  },
  {
    key: 'full_analytics',
    label: 'Full analytics dashboard',
    upgradeTitle: 'Upgrade to GOLD for full analytics',
    upgradeDescription: 'Gold unlocks the most complete analytics, trends, and reach visibility.',
    capitalMinPlan: SubscriptionPlan.GOLD,
  },
  {
    key: 'attendee_interaction',
    label: 'Attendee interaction',
    upgradeTitle: 'Upgrade to SILVER for attendee interaction',
    upgradeDescription: 'Silver unlocks deeper attendee access and interaction tooling.',
    capitalMinPlan: SubscriptionPlan.SILVER,
  },
  {
    key: 'promotions',
    label: 'Boosts and promotions',
    upgradeTitle: 'Unlock promotions with BRONZE',
    upgradeDescription: 'Bronze enables lightweight promotion tools, with more scale on higher tiers.',
    capitalMinPlan: SubscriptionPlan.BRONZE,
  },
  {
    key: 'external_promotion',
    label: 'External promotion tools',
    upgradeTitle: 'Upgrade to SILVER or GOLD for external promotion',
    upgradeDescription: 'Higher capital tiers unlock external campaign support and distribution tools.',
    capitalMinPlan: SubscriptionPlan.SILVER,
  },
  {
    key: 'priority_feed_ranking',
    label: 'Priority feed ranking',
    upgradeTitle: 'Upgrade to SILVER for priority ranking',
    upgradeDescription: 'Silver improves search and feed placement for capital users.',
    capitalMinPlan: SubscriptionPlan.SILVER,
  },
  {
    key: 'featured_placement',
    label: 'Featured placement',
    upgradeTitle: 'Upgrade to GOLD for featured placement',
    upgradeDescription: 'Gold unlocks premium placements like trending and must-attend surfaces.',
    capitalMinPlan: SubscriptionPlan.GOLD,
  },
  {
    key: 'promoted_map_pins',
    label: 'Promoted map pins',
    upgradeTitle: 'Upgrade to GOLD for promoted map pins',
    upgradeDescription: 'Gold gives your locations premium map visibility.',
    capitalMinPlan: SubscriptionPlan.GOLD,
  },
  {
    key: 'verified_badge',
    label: 'Verified trust badge',
    upgradeTitle: 'Upgrade to GOLD for trust indicators',
    upgradeDescription: 'Gold includes a stronger premium trust presentation for capital brands.',
    capitalMinPlan: SubscriptionPlan.GOLD,
  },
];

export function resolvePricingAudienceFromRoles(roles: string[]): PricingAudience {
  const normalized = roles.map((item) => item.toUpperCase());
  const isCapital =
    normalized.includes(Role.BUSINESS) || normalized.includes(Role.CAPITAL_USER);

  return isCapital ? PricingAudience.CAPITAL : PricingAudience.CLIENTELE;
}

export function resolveGeographicScopeForPlan(plan: SubscriptionPlan): GeographicScope {
  switch (plan) {
    case SubscriptionPlan.BRONZE:
      return 'DISTRICT';
    case SubscriptionPlan.SILVER:
      return 'REGION';
    case SubscriptionPlan.GOLD:
      return 'COUNTRY';
    case SubscriptionPlan.LITE:
    default:
      return 'TOWNSHIP';
  }
}

export function resolveAllowedMoodFilters(user: SubscriptionAccessUser): string[] {
  const { effectivePlan } = resolveEffectiveSubscriptionPlan(user);
  switch (effectivePlan) {
    case SubscriptionPlan.BRONZE:
      return ['LOUD', 'CHILLED'];
    case SubscriptionPlan.SILVER:
    case SubscriptionPlan.GOLD:
      return ['LOUD', 'CHILLED', 'ELEGANCE', 'RNB', 'OLD-SCHOOL'];
    case SubscriptionPlan.LITE:
    default:
      return [];
  }
}

export function resolveMapAccess(user: SubscriptionAccessUser) {
  return {
    events: hasSubscriptionFeatureAccess(user, 'events_map_access'),
    places: hasSubscriptionFeatureAccess(user, 'places_map_access'),
    trending: hasSubscriptionFeatureAccess(user, 'trending_map_access'),
    promotedPins: hasSubscriptionFeatureAccess(user, 'promoted_pin_access'),
  };
}

export function resolveAnalyticsAccessLevel(user: SubscriptionAccessUser): AnalyticsAccessLevel {
  if (hasSubscriptionFeatureAccess(user, 'full_analytics')) {
    return 'FULL';
  }

  if (hasSubscriptionFeatureAccess(user, 'advanced_analytics')) {
    return 'ADVANCED';
  }

  if (hasSubscriptionFeatureAccess(user, 'basic_analytics')) {
    return 'BASIC';
  }

  return 'NONE';
}

export function resolveEffectiveSubscriptionPlan(user: SubscriptionAccessUser) {
  const storedPlan = user.subscriptionPlan ?? SubscriptionPlan.LITE;
  const expiresAt = user.subscriptionExpiresAt ?? null;
  const now = new Date();
  const isExpired =
    storedPlan !== SubscriptionPlan.LITE &&
    expiresAt !== null &&
    expiresAt.getTime() <= now.getTime();

  return {
    storedPlan,
    effectivePlan: isExpired ? SubscriptionPlan.LITE : storedPlan,
    expiresAt,
    isExpired,
    isPaidPlan: storedPlan !== SubscriptionPlan.LITE,
  };
}

export function hasSubscriptionFeatureAccess(
  user: SubscriptionAccessUser,
  featureKey: FeatureKey,
): boolean {
  const audience = resolvePricingAudienceFromRoles(user.roles ?? []);
  const feature = FEATURE_DEFINITIONS.find((item) => item.key === featureKey);

  if (!feature) {
    return false;
  }

  const { effectivePlan } = resolveEffectiveSubscriptionPlan(user);
  const minimumPlan =
    audience === PricingAudience.CAPITAL
      ? feature.capitalMinPlan
      : feature.clienteleMinPlan;

  if (!minimumPlan) {
    return false;
  }

  return PLAN_ORDER[effectivePlan] >= PLAN_ORDER[minimumPlan];
}

export function assertSubscriptionFeatureAccess(
  user: SubscriptionAccessUser,
  featureKey: FeatureKey,
): void {
  const feature = FEATURE_DEFINITIONS.find((item) => item.key === featureKey);
  if (!feature) {
    throw new ForbiddenException('Subscription access is not configured for this feature.');
  }

  if (hasSubscriptionFeatureAccess(user, featureKey)) {
    return;
  }

  throw new ForbiddenException(feature.upgradeDescription);
}

export function buildSubscriptionAccessPayload(user: SubscriptionAccessUser) {
  const audience = resolvePricingAudienceFromRoles(user.roles ?? []);
  const lifecycle = resolveEffectiveSubscriptionPlan(user);
  const expiresAt = lifecycle.expiresAt;
  const mapAccess = resolveMapAccess(user);
  const geographicScope = resolveGeographicScopeForPlan(lifecycle.effectivePlan);
  const allowedMoodFilters = resolveAllowedMoodFilters(user);
  const daysRemaining =
    expiresAt == null
      ? null
      : Math.max(
          0,
          Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        );

  return {
    audience,
    storedPlan: lifecycle.storedPlan,
    effectivePlan: lifecycle.effectivePlan,
    expiresAt: expiresAt?.toISOString() ?? null,
    isExpired: lifecycle.isExpired,
    expiresSoon: daysRemaining !== null && daysRemaining <= 5 && !lifecycle.isExpired,
    daysRemaining,
    downgradePlanOnExpiry: SubscriptionPlan.LITE,
    geographicScope,
    mapAccess,
    analyticsAccessLevel: resolveAnalyticsAccessLevel(user),
    allowedMoodFilters,
    featureMatrix: FEATURE_DEFINITIONS.map((feature) => {
      const minimumPlan =
        audience === PricingAudience.CAPITAL
          ? feature.capitalMinPlan
          : feature.clienteleMinPlan;

      return {
        key: feature.key,
        label: feature.label,
        minimumPlan: minimumPlan ?? null,
        enabled:
          minimumPlan != null &&
          PLAN_ORDER[lifecycle.effectivePlan] >= PLAN_ORDER[minimumPlan],
        upgradeTitle: feature.upgradeTitle,
        upgradeDescription: feature.upgradeDescription,
      };
    }),
  };
}
