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
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { Event } from '../events/entities/event.entity';
import { Rsvp } from '../events/entities/rsvp.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
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
        'Your content received a new like.',
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

    if (targetType === ContentTarget.EVENT) {
      const rsvp = await this.rsvpRepository.findOne({
        where: {
          eventId: targetId,
          userId: user.sub,
        },
      });

      const isUnlocked =
        rsvp?.status === RsvpStatus.CONFIRMED || Boolean(rsvp?.paidAt);

      if (!isUnlocked) {
        throw new ForbiddenException(
          'Comments unlock after RSVP or payment confirmation.',
        );
      }
    }

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
      'Your content received a new comment.',
      {
        targetType,
        targetId,
        commentId: saved.id,
      },
    );

    return saved;
  }

  async listComments(
    targetType: ContentTarget,
    targetId: string,
    query: PaginationQueryDto,
  ) {
    await this.resolveTargetMeta(targetType, targetId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await this.commentsRepository.findAndCount({
      where: {
        targetType,
        targetId,
      },
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

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
      'Your content was shared.',
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
    message: string,
    payload: Record<string, unknown>,
  ) {
    if (actorUserId === ownerUserId) {
      return;
    }

    await this.notificationsService.createNotification(
      ownerUserId,
      NotificationType.SOCIAL,
      'New engagement',
      message,
      {
        action,
        actorUserId,
        ...payload,
      },
    );
  }
}
