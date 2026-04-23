import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Point } from 'geojson';
import { Not, Repository } from 'typeorm';
import { Like } from '../../shared/database/entities/like.entity';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { AccountStatus } from '../../shared/enums/account-status.enum';
import { BusinessVerificationStatus } from '../../shared/enums/business-verification-status.enum';
import { ContentTarget } from '../../shared/enums/content-target.enum';
import { NationalIdStatus } from '../../shared/enums/national-id-status.enum';
import { PaymentStatus } from '../../shared/enums/payment-status.enum';
import { Role } from '../../shared/enums/role.enum';
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { SubscriptionPlan } from '../../shared/enums/subscription-plan.enum';
import { Session } from '../auth/entities/session.entity';
import { Event } from '../events/entities/event.entity';
import { Rsvp } from '../events/entities/rsvp.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { UpdateFunOclockDto } from './dto/update-fun-oclock.dto';
import { UpdateNationalIdStatusDto } from './dto/update-national-id-status.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AdminListUsersQueryDto } from './dto/admin-list-users-query.dto';
import { AdminUpdateAccountStatusDto } from './dto/admin-update-account-status.dto';
import { User } from './entities/user.entity';
import { ContentType } from '../../shared/enums/content-type.enum';
import {
  assertSubscriptionFeatureAccess,
  buildSubscriptionAccessPayload,
  resolveEffectiveSubscriptionPlan,
  resolveMapAccess,
} from '../../shared/services/subscription-access.service';
import { buildDiscoveryScopeCondition } from '../../shared/services/discovery-visibility.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Rsvp)
    private readonly rsvpRepository: Repository<Rsvp>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(Like)
    private readonly likesRepository: Repository<Like>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(Reel)
    private readonly reelsRepository: Repository<Reel>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getPublicProfile(id: string) {
    const user = await this.findById(id);
    return this.sanitizeUser(user);
  }

  async getProfilePreview(_viewerId: string, targetUserId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: targetUserId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        businessName: true,
        businessCategory: true,
        businessDescription: true,
        bio: true,
        roles: true,
        isVerified: true,
        businessVerificationStatus: true,
        nationalIdStatus: true,
        township: true,
        district: true,
        region: true,
        country: true,
        accountStatus: true,
      },
    });

    if (!user || user.accountStatus !== AccountStatus.ACTIVE) {
      throw new NotFoundException('User not found');
    }

    const [postsCount, reelsCount, eventsCount, posts, reels] = await Promise.all([
      this.postsRepository.count({
        where: { authorId: targetUserId, contentType: ContentType.POST },
      }),
      this.reelsRepository.count({
        where: { authorId: targetUserId },
      }),
      this.eventsRepository.count({
        where: { organizerId: targetUserId, isPublished: true },
      }),
      this.postsRepository.find({
        where: { authorId: targetUserId, contentType: ContentType.POST },
        order: { createdAt: 'DESC' },
        take: 60,
      }),
      this.reelsRepository.find({
        where: { authorId: targetUserId },
        order: { createdAt: 'DESC' },
        take: 60,
      }),
    ]);

    return {
      profile: this.buildProfilePreview(user),
      stats: {
        postsCount,
        reelsCount,
        eventsCount,
      },
      gallery: {
        posts: posts.map((post) => ({
          id: post.id,
          caption: post.caption,
          mediaIds: post.mediaIds,
          createdAt: post.createdAt,
          likeCount: post.likeCount,
          commentCount: post.commentCount,
          shareCount: post.shareCount,
        })),
        reels: reels.map((reel) => ({
          id: reel.id,
          caption: reel.caption,
          mediaId: reel.mediaId,
          thumbnailMediaId: reel.thumbnailMediaId,
          durationSeconds: reel.durationSeconds,
          createdAt: reel.createdAt,
          likeCount: reel.likeCount,
          commentCount: reel.commentCount,
          shareCount: reel.shareCount,
          viewCount: reel.viewCount,
        })),
      },
    };
  }

  async findNearbyUsers(userId: string, query: GeoQueryDto) {
    const radiusKm = query.radiusKm ?? 15;

    return this.usersRepository.query(
      `
        SELECT
          u.id,
          u.display_name AS "displayName",
          u.username,
          u.avatar_url AS "avatarUrl",
          u.township,
          u.district,
          u.region,
          u.country,
          u.last_active_at AS "lastActiveAt",
          ST_Y(u.home_location::geometry) AS latitude,
          ST_X(u.home_location::geometry) AS longitude,
          ST_Distance(
            u.home_location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 AS distance_km
        FROM users u
        WHERE u.id <> $4
          AND u.account_status = 'ACTIVE'
          AND u.home_location IS NOT NULL
          AND ST_DWithin(
            u.home_location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3 * 1000
          )
        ORDER BY distance_km ASC
        LIMIT 200
      `,
      [query.longitude, query.latitude, radiusKm, userId],
    );
  }

  async findNearbyPlaces(userId: string, query: GeoQueryDto) {
    const radiusKm = query.radiusKm ?? 15;
    const viewer = await this.findById(userId);
    const mapAccess = resolveMapAccess(viewer);

    if (!mapAccess.places) {
      throw new ForbiddenException('Upgrade to BRONZE to unlock place discovery on the map.');
    }

    const params: unknown[] = [query.longitude, query.latitude, radiusKm, userId];
    const scopeCondition = buildDiscoveryScopeCondition('u', viewer, params);

    return this.usersRepository.query(
      `
        SELECT
          u.id,
          COALESCE(NULLIF(u.business_name, ''), NULLIF(u.display_name, ''), NULLIF(u.username, ''), 'FunMap place') AS title,
          u.business_name AS "businessName",
          u.business_category AS "businessCategory",
          u.business_description AS description,
          u.avatar_url AS "avatarUrl",
          u.business_cover_url AS "coverUrl",
          u.taxi_phone_number AS "taxiPhoneNumber",
          u.taxi_whatsapp_number AS "taxiWhatsappNumber",
          u.transport_notes AS "transportNotes",
          u.opening_hours_note AS "openingHoursNote",
          u.is_always_open_place AS "isAlwaysOpenPlace",
          u.township,
          u.district,
          u.region,
          u.country,
          ST_Y(u.home_location::geometry) AS latitude,
          ST_X(u.home_location::geometry) AS longitude,
          ST_Distance(
            u.home_location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 AS distance_km
        FROM users u
        WHERE u.id <> $4
          AND u.account_status = 'ACTIVE'
          AND u.home_location IS NOT NULL
          AND u.is_always_open_place = true
          AND (
            'BUSINESS' = ANY(u.roles) OR
            'CAPITAL_USER' = ANY(u.roles)
          )
          AND ${scopeCondition}
          AND ST_DWithin(
            u.home_location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3 * 1000
          )
        ORDER BY distance_km ASC
        LIMIT 100
      `,
      params,
    );
  }

  async updateProfile(userId: string, payload: UpdateProfileDto) {
    const user = await this.findById(userId);
    if (
      payload.subscriptionPlan !== undefined &&
      payload.subscriptionPlan !== user.subscriptionPlan
    ) {
      if (payload.subscriptionPlan !== SubscriptionPlan.LITE) {
        throw new BadRequestException(
          'Paid plan changes must be completed through subscription checkout.',
        );
      }

      user.subscriptionPlan = SubscriptionPlan.LITE;
      user.subscriptionExpiresAt = null;
      user.subscriptionRenewalReminderSentAt = null;
    }

    const nextUsername = normalizeHandle(payload.username);
    const nextEmail = normalizeEmail(payload.email);
    const nextDisplayName = normalizeText(payload.displayName);
    const nextBusinessName = normalizeText(payload.businessName);
    const nextBusinessDescription = normalizeText(payload.businessDescription);
    const nextTaxiPhoneNumber = normalizePhone(payload.taxiPhoneNumber);
    const nextTaxiWhatsappNumber = normalizePhone(payload.taxiWhatsappNumber);
    const nextTransportNotes = normalizeText(payload.transportNotes);
    const nextOpeningHoursNote = normalizeText(payload.openingHoursNote);
    const nextAvatarUrl = normalizeText(payload.avatarUrl);
    const nextBusinessCoverUrl = normalizeText(payload.businessCoverUrl);
    const nextVerificationDocumentUrl = normalizeText(
      payload.verificationDocumentUrl,
    );
    const nextBio = normalizeText(payload.bio);
    const nextNationalIdNumber = normalizeNationalId(payload.nationalIdNumber);
    const nextNationalIdDocumentUrl = normalizeText(payload.nationalIdDocumentUrl);
    const nextTownship = normalizeText(payload.township);
    const nextDistrict = normalizeText(payload.district);
    const nextRegion = normalizeText(payload.region);
    const nextCountry = normalizeText(payload.country);

    if (nextUsername && nextUsername !== user.username) {
      const existingByUsername = await this.usersRepository.findOne({
        where: {
          username: nextUsername,
          id: Not(userId),
        },
      });

      if (existingByUsername) {
        throw new ConflictException('Username is already taken.');
      }
    }

    if (nextEmail && nextEmail !== user.email) {
      const existingByEmail = await this.usersRepository.findOne({
        where: {
          email: nextEmail,
          id: Not(userId),
        },
      });

      if (existingByEmail) {
        throw new ConflictException('Email is already registered.');
      }
    }

    if (
      nextNationalIdNumber &&
      nextNationalIdNumber !== user.nationalIdNumber
    ) {
      const existingByNationalId = await this.usersRepository.findOne({
        where: {
          nationalIdNumber: nextNationalIdNumber,
          id: Not(userId),
        },
      });

      if (existingByNationalId) {
        throw new ConflictException('National ID is already registered.');
      }
    }

    const homeLocation =
      payload.latitude !== undefined && payload.longitude !== undefined
        ? ({
            type: 'Point',
            coordinates: [payload.longitude, payload.latitude],
          } as Point)
        : user.homeLocation;

    Object.assign(user, {
      username: nextUsername !== undefined ? nextUsername : user.username,
      email: nextEmail !== undefined ? nextEmail : user.email,
      displayName:
        nextDisplayName !== undefined ? nextDisplayName : user.displayName,
      businessName:
        nextBusinessName !== undefined ? nextBusinessName : user.businessName,
      businessCategory: payload.businessCategory ?? user.businessCategory,
      businessDescription:
        nextBusinessDescription !== undefined
          ? nextBusinessDescription
          : user.businessDescription,
      taxiPhoneNumber:
        nextTaxiPhoneNumber !== undefined
          ? nextTaxiPhoneNumber
          : user.taxiPhoneNumber,
      taxiWhatsappNumber:
        nextTaxiWhatsappNumber !== undefined
          ? nextTaxiWhatsappNumber
          : user.taxiWhatsappNumber,
      transportNotes:
        nextTransportNotes !== undefined
          ? nextTransportNotes
          : user.transportNotes,
      isAlwaysOpenPlace:
        payload.isAlwaysOpenPlace ?? user.isAlwaysOpenPlace,
      openingHoursNote:
        nextOpeningHoursNote !== undefined
          ? nextOpeningHoursNote
          : user.openingHoursNote,
      operatingCoverage: payload.operatingCoverage ?? user.operatingCoverage,
      avatarUrl: nextAvatarUrl !== undefined ? nextAvatarUrl : user.avatarUrl,
      businessCoverUrl:
        nextBusinessCoverUrl !== undefined
          ? nextBusinessCoverUrl
          : user.businessCoverUrl,
      verificationDocumentUrl:
        nextVerificationDocumentUrl !== undefined
          ? nextVerificationDocumentUrl
          : user.verificationDocumentUrl,
      nationalIdNumber:
        nextNationalIdNumber !== undefined
          ? nextNationalIdNumber
          : user.nationalIdNumber,
      nationalIdDocumentUrl:
        nextNationalIdDocumentUrl !== undefined
          ? nextNationalIdDocumentUrl
          : user.nationalIdDocumentUrl,
      subscriptionPlan: user.subscriptionPlan,
      bio: nextBio !== undefined ? nextBio : user.bio,
      township: nextTownship !== undefined ? nextTownship : user.township,
      district: nextDistrict !== undefined ? nextDistrict : user.district,
      region: nextRegion !== undefined ? nextRegion : user.region,
      country: nextCountry !== undefined ? nextCountry : user.country,
      interests:
        payload.interests
          ?.map((item) => item.trim())
          .filter((item) => item.length > 0) ??
        user.interests,
      homeLocation,
      lastActiveAt: new Date(),
    });

    if (nextBusinessName != null && nextBusinessName.length > 0) {
      user.displayName = nextBusinessName;
    }

    if (payload.acceptCapitalRules == true) {
      user.capitalRulesAcceptedAt = new Date();
    }

    if (
      nextVerificationDocumentUrl !== undefined &&
      user.businessVerificationStatus !== BusinessVerificationStatus.VERIFIED
    ) {
      user.businessVerificationStatus = BusinessVerificationStatus.PENDING;
    }

    if (
      (nextNationalIdNumber !== undefined ||
        nextNationalIdDocumentUrl !== undefined) &&
      user.nationalIdStatus !== NationalIdStatus.VERIFIED
    ) {
      user.nationalIdStatus =
        user.nationalIdNumber != null && user.nationalIdNumber.trim().length > 0
          ? NationalIdStatus.PENDING
          : NationalIdStatus.NOT_SUBMITTED;
    }

    const savedUser = await this.usersRepository.save(user);
    return this.sanitizeUser(savedUser);
  }

  async upgradeToBusiness(userId: string) {
    const user = await this.findById(userId);
    const nextRoles = new Set(user.roles ?? []);

    nextRoles.add(Role.BUSINESS);
    nextRoles.add(Role.CAPITAL_USER);

    user.roles = Array.from(nextRoles);
    user.subscriptionPlan = user.subscriptionPlan ?? SubscriptionPlan.LITE;
    if (user.businessVerificationStatus !== BusinessVerificationStatus.VERIFIED) {
      user.businessVerificationStatus = BusinessVerificationStatus.PENDING;
    }
    user.lastActiveAt = new Date();

    const savedUser = await this.usersRepository.save(user);

    return {
      message: 'Account upgraded to business.',
      user: this.sanitizeUser(savedUser),
    };
  }

  async deactivateAccount(userId: string, reactivateAtIso: string) {
    const user = await this.findById(userId);
    const reactivateAt = new Date(reactivateAtIso);

    if (Number.isNaN(reactivateAt.getTime())) {
      throw new BadRequestException('Provide a valid reactivation date and time.');
    }

    if (reactivateAt.getTime() <= Date.now()) {
      throw new BadRequestException('Reactivation time must be in the future.');
    }

    user.accountStatus = AccountStatus.DEACTIVATED;
    user.deactivatedUntil = reactivateAt;

    await Promise.all([
      this.usersRepository.save(user),
      this.sessionsRepository.delete({ userId }),
    ]);

    return {
      message: 'Account deactivated successfully.',
      reactivateAt: reactivateAt.toISOString(),
    };
  }

  async deleteAccountPermanently(userId: string) {
    const user = await this.findById(userId);

    user.accountStatus = AccountStatus.DELETED;
    user.deactivatedUntil = null;
    user.phoneNumber = this.buildDeletedPhonePlaceholder(user.id);
    user.passwordHash = null;
    user.email = null;
    user.username = null;
    user.displayName = 'Deleted User';
    user.avatarUrl = null;
    user.bio = null;
    user.taxiPhoneNumber = null;
    user.taxiWhatsappNumber = null;
    user.transportNotes = null;
    user.isAlwaysOpenPlace = false;
    user.openingHoursNote = null;
    user.homeLocation = null;
    user.township = null;
    user.district = null;
    user.region = null;
    user.country = null;
    user.isVerified = false;
    user.nationalIdNumber = null;
    user.nationalIdDocumentUrl = null;
    user.nationalIdStatus = NationalIdStatus.NOT_SUBMITTED;
    user.lastActiveAt = new Date();

    await Promise.all([
      this.usersRepository.save(user),
      this.sessionsRepository.delete({ userId }),
    ]);

    return {
      message:
        'Account deleted permanently. You can register again with your previous phone number.',
    };
  }

  async getFunOclockPreferences(userId: string) {
    const user = await this.findById(userId);

    return {
      enabled: user.funOclockEnabled,
      days: user.funOclockDays ?? ['FRI', 'SAT'],
      startHour: user.funOclockStartHour ?? 20,
      endHour: user.funOclockEndHour ?? 23,
      radiusKm: user.funOclockRadiusKm ?? 5,
      timezone: user.funOclockTimezone ?? 'Africa/Blantyre',
    };
  }

  async getPendingNationalIdReviews() {
    const items = await this.usersRepository.find({
      where: {
        nationalIdStatus: NationalIdStatus.PENDING,
      },
      order: {
        updatedAt: 'DESC',
      },
      select: {
        id: true,
        displayName: true,
        username: true,
        phoneNumber: true,
        nationalIdNumber: true,
        nationalIdDocumentUrl: true,
        nationalIdStatus: true,
        updatedAt: true,
      },
      take: 200,
    });

    return {
      items,
      total: items.length,
    };
  }

  async updateNationalIdReviewStatus(
    reviewerUserId: string,
    targetUserId: string,
    payload: UpdateNationalIdStatusDto,
  ) {
    const user = await this.findById(targetUserId);

    if (!user.nationalIdNumber) {
      throw new BadRequestException('User has not submitted National ID details.');
    }

    if (
      payload.status !== NationalIdStatus.VERIFIED &&
      payload.status !== NationalIdStatus.REJECTED &&
      payload.status !== NationalIdStatus.PENDING
    ) {
      throw new BadRequestException(
        'Review status must be PENDING, VERIFIED, or REJECTED.',
      );
    }

    user.nationalIdStatus = payload.status;
    user.lastActiveAt = new Date();
    const saved = await this.usersRepository.save(user);

    return {
      message: `National ID review updated to ${saved.nationalIdStatus}.`,
      reviewedBy: reviewerUserId,
      note: payload.note?.trim() || null,
      user: this.sanitizeUser(saved),
    };
  }

  async listUsersForAdmin(query: AdminListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .orderBy('user.updatedAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (query.search && query.search.trim().length > 0) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        `(
          user.displayName ILIKE :search OR
          user.username ILIKE :search OR
          user.phoneNumber ILIKE :search OR
          user.email ILIKE :search
        )`,
        { search },
      );
    }

    if (query.status) {
      qb.andWhere('user.accountStatus = :status', {
        status: query.status,
      });
    }

    if (query.role) {
      qb.andWhere(':role = ANY(user.roles)', {
        role: query.role,
      });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item) => ({
        id: item.id,
        displayName: item.displayName,
        username: item.username,
        phoneNumber: item.phoneNumber,
        email: item.email,
        roles: item.roles,
        accountStatus: item.accountStatus,
        nationalIdStatus: item.nationalIdStatus,
        district: item.district,
        region: item.region,
        country: item.country,
        lastActiveAt: item.lastActiveAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      total,
      page,
      limit,
    };
  }

  async updateUserAccountStatusForAdmin(
    reviewerUserId: string,
    targetUserId: string,
    payload: AdminUpdateAccountStatusDto,
  ) {
    const user = await this.findById(targetUserId);

    if (payload.status === AccountStatus.DELETED) {
      throw new BadRequestException('Use permanent account delete workflow for DELETED status.');
    }

    if (reviewerUserId === targetUserId && payload.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Admins cannot deactivate their own account from this workflow.');
    }

    if (payload.status === AccountStatus.ACTIVE) {
      user.accountStatus = AccountStatus.ACTIVE;
      user.deactivatedUntil = null;
    } else if (payload.status === AccountStatus.DEACTIVATED) {
      user.accountStatus = AccountStatus.DEACTIVATED;
      if (payload.reactivateAt) {
        const reactivateAt = new Date(payload.reactivateAt);
        if (Number.isNaN(reactivateAt.getTime())) {
          throw new BadRequestException('Provide a valid reactivation date and time.');
        }
        user.deactivatedUntil = reactivateAt;
      } else {
        user.deactivatedUntil = null;
      }

      await this.sessionsRepository.delete({ userId: user.id });
    }

    user.lastActiveAt = new Date();
    const saved = await this.usersRepository.save(user);

    return {
      message: `Account status updated to ${saved.accountStatus}.`,
      reviewedBy: reviewerUserId,
      user: {
        id: saved.id,
        displayName: saved.displayName,
        username: saved.username,
        phoneNumber: saved.phoneNumber,
        roles: saved.roles,
        accountStatus: saved.accountStatus,
        deactivatedUntil: saved.deactivatedUntil,
      },
    };
  }

  async updateFunOclockPreferences(userId: string, payload: UpdateFunOclockDto) {
    const user = await this.findById(userId);
    const lifecycle = resolveEffectiveSubscriptionPlan(user);
    const isTryingToEnablePremiumFeature =
      payload.enabled === true ||
      (payload.enabled !== false &&
        (payload.days !== undefined ||
          payload.startHour !== undefined ||
          payload.endHour !== undefined ||
          payload.radiusKm !== undefined ||
          payload.timezone !== undefined));

    if (isTryingToEnablePremiumFeature && lifecycle.effectivePlan === SubscriptionPlan.LITE) {
      assertSubscriptionFeatureAccess(user, 'fun_oclock_notifications');
    }

    if (
      payload.startHour !== undefined &&
      payload.endHour !== undefined &&
      payload.startHour === payload.endHour
    ) {
      throw new BadRequestException('Start and end hour cannot be the same.');
    }

    const days = payload.days?.map((item) => item.toUpperCase()) ?? user.funOclockDays;

    if (days.length === 0) {
      throw new BadRequestException('At least one day is required.');
    }

    user.funOclockEnabled = payload.enabled ?? user.funOclockEnabled;
    user.funOclockDays = days;
    user.funOclockStartHour = payload.startHour ?? user.funOclockStartHour ?? 20;
    user.funOclockEndHour = payload.endHour ?? user.funOclockEndHour ?? 24;
    user.funOclockRadiusKm = payload.radiusKm ?? user.funOclockRadiusKm ?? 5;
    user.funOclockTimezone =
      normalizeText(payload.timezone) ?? user.funOclockTimezone ?? 'Africa/Blantyre';

    const saved = await this.usersRepository.save(user);

    return {
      message: 'Fun o\'clock preferences updated.',
      preferences: {
        enabled: saved.funOclockEnabled,
        days: saved.funOclockDays,
        startHour: saved.funOclockStartHour,
        endHour: saved.funOclockEndHour,
        radiusKm: saved.funOclockRadiusKm,
        timezone: saved.funOclockTimezone,
      },
    };
  }

  async getSavedItems(userId: string) {
    const likes = await this.likesRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 80,
    });

    const eventIds = likes
      .filter((item) => item.targetType === ContentTarget.EVENT)
      .map((item) => item.targetId);
    const postIds = likes
      .filter((item) => item.targetType === ContentTarget.POST)
      .map((item) => item.targetId);
    const reelIds = likes
      .filter((item) => item.targetType === ContentTarget.REEL)
      .map((item) => item.targetId);

    const [events, posts, reels] = await Promise.all([
      eventIds.length
        ? this.eventsRepository.find({
            where: eventIds.map((id) => ({ id })),
          })
        : Promise.resolve([] as Event[]),
      postIds.length
        ? this.postsRepository.find({
            where: postIds.map((id) => ({ id })),
          })
        : Promise.resolve([] as Post[]),
      reelIds.length
        ? this.reelsRepository.find({
            where: reelIds.map((id) => ({ id })),
          })
        : Promise.resolve([] as Reel[]),
    ]);

    const eventsMap = new Map(events.map((item) => [item.id, item]));
    const postsMap = new Map(posts.map((item) => [item.id, item]));
    const reelsMap = new Map(reels.map((item) => [item.id, item]));

    const items = likes
      .map((like) => {
        if (like.targetType === ContentTarget.EVENT) {
          const event = eventsMap.get(like.targetId);
          if (!event) {
            return null;
          }

          return {
            id: `EVENT:${event.id}`,
            targetType: ContentTarget.EVENT,
            targetId: event.id,
            title: event.title,
            subtitle: event.venueName,
            savedAt: like.createdAt,
          };
        }

        if (like.targetType === ContentTarget.POST) {
          const post = postsMap.get(like.targetId);
          if (!post) {
            return null;
          }

          return {
            id: `POST:${post.id}`,
            targetType: ContentTarget.POST,
            targetId: post.id,
            title: 'Post',
            subtitle: post.caption ?? 'Saved post',
            savedAt: like.createdAt,
          };
        }

        const reel = reelsMap.get(like.targetId);
        if (!reel) {
          return null;
        }

        return {
          id: `REEL:${reel.id}`,
          targetType: ContentTarget.REEL,
          targetId: reel.id,
          title: 'Reel',
          subtitle: reel.caption ?? 'Saved reel',
          savedAt: like.createdAt,
        };
      })
      .filter((item) => item !== null);

    return {
      items,
      total: items.length,
    };
  }

  async getBookings(userId: string) {
    const rsvps = await this.rsvpRepository.find({
      where: { userId },
      relations: { event: true },
      order: { createdAt: 'DESC' },
      take: 80,
    });

    const items = rsvps
      .filter((item) => item.event)
      .map((item) => ({
        id: item.id,
        status: item.status,
        paymentRequired: item.paymentRequired,
        paidAt: item.paidAt,
        bookedAt: item.createdAt,
        event: {
          id: item.event.id,
          title: item.event.title,
          startDate: item.event.startDate,
          endDate: item.event.endDate,
          venueName: item.event.venueName,
          ticketPrice: item.event.ticketPrice,
        },
      }));

    return {
      items,
      total: items.length,
    };
  }

  async getHistory(userId: string) {
    const [rsvps, payments] = await Promise.all([
      this.rsvpRepository.find({
        where: { userId },
        relations: { event: true },
        order: { createdAt: 'DESC' },
        take: 100,
      }),
      this.paymentsRepository.find({
        where: { userId },
        relations: { event: true },
        order: { createdAt: 'DESC' },
        take: 100,
      }),
    ]);

    const now = Date.now();

    const bookingHistory = rsvps
      .filter(
        (item) => item.event && item.event.endDate.getTime() <= now,
      )
      .map((item) => ({
        id: item.id,
        status: item.status,
        eventTitle: item.event.title,
        eventDate: item.event.startDate,
        venueName: item.event.venueName,
      }));

    const transactionHistory = payments
      .filter((item) => item.status === PaymentStatus.SUCCESS)
      .map((item) => ({
        id: item.id,
        amount: item.amount,
        currency: item.currency,
        status: item.status,
        provider: item.provider,
        providerReference: item.providerReference,
        eventTitle: item.event?.title,
        sourceType: normalizeText(item.metadata?.type as string | null | undefined) ?? (item.eventId ? 'event' : 'subscription'),
        label:
          (() => {
            const sourceType = normalizeText(item.metadata?.type as string | null | undefined);

            if (sourceType === 'subscription') {
              return `${normalizeText(item.metadata?.audience as string | null | undefined) ?? 'Subscription'} ${normalizeText(item.metadata?.plan as string | null | undefined) ?? 'plan'}`;
            }

            if (sourceType === 'promotion') {
              return 'Promotion purchase';
            }

            return item.event?.title ?? 'Transaction';
          })(),
        createdAt: item.createdAt,
      }));

    return {
      bookings: bookingHistory,
      transactions: transactionHistory,
      totals: {
        bookings: bookingHistory.length,
        transactions: transactionHistory.length,
      },
    };
  }

  async getWalletSummary(userId: string) {
    const user = await this.findById(userId);
    const isBusiness =
      user.roles?.includes(Role.BUSINESS) ||
      user.roles?.includes(Role.CAPITAL_USER) ||
      user.roles?.includes(Role.ADMIN);
    const isAdmin = user.roles?.includes(Role.ADMIN) ?? false;

    const spendAgg = await this.paymentsRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('payment.userId = :userId', { userId })
      .andWhere('payment.status = :status', { status: PaymentStatus.SUCCESS })
      .getRawOne<{ total: string; count: string }>();

    const earningsAgg = isAdmin
      ? await this.paymentsRepository
          .createQueryBuilder('payment')
          .select('COALESCE(SUM(payment.amount), 0)', 'total')
          .addSelect('COUNT(*)', 'count')
          .where('payment.status = :status', { status: PaymentStatus.SUCCESS })
          .andWhere(
            "COALESCE(payment.metadata->>'type', '') IN (:...types)",
            {
              types: ['promotion', 'subscription'],
            },
          )
          .getRawOne<{ total: string; count: string }>()
      : await this.paymentsRepository
          .createQueryBuilder('payment')
          .innerJoin(Event, 'event', 'event.id = payment.eventId')
          .select('COALESCE(SUM(payment.amount), 0)', 'total')
          .addSelect('COUNT(*)', 'count')
          .where('event.organizerId = :userId', { userId })
          .andWhere('payment.status = :status', { status: PaymentStatus.SUCCESS })
          .getRawOne<{ total: string; count: string }>();

    const recentPayments = await this.paymentsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 20,
      relations: { event: true },
    });

    return {
      mode: isBusiness ? 'BUSINESS' : 'USER',
      currency: 'MWK',
      spend: {
        total: Number(spendAgg?.total ?? 0),
        transactions: Number(spendAgg?.count ?? 0),
      },
      earnings: {
        total: Number(earningsAgg?.total ?? 0),
        transactions: Number(earningsAgg?.count ?? 0),
      },
      recentTransactions: recentPayments.map((item) => ({
        id: item.id,
        amount: item.amount,
        currency: item.currency,
        status: item.status,
        eventTitle: item.event?.title,
        sourceType: normalizeText(item.metadata?.type as string | null | undefined) ?? (item.eventId ? 'event' : 'subscription'),
        label:
          (() => {
            const sourceType = normalizeText(item.metadata?.type as string | null | undefined);

            if (sourceType === 'subscription') {
              return `${normalizeText(item.metadata?.audience as string | null | undefined) ?? 'Subscription'} ${normalizeText(item.metadata?.plan as string | null | undefined) ?? 'plan'}`;
            }

            if (sourceType === 'promotion') {
              return 'Promotion purchase';
            }

            return item.event?.title ?? 'Transaction';
          })(),
        createdAt: item.createdAt,
      })),
      bookingSummary: {
        confirmedRsvps: await this.rsvpRepository.count({
          where: { userId, status: RsvpStatus.CONFIRMED },
        }),
        pendingRsvps: await this.rsvpRepository.count({
          where: { userId, status: RsvpStatus.PENDING },
        }),
      },
    };
  }

  private sanitizeUser(user: User) {
    const { passwordHash, ...safeUser } = user;
    return {
      ...safeUser,
      verifiedBadge: this.resolveVerifiedBadge(user),
      subscriptionAccess: buildSubscriptionAccessPayload(user),
    };
  }

  private buildProfilePreview(
    user: Pick<
      User,
      | 'id'
      | 'username'
      | 'displayName'
      | 'avatarUrl'
      | 'businessName'
      | 'businessCategory'
      | 'businessDescription'
      | 'bio'
      | 'roles'
      | 'isVerified'
      | 'businessVerificationStatus'
      | 'nationalIdStatus'
      | 'township'
      | 'district'
      | 'region'
      | 'country'
    >,
  ) {
    return {
      id: user.id,
      displayName:
        user.businessName?.trim() ||
        user.displayName?.trim() ||
        user.username?.trim() ||
        'FunMap User',
      username: user.username ?? null,
      avatarUrl: user.avatarUrl ?? null,
      about: user.businessDescription?.trim() || user.bio?.trim() || null,
      bio: user.bio ?? null,
      businessDescription: user.businessDescription ?? null,
      businessCategory: user.businessCategory ?? null,
      roles: user.roles ?? [],
      isVerified: user.isVerified,
      verifiedBadge: this.resolveVerifiedBadge(user),
      township: user.township ?? null,
      district: user.district ?? null,
      region: user.region ?? null,
      country: user.country ?? null,
    };
  }

  private resolveVerifiedBadge(
    user: Pick<
      User,
      | 'roles'
      | 'businessVerificationStatus'
      | 'nationalIdStatus'
    >,
  ) {
    const roles = user.roles ?? [];
    const isCapitalUser =
      roles.includes(Role.BUSINESS) || roles.includes(Role.CAPITAL_USER);

    if (isCapitalUser) {
      return user.businessVerificationStatus === BusinessVerificationStatus.VERIFIED;
    }

    return user.nationalIdStatus === NationalIdStatus.VERIFIED;
  }

  private buildDeletedPhonePlaceholder(userId: string) {
    const epoch = Date.now().toString(36);
    const suffix = userId.replace(/-/g, '').slice(0, 10);
    const random = Math.floor(Math.random() * 1296)
      .toString(36)
      .padStart(2, '0');

    return `del${epoch}${suffix}${random}`;
  }
}

function normalizeText(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeHandle(value?: string | null) {
  const normalized = normalizeText(value);
  return normalized == null ? normalized : normalized.toLowerCase();
}

function normalizeEmail(value?: string | null) {
  const normalized = normalizeText(value);
  return normalized == null ? normalized : normalized.toLowerCase();
}

function normalizeNationalId(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  return normalized.length > 0 ? normalized : null;
}

function normalizePhone(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = value.trim().replace(/[\s\-()]+/g, '');
  return normalized.length > 0 ? normalized : null;
}
