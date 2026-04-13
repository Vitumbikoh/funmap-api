import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { Event } from '../events/entities/event.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from '../users/entities/user.entity';
import { BulkResolveReportsDto } from './dto/bulk-resolve-reports.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { Report } from './entities/report.entity';
import { ReportStatus } from './enums/report-status.enum';
import { ReportTargetType } from './enums/report-target-type.enum';

@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(Report)
    private readonly reportsRepository: Repository<Report>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(Reel)
    private readonly reelsRepository: Repository<Reel>,
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async createReport(user: JwtUser, payload: CreateReportDto) {
    if (
      payload.targetType === ReportTargetType.USER &&
      payload.targetId === user.sub
    ) {
      throw new BadRequestException('You cannot report your own user account');
    }

    await this.ensureTargetExists(payload.targetType, payload.targetId);

    const existing = await this.reportsRepository.findOne({
      where: {
        reporterUserId: user.sub,
        targetType: payload.targetType,
        targetId: payload.targetId,
        status: ReportStatus.OPEN,
      },
    });

    if (existing) {
      return {
        id: existing.id,
        status: existing.status,
        duplicate: true,
      };
    }

    const report = this.reportsRepository.create({
      reporterUserId: user.sub,
      targetType: payload.targetType,
      targetId: payload.targetId,
      reason: payload.reason.trim(),
      description: payload.description?.trim(),
      status: ReportStatus.OPEN,
    });

    return this.reportsRepository.save(report);
  }

  async listOwnReports(user: JwtUser, query: ListReportsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await this.reportsRepository.findAndCount({
      where: {
        reporterUserId: user.sub,
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

  async listReports(query: ListReportsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.reportsRepository
      .createQueryBuilder('report')
      .orderBy('report.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('report.status = :status', { status: query.status });
    }

    if (query.targetType) {
      qb.andWhere('report.targetType = :targetType', {
        targetType: query.targetType,
      });
    }

    if (query.createdFrom) {
      qb.andWhere('report.createdAt >= :createdFrom', {
        createdFrom: new Date(query.createdFrom),
      });
    }

    if (query.createdTo) {
      qb.andWhere('report.createdAt <= :createdTo', {
        createdTo: new Date(query.createdTo),
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

  async resolveReport(adminUser: JwtUser, reportId: string, payload: ResolveReportDto) {
    const report = await this.reportsRepository.findOne({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.status !== ReportStatus.OPEN) {
      throw new BadRequestException('Only open reports can be resolved');
    }

    report.status = payload.status;
    report.resolvedAt = new Date();
    report.resolvedByUserId = adminUser.sub;
    report.resolutionNote = payload.resolutionNote?.trim() ?? null;

    return this.reportsRepository.save(report);
  }

  async getSummary() {
    const totals = await this.reportsRepository
      .createQueryBuilder('report')
      .select('COUNT(*)', 'total')
      .addSelect(
        "SUM(CASE WHEN report.status = 'OPEN' THEN 1 ELSE 0 END)",
        'open',
      )
      .addSelect(
        "SUM(CASE WHEN report.status = 'RESOLVED' THEN 1 ELSE 0 END)",
        'resolved',
      )
      .addSelect(
        "SUM(CASE WHEN report.status = 'DISMISSED' THEN 1 ELSE 0 END)",
        'dismissed',
      )
      .getRawOne<{
        total: string;
        open: string;
        resolved: string;
        dismissed: string;
      }>();

    const grouped = await this.reportsRepository
      .createQueryBuilder('report')
      .select('report.targetType', 'targetType')
      .addSelect('COUNT(*)', 'count')
      .where('report.status = :status', { status: ReportStatus.OPEN })
      .groupBy('report.targetType')
      .getRawMany<{ targetType: string; count: string }>();

    return {
      total: Number(totals?.total ?? 0),
      open: Number(totals?.open ?? 0),
      resolved: Number(totals?.resolved ?? 0),
      dismissed: Number(totals?.dismissed ?? 0),
      openByTargetType: grouped.reduce<Record<string, number>>((acc, item) => {
        acc[item.targetType] = Number(item.count ?? 0);
        return acc;
      }, {}),
    };
  }

  async resolveReportsBulk(adminUser: JwtUser, payload: BulkResolveReportsDto) {
    const uniqueIds = Array.from(new Set(payload.ids));
    if (!uniqueIds.length) {
      return { updated: 0, skipped: 0, skippedIds: [] as string[] };
    }

    const reports = await this.reportsRepository.find({
      where: {
        id: In(uniqueIds),
      },
      select: {
        id: true,
        status: true,
      },
    });

    const openReportIds = reports
      .filter((report) => report.status === ReportStatus.OPEN)
      .map((report) => report.id);

    const skippedIds = uniqueIds.filter((id) => !openReportIds.includes(id));

    if (!openReportIds.length) {
      return {
        updated: 0,
        skipped: skippedIds.length,
        skippedIds,
      };
    }

    const result = await this.reportsRepository.update(
      {
        id: In(openReportIds),
      },
      {
        status: payload.status,
        resolvedAt: new Date(),
        resolvedByUserId: adminUser.sub,
        resolutionNote: payload.resolutionNote?.trim() ?? null,
      },
    );

    return {
      updated: result.affected ?? 0,
      skipped: skippedIds.length,
      skippedIds,
    };
  }

  private async ensureTargetExists(targetType: ReportTargetType, targetId: string) {
    if (targetType === ReportTargetType.POST) {
      const exists = await this.postsRepository.exist({ where: { id: targetId } });
      if (!exists) {
        throw new NotFoundException('Post target not found');
      }
      return;
    }

    if (targetType === ReportTargetType.REEL) {
      const exists = await this.reelsRepository.exist({ where: { id: targetId } });
      if (!exists) {
        throw new NotFoundException('Reel target not found');
      }
      return;
    }

    if (targetType === ReportTargetType.EVENT) {
      const exists = await this.eventsRepository.exist({ where: { id: targetId } });
      if (!exists) {
        throw new NotFoundException('Event target not found');
      }
      return;
    }

    const userExists = await this.usersRepository.exist({ where: { id: targetId } });
    if (!userExists) {
      throw new NotFoundException('User target not found');
    }
  }
}
