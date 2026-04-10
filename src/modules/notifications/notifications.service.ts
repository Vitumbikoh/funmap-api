import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../shared/dto/pagination-query.dto';
import { NotificationType } from '../../shared/enums/notification-type.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { FcmService } from '../../shared/services/fcm.service';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { NotificationDevice } from './entities/notification-device.entity';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(NotificationDevice)
    private readonly devicesRepository: Repository<NotificationDevice>,
    private readonly fcmService: FcmService,
  ) {}

  async listForUser(user: JwtUser, query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total, unreadCount] = await Promise.all([
      this.notificationsRepository.find({
        where: { recipientUserId: user.sub },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.notificationsRepository.count({
        where: { recipientUserId: user.sub },
      }),
      this.notificationsRepository.count({
        where: {
          recipientUserId: user.sub,
          isRead: false,
        },
      }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      unreadCount,
    };
  }

  async createNotification(
    recipientUserId: string,
    type: NotificationType,
    title: string,
    body: string,
    payload: Record<string, unknown> = {},
  ) {
    const notification = this.notificationsRepository.create({
      recipientUserId,
      type,
      title,
      body,
      payload,
    });

    const saved = await this.notificationsRepository.save(notification);

    const devices = await this.devicesRepository.find({
      where: {
        userId: recipientUserId,
        isActive: true,
      },
      select: {
        id: true,
        token: true,
      },
    });

    await this.fcmService.sendToTokens(
      devices.map((device) => device.token),
      title,
      body,
      {
        notificationId: saved.id,
        type,
        ...payload,
      },
    );

    return saved;
  }

  async markAsRead(user: JwtUser, payload: MarkNotificationsReadDto) {
    if (payload.ids && payload.ids.length > 0) {
      const result = await this.notificationsRepository.update(
        {
          recipientUserId: user.sub,
          id: In(payload.ids),
        },
        { isRead: true },
      );

      return {
        updated: result.affected ?? 0,
      };
    }

    const result = await this.notificationsRepository.update(
      {
        recipientUserId: user.sub,
        isRead: false,
      },
      { isRead: true },
    );

    return {
      updated: result.affected ?? 0,
    };
  }

  async registerDevice(user: JwtUser, payload: RegisterDeviceDto) {
    const normalizedToken = payload.token.trim();

    let device = await this.devicesRepository.findOne({
      where: {
        token: normalizedToken,
      },
    });

    if (!device) {
      device = this.devicesRepository.create({
        userId: user.sub,
        token: normalizedToken,
        platform: payload.platform,
        isActive: true,
        lastUsedAt: new Date(),
      });
    } else {
      device.userId = user.sub;
      device.platform = payload.platform;
      device.isActive = true;
      device.lastUsedAt = new Date();
    }

    const saved = await this.devicesRepository.save(device);

    return {
      id: saved.id,
      token: saved.token,
      platform: saved.platform,
      isActive: saved.isActive,
    };
  }

  async unregisterDevice(user: JwtUser, payload: UnregisterDeviceDto) {
    if (payload.token) {
      const result = await this.devicesRepository.update(
        {
          userId: user.sub,
          token: payload.token.trim(),
        },
        {
          isActive: false,
        },
      );

      return {
        updated: result.affected ?? 0,
      };
    }

    const result = await this.devicesRepository.update(
      {
        userId: user.sub,
        isActive: true,
      },
      {
        isActive: false,
      },
    );

    return {
      updated: result.affected ?? 0,
    };
  }
}

