import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Point } from 'geojson';
import { Not, Repository } from 'typeorm';
import { Like } from '../../shared/database/entities/like.entity';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { BusinessVerificationStatus } from '../../shared/enums/business-verification-status.enum';
import { ContentTarget } from '../../shared/enums/content-target.enum';
import { PaymentStatus } from '../../shared/enums/payment-status.enum';
import { Role } from '../../shared/enums/role.enum';
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { SubscriptionPlan } from '../../shared/enums/subscription-plan.enum';
import { Event } from '../events/entities/event.entity';
import { Rsvp } from '../events/entities/rsvp.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './entities/user.entity';

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

  async updateProfile(userId: string, payload: UpdateProfileDto) {
    const user = await this.findById(userId);
    const nextUsername = normalizeHandle(payload.username);
    const nextEmail = normalizeEmail(payload.email);
    const nextDisplayName = normalizeText(payload.displayName);
    const nextBusinessName = normalizeText(payload.businessName);
    const nextBusinessDescription = normalizeText(payload.businessDescription);
    const nextAvatarUrl = normalizeText(payload.avatarUrl);
    const nextBusinessCoverUrl = normalizeText(payload.businessCoverUrl);
    const nextVerificationDocumentUrl = normalizeText(
      payload.verificationDocumentUrl,
    );
    const nextBio = normalizeText(payload.bio);
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
      subscriptionPlan: payload.subscriptionPlan ?? user.subscriptionPlan,
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

    const spendAgg = await this.paymentsRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('payment.userId = :userId', { userId })
      .andWhere('payment.status = :status', { status: PaymentStatus.SUCCESS })
      .getRawOne<{ total: string; count: string }>();

    const earningsAgg = await this.paymentsRepository
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
    return safeUser;
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
