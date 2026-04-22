import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { PaymentStatus } from '../../shared/enums/payment-status.enum';
import { Event } from '../events/entities/event.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from '../users/entities/user.entity';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { ListPromotionsQueryDto } from './dto/list-promotions-query.dto';
import { UpdatePromotionStatusDto } from './dto/update-promotion-status.dto';
import { Promotion } from './entities/promotion.entity';
import { PromotionStatus } from './enums/promotion-status.enum';
import { PromotionTargetType } from './enums/promotion-target-type.enum';
import {
  assertSubscriptionFeatureAccess,
  hasSubscriptionFeatureAccess,
  resolveEffectiveSubscriptionPlan,
} from '../../shared/services/subscription-access.service';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promotionsRepository: Repository<Promotion>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Reel)
    private readonly reelsRepository: Repository<Reel>,
  ) {}

  async create(user: JwtUser, payload: CreatePromotionDto) {
    const owner = await this.usersRepository.findOne({
      where: { id: user.sub },
      select: {
        id: true,
        roles: true,
        subscriptionPlan: true,
        subscriptionExpiresAt: true,
      },
    });

    if (!owner) {
      throw new NotFoundException('User not found');
    }

    assertSubscriptionFeatureAccess(owner, 'promotions');
    const effectivePlan = resolveEffectiveSubscriptionPlan(owner).effectivePlan;

    if (
      hasSubscriptionFeatureAccess(owner, 'promotions') &&
      !hasSubscriptionFeatureAccess(owner, 'advanced_analytics')
    ) {
      const cycleStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const promotionsThisCycle = await this.promotionsRepository.count({
        where: {
          ownerUserId: user.sub,
          createdAt: MoreThanOrEqual(cycleStart),
        },
      });

      if (promotionsThisCycle >= 1) {
        throw new ForbiddenException(
          'Your BRONZE plan includes 1 promotion per monthly cycle. Upgrade to SILVER for more.',
        );
      }
    }

    const externalPlatforms = (payload.externalPlatforms ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (externalPlatforms.length > 0 || payload.externalLandingUrl?.trim()) {
      if (!hasSubscriptionFeatureAccess(owner, 'external_promotion')) {
        throw new ForbiddenException(
          'Upgrade to SILVER or GOLD to unlock external promotion capabilities.',
        );
      }

      if (effectivePlan === 'SILVER' && externalPlatforms.length > 2) {
        throw new ForbiddenException(
          'SILVER supports up to 2 external promotion channels per promotion. Upgrade to GOLD for more.',
        );
      }
    }

    const startsAt = new Date(payload.startsAt);
    const endsAt = new Date(payload.endsAt);

    if (endsAt <= startsAt) {
      throw new BadRequestException('Promotion end date must be after start date');
    }

    await this.ensureOwnership(user.sub, payload.targetType, payload.targetId);

    const now = Date.now();
    const status = startsAt.getTime() <= now ? PromotionStatus.ACTIVE : PromotionStatus.SCHEDULED;

    const promotion = this.promotionsRepository.create({
      ownerUserId: user.sub,
      targetType: payload.targetType,
      targetId: payload.targetId,
      budgetAmount: payload.budgetAmount.toFixed(2),
      currency: payload.currency?.trim().toUpperCase() ?? 'MWK',
      boostMultiplier: this.resolveAllowedBoostMultiplier(
        effectivePlan,
        payload.boostMultiplier,
      ),
      startsAt,
      endsAt,
      impressionGoal: payload.impressionGoal,
      audienceDistrict: payload.audienceDistrict?.trim(),
      audienceRegion: payload.audienceRegion?.trim(),
      audienceCountry: payload.audienceCountry?.trim(),
      externalPlatforms,
      externalLandingUrl: payload.externalLandingUrl?.trim() || null,
      status,
    });

    const savedPromotion = await this.promotionsRepository.save(promotion);

    await this.paymentsRepository.save(
      this.paymentsRepository.create({
        userId: user.sub,
        eventId: null,
        amount: savedPromotion.budgetAmount,
        currency: savedPromotion.currency,
        provider: 'FUNMAP_PROMOTIONS',
        reference: `promotion_${savedPromotion.id}`,
        providerReference: `promotion_${savedPromotion.id}`,
        checkoutUrl: null,
        status: PaymentStatus.SUCCESS,
        metadata: {
          type: 'promotion',
          targetType: savedPromotion.targetType,
          targetId: savedPromotion.targetId,
          promotionId: savedPromotion.id,
        },
      }),
    );

    return savedPromotion;
  }

  async listMine(user: JwtUser, query: ListPromotionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.promotionsRepository
      .createQueryBuilder('promotion')
      .where('promotion.ownerUserId = :ownerUserId', { ownerUserId: user.sub })
      .orderBy('promotion.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('promotion.status = :status', { status: query.status });
    }

    if (query.targetType) {
      qb.andWhere('promotion.targetType = :targetType', {
        targetType: query.targetType,
      });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      page,
      limit,
      total,
    };
  }

  async updateStatus(user: JwtUser, promotionId: string, payload: UpdatePromotionStatusDto) {
    const promotion = await this.promotionsRepository.findOne({
      where: { id: promotionId },
    });

    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }

    if (promotion.ownerUserId !== user.sub) {
      throw new ForbiddenException('You do not own this promotion');
    }

    if (promotion.status === PromotionStatus.CANCELLED) {
      throw new BadRequestException('Cancelled promotions cannot be modified');
    }

    if (promotion.endsAt.getTime() <= Date.now()) {
      if (payload.status === PromotionStatus.ACTIVE) {
        throw new BadRequestException('Expired promotions cannot be activated');
      }

      promotion.status = PromotionStatus.ENDED;
      return this.promotionsRepository.save(promotion);
    }

    promotion.status = payload.status;
    return this.promotionsRepository.save(promotion);
  }

  async syncExpiredPromotions() {
    const expirableStatuses = [
      PromotionStatus.ACTIVE,
      PromotionStatus.SCHEDULED,
      PromotionStatus.PAUSED,
    ];

    const expired = await this.promotionsRepository.find({
      where: {
        status: In(expirableStatuses),
        endsAt: LessThanOrEqual(new Date()),
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!expired.length) {
      return {
        updated: 0,
      };
    }

    const updates = expired.map((promotion) =>
      this.promotionsRepository.create({
        id: promotion.id,
        status: PromotionStatus.ENDED,
      }),
    );

    await this.promotionsRepository.save(updates);

    return {
      updated: updates.length,
    };
  }

  private async ensureOwnership(ownerUserId: string, targetType: PromotionTargetType, targetId: string) {
    if (targetType === PromotionTargetType.POST) {
      const post = await this.postsRepository.findOne({ where: { id: targetId } });
      if (!post) {
        throw new NotFoundException('Post target not found');
      }
      if (post.authorId !== ownerUserId) {
        throw new ForbiddenException('You can only boost your own posts');
      }
      return;
    }

    if (targetType === PromotionTargetType.EVENT) {
      const event = await this.eventsRepository.findOne({ where: { id: targetId } });
      if (!event) {
        throw new NotFoundException('Event target not found');
      }
      if (event.organizerId !== ownerUserId) {
        throw new ForbiddenException('You can only feature your own events');
      }
      return;
    }

    const reel = await this.reelsRepository.findOne({ where: { id: targetId } });
    if (!reel) {
      throw new NotFoundException('Reel target not found');
    }
    if (reel.authorId !== ownerUserId) {
      throw new ForbiddenException('You can only sponsor your own reels');
    }
  }

  private resolveAllowedBoostMultiplier(
    plan: string,
    requested?: number,
  ) {
    const proposed = requested ?? 1.25;
    const cap =
      plan === 'GOLD' ? 5 : plan === 'SILVER' ? 3 : plan === 'BRONZE' ? 1.5 : 1;

    if (proposed > cap) {
      throw new ForbiddenException(
        `${plan} allows boost multipliers up to ${cap.toFixed(2)}.`,
      );
    }

    return proposed;
  }
}
