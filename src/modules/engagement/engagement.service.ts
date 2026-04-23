import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from '../../shared/database/entities/comment.entity';
import { Like } from '../../shared/database/entities/like.entity';
import { Share } from '../../shared/database/entities/share.entity';
import { View } from '../../shared/database/entities/view.entity';
import { PaginationQueryDto } from '../../shared/dto/pagination-query.dto';
import { ContentTarget } from '../../shared/enums/content-target.enum';
import { NotificationType } from '../../shared/enums/notification-type.enum';
import { Role } from '../../shared/enums/role.enum';
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { Event } from '../events/entities/event.entity';
import { Rsvp } from '../events/entities/rsvp.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from '../users/entities/user.entity';
import { AddCommentDto } from './dto/add-comment.dto';
import { ReportViewDto } from './dto/report-view.dto';
import { ShareTargetDto } from './dto/share-target.dto';

type TargetMeta = {
  ownerUserId: string;
  counterEntity: ContentTarget.POST | ContentTarget.REEL | null;
};

@Injectable()
export class EngagementService {
  constructor(
    @InjectRepository(Like)
    private readonly likesRepository: Repository<Like>,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Share)
    private readonly sharesRepository: Repository<Share>,
    @InjectRepository(View)
    private readonly viewsRepository: Repository<View>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(Reel)
    private readonly reelsRepository: Repository<Reel>,
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Rsvp)
    private readonly rsvpRepository: Repository<Rsvp>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async like(user: JwtUser, targetType: ContentTarget, targetId: string) {
    const targetMeta = await this.resolveTargetMeta(targetType, targetId);

    const existingLike = await this.likesRepository.findOne({
      where: {
        userId: user.sub,
        targetType,
        targetId,
      },
    });

    if (!existingLike) {
      const like = this.likesRepository.create({
        userId: user.sub,
        targetType,
        targetId,
      });
      await this.likesRepository.save(like);
      await this.incrementCounter(targetMeta.counterEntity, targetId, 'like_count');

      await this.notifyTargetOwner(
        user.sub,
        targetMeta.ownerUserId,
        `${targetType.toLowerCase()}_liked`,
        {
          targetType,
          targetId,
        },
      );
    }

    return {
      liked: true,
      alreadyLiked: Boolean(existingLike),
    };
  }

  async unlike(user: JwtUser, targetType: ContentTarget, targetId: string) {
    await this.resolveTargetMeta(targetType, targetId);

    const existingLike = await this.likesRepository.findOne({
      where: {
        userId: user.sub,
        targetType,
        targetId,
      },
    });

    if (!existingLike) {
      return {
        liked: false,
        alreadyRemoved: true,
      };
    }

    await this.likesRepository.remove(existingLike);

    if (targetType === ContentTarget.POST) {
      await this.postsRepository.query(
        `UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`,
        [targetId],
      );
    }

    if (targetType === ContentTarget.REEL) {
      await this.reelsRepository.query(
        `UPDATE reels SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`,
        [targetId],
      );
    }

    return {
      liked: false,
      alreadyRemoved: false,
    };
  }

  async addComment(
    user: JwtUser,
    targetType: ContentTarget,
    targetId: string,
    payload: AddCommentDto,
  ) {
    const targetMeta = await this.resolveTargetMeta(targetType, targetId);

    await this.assertCommentUnlocked(
      user.sub,
      targetType,
      targetId,
      targetMeta.ownerUserId,
    );

    const comment = this.commentsRepository.create({
      userId: user.sub,
      targetType,
      targetId,
      body: payload.body.trim(),
    });

    const saved = await this.commentsRepository.save(comment);
    await this.incrementCounter(targetMeta.counterEntity, targetId, 'comment_count');

    await this.notifyTargetOwner(
      user.sub,
      targetMeta.ownerUserId,
      `${targetType.toLowerCase()}_commented`,
      {
        targetType,
        targetId,
        commentId: saved.id,
        commentBody: saved.body,
      },
    );

    const rows = (await this.commentsRepository.query(
      `
        SELECT
          c.id,
          c.user_id AS "userId",
          c.target_type AS "targetType",
          c.target_id AS "targetId",
          c.body,
          c.created_at AS "createdAt",
          c.updated_at AS "updatedAt",
          COALESCE(NULLIF(u.display_name, ''), NULLIF(u.business_name, ''), 'FunMap user') AS "authorName",
          u.username AS "userName",
          u.avatar_url AS "authorAvatarUrl"
        FROM comments c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.id = $1
        LIMIT 1
      `,
      [saved.id],
    )) as Array<Record<string, unknown>>;

    return rows[0] ?? saved;
  }

  async listComments(
    targetType: ContentTarget,
    targetId: string,
    query: PaginationQueryDto,
  ) {
    await this.resolveTargetMeta(targetType, targetId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const offset = (page - 1) * limit;

    const items = (await this.commentsRepository.query(
      `
        SELECT
          c.id,
          c.user_id AS "userId",
          c.target_type AS "targetType",
          c.target_id AS "targetId",
          c.body,
          c.created_at AS "createdAt",
          c.updated_at AS "updatedAt",
          COALESCE(NULLIF(u.display_name, ''), NULLIF(u.business_name, ''), 'FunMap user') AS "authorName",
          u.username AS "userName",
          u.avatar_url AS "authorAvatarUrl"
        FROM comments c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.target_type::text = $1
          AND c.target_id = $2
        ORDER BY c.created_at DESC
        LIMIT $3 OFFSET $4
      `,
      [targetType, targetId, limit, offset],
    )) as Array<Record<string, unknown>>;

    const totalResult = (await this.commentsRepository.query(
      `
        SELECT COUNT(*)::int AS total
        FROM comments c
        WHERE c.target_type::text = $1
          AND c.target_id = $2
      `,
      [targetType, targetId],
    )) as Array<{ total?: number }>;

    const total = Number(totalResult[0]?.total ?? 0);

    return {
      items,
      page,
      limit,
      total,
    };
  }

  async share(
    user: JwtUser,
    targetType: ContentTarget,
    targetId: string,
    payload: ShareTargetDto,
  ) {
    const targetMeta = await this.resolveTargetMeta(targetType, targetId);

    const share = this.sharesRepository.create({
      userId: user.sub,
      targetType,
      targetId,
      destination: payload.destination?.trim(),
    });

    const saved = await this.sharesRepository.save(share);
    await this.incrementCounter(targetMeta.counterEntity, targetId, 'share_count');

    await this.notifyTargetOwner(
      user.sub,
      targetMeta.ownerUserId,
      `${targetType.toLowerCase()}_shared`,
      {
        targetType,
        targetId,
        shareId: saved.id,
      },
    );

    return saved;
  }

  async reportView(
    user: JwtUser,
    targetType: ContentTarget,
    targetId: string,
    payload: ReportViewDto,
  ) {
    await this.resolveTargetMeta(targetType, targetId);

    const view = this.viewsRepository.create({
      userId: user.sub,
      targetType,
      targetId,
      watchTimeSeconds: payload.watchTimeSeconds,
      completed: payload.completed,
    });
    await this.viewsRepository.save(view);

    if (targetType === ContentTarget.POST) {
      await this.postsRepository.increment({ id: targetId }, 'impressionCount', 1);
    }

    if (targetType === ContentTarget.EVENT) {
      await this.eventsRepository.increment({ id: targetId }, 'viewCount', 1);
    }

    if (targetType === ContentTarget.REEL) {
      await this.reelsRepository.increment({ id: targetId }, 'viewCount', 1);

      if (payload.completed) {
        await this.reelsRepository.increment({ id: targetId }, 'replayCount', 1);
      }

      const stats = await this.viewsRepository
        .createQueryBuilder('view')
        .select('COUNT(*)', 'total')
        .addSelect('COALESCE(AVG(view.watchTimeSeconds), 0)', 'avgWatch')
        .addSelect(
          'COALESCE(SUM(CASE WHEN view.completed = true THEN 1 ELSE 0 END), 0)',
          'completedCount',
        )
        .where('view.targetType = :targetType', { targetType: ContentTarget.REEL })
        .andWhere('view.targetId = :targetId', { targetId })
        .getRawOne<{ total: string; avgWatch: string; completedCount: string }>();

      const total = Number(stats?.total ?? 0);
      const completedCount = Number(stats?.completedCount ?? 0);
      const avgWatch = Number(stats?.avgWatch ?? 0);

      await this.reelsRepository.update(
        { id: targetId },
        {
          averageWatchTimeSeconds: avgWatch,
          completionRate: total > 0 ? completedCount / total : 0,
        },
      );
    }

    return {
      tracked: true,
    };
  }

  private async resolveTargetMeta(
    targetType: ContentTarget,
    targetId: string,
  ): Promise<TargetMeta> {
    if (targetType === ContentTarget.POST) {
      const post = await this.postsRepository.findOne({
        where: { id: targetId },
        select: { id: true, authorId: true },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      return {
        ownerUserId: post.authorId,
        counterEntity: ContentTarget.POST,
      };
    }

    if (targetType === ContentTarget.REEL) {
      const reel = await this.reelsRepository.findOne({
        where: { id: targetId },
        select: { id: true, authorId: true },
      });

      if (!reel) {
        throw new NotFoundException('Reel not found');
      }

      return {
        ownerUserId: reel.authorId,
        counterEntity: ContentTarget.REEL,
      };
    }

    const event = await this.eventsRepository.findOne({
      where: { id: targetId },
      select: { id: true, organizerId: true },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return {
      ownerUserId: event.organizerId,
      counterEntity: null,
    };
  }

  private async incrementCounter(
    counterEntity: ContentTarget.POST | ContentTarget.REEL | null,
    targetId: string,
    counterColumn: 'like_count' | 'comment_count' | 'share_count',
  ) {
    if (counterEntity === ContentTarget.POST) {
      await this.postsRepository.increment({ id: targetId }, this.mapCounterColumn(counterColumn), 1);
    }

    if (counterEntity === ContentTarget.REEL) {
      await this.reelsRepository.increment({ id: targetId }, this.mapCounterColumn(counterColumn), 1);
    }
  }

  private mapCounterColumn(counterColumn: 'like_count' | 'comment_count' | 'share_count') {
    if (counterColumn === 'like_count') {
      return 'likeCount' as const;
    }

    if (counterColumn === 'comment_count') {
      return 'commentCount' as const;
    }

    return 'shareCount' as const;
  }

  private async notifyTargetOwner(
    actorUserId: string,
    ownerUserId: string,
    action: string,
    payload: Record<string, unknown>,
  ) {
    if (actorUserId === ownerUserId) {
      return;
    }

    const actor = await this.usersRepository.findOne({
      where: { id: actorUserId },
      select: {
        id: true,
        displayName: true,
        username: true,
      },
    });
    const actorName = actor?.displayName ?? actor?.username ?? 'Someone';
    const targetType = payload['targetType']?.toString().toUpperCase() ?? 'CONTENT';
    const targetId = payload['targetId']?.toString() ?? '';
    const details = await this.buildTargetNotificationDetails(targetType, targetId);

    const content = this.buildEngagementNotificationContent(
      actorName,
      action,
      details,
      payload['commentBody']?.toString(),
    );

    await this.notificationsService.createNotification(
      ownerUserId,
      NotificationType.SOCIAL,
      content.title,
      content.body,
      {
        action,
        actorUserId,
        ...payload,
      },
    );
  }

  private buildEngagementNotificationContent(
    actorName: string,
    action: string,
    details: { noun: string; label: string },
    commentBody?: string | null,
  ) {
    const compactComment = this.compact(commentBody, 80);

    switch (action) {
      case 'event_liked':
      case 'post_liked':
      case 'reel_liked':
        return {
          title: 'New like',
          body: `${actorName} liked your ${details.noun}: ${details.label}`,
        };
      case 'event_commented':
      case 'post_commented':
      case 'reel_commented':
        return {
          title: 'New comment',
          body:
            compactComment == null
              ? `${actorName} commented on your ${details.noun}: ${details.label}`
              : `${actorName} commented on your ${details.noun}: "${compactComment}"`,
        };
      case 'event_shared':
      case 'post_shared':
      case 'reel_shared':
        return {
          title: 'Content shared',
          body: `${actorName} shared your ${details.noun}: ${details.label}`,
        };
      default:
        return {
          title: 'New engagement',
          body: `${actorName} interacted with your ${details.noun}: ${details.label}`,
        };
    }
  }

  private async buildTargetNotificationDetails(targetType: string, targetId: string) {
    if (targetType == ContentTarget.EVENT && targetId.length > 0) {
      const event = await this.eventsRepository.findOne({
        where: { id: targetId },
        select: { id: true, title: true },
      });
      return {
        noun: 'event',
        label: event?.title ?? 'your event',
      };
    }

    if (targetType == ContentTarget.POST && targetId.length > 0) {
      const post = await this.postsRepository.findOne({
        where: { id: targetId },
        select: { id: true, caption: true },
      });
      return {
        noun: 'post',
        label: this.compact(post?.caption, 60) ?? 'your post',
      };
    }

    if (targetType == ContentTarget.REEL && targetId.length > 0) {
      const reel = await this.reelsRepository.findOne({
        where: { id: targetId },
        select: { id: true, caption: true },
      });
      return {
        noun: 'reel',
        label: this.compact(reel?.caption, 60) ?? 'your reel',
      };
    }

    return {
      noun: 'content',
      label: 'your content',
    };
  }

  private compact(value?: string | null, maxLength = 60) {
    const normalized = value?.trim();
    if (normalized == null || normalized.length == 0) {
      return null;
    }

    return normalized.length <= maxLength
      ? normalized
      : `${normalized.slice(0, maxLength - 1)}…`;
  }

  private async assertCommentUnlocked(
    actorUserId: string,
    targetType: ContentTarget,
    targetId: string,
    targetOwnerUserId: string,
  ) {
    if (actorUserId === targetOwnerUserId) {
      return;
    }

    if (targetType === ContentTarget.EVENT) {
      const rsvp = await this.rsvpRepository.findOne({
        where: {
          eventId: targetId,
          userId: actorUserId,
        },
      });

      const isUnlocked =
        rsvp?.status === RsvpStatus.CONFIRMED || Boolean(rsvp?.paidAt);

      if (!isUnlocked) {
        throw new ForbiddenException(
          'Comments unlock after RSVP or payment confirmation.',
        );
      }

      return;
    }

    if (targetType !== ContentTarget.POST && targetType !== ContentTarget.REEL) {
      return;
    }

    const owner = await this.usersRepository.findOne({
      where: { id: targetOwnerUserId },
      select: {
        id: true,
        roles: true,
      },
    });

    const isCapitalContent =
      owner?.roles?.includes(Role.CAPITAL_USER) ||
      owner?.roles?.includes(Role.BUSINESS);

    if (!isCapitalContent) {
      return;
    }

    const unlockedCount = await this.rsvpRepository
      .createQueryBuilder('r')
      .innerJoin(
        Event,
        'e',
        'e.id = r.event_id AND e.organizer_id = :ownerId',
        { ownerId: targetOwnerUserId },
      )
      .where('r.user_id = :actorUserId', { actorUserId })
      .andWhere('(r.status = :confirmedStatus OR r.paid_at IS NOT NULL)', {
        confirmedStatus: RsvpStatus.CONFIRMED,
      })
      .getCount();

    if (unlockedCount < 1) {
      throw new ForbiddenException(
        'Comments on capital user content unlock after confirmed RSVP or payment for their event.',
      );
    }
  }
}
