import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppConfigService } from '../../shared/config/app-config.service';
import { PaginationQueryDto } from '../../shared/dto/pagination-query.dto';
import { NotificationType } from '../../shared/enums/notification-type.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { FcmService } from '../../shared/services/fcm.service';
import { hasSubscriptionFeatureAccess } from '../../shared/services/subscription-access.service';
import { Event } from '../events/entities/event.entity';
import { ChatRoom } from '../chat/entities/chat-room.entity';
import { User } from '../users/entities/user.entity';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { NotificationDevice } from './entities/notification-device.entity';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private funOclockTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(NotificationDevice)
    private readonly devicesRepository: Repository<NotificationDevice>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(ChatRoom)
    private readonly chatRoomsRepository: Repository<ChatRoom>,
    private readonly fcmService: FcmService,
    private readonly configService: AppConfigService,
  ) {}

  onModuleInit() {
    const intervalMinutes = this.configService.funOclockDispatchIntervalMinutes;
    if (!intervalMinutes || intervalMinutes <= 0) {
      return;
    }

    this.funOclockTimer = setInterval(() => {
      this.dispatchFunOclockDigestForAllUsers().catch(() => {
        // Keep scheduler resilient to transient DB/network issues.
      });
    }, intervalMinutes * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.funOclockTimer) {
      clearInterval(this.funOclockTimer);
      this.funOclockTimer = undefined;
    }
  }

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

  async listActivitySummary(user: JwtUser, query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const [items, unreadCount] = await Promise.all([
      this.notificationsRepository.find({
        where: { recipientUserId: user.sub },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.notificationsRepository.count({
        where: {
          recipientUserId: user.sub,
          isRead: false,
        },
      }),
    ]);

    const actorIds = new Set<string>();
    const eventIds = new Set<string>();
    const roomIds = new Set<string>();
    for (const item of items) {
      const actorId = item.payload?.['actorUserId']?.toString();
      if (actorId) actorIds.add(actorId);
      const eventId = item.payload?.['eventId']?.toString();
      if (eventId) eventIds.add(eventId);
      const roomId = item.payload?.['roomId']?.toString();
      if (roomId) roomIds.add(roomId);
    }

    const actors = actorIds.size
      ? await this.usersRepository.find({
          where: { id: In(Array.from(actorIds)) },
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
          },
        })
      : [];
    const events = eventIds.size
      ? await this.eventsRepository.find({
          where: { id: In(Array.from(eventIds)) },
          select: {
            id: true,
            title: true,
          },
        })
      : [];
    const rooms = roomIds.size
      ? await this.chatRoomsRepository.find({
          where: { id: In(Array.from(roomIds)) },
          select: {
            id: true,
            title: true,
            eventId: true,
          },
        })
      : [];

    const actorMap = new Map(
      actors.map((a) => [
        a.id,
        {
          id: a.id,
          displayName: a.displayName ?? a.username ?? 'User',
          username: a.username,
          avatarUrl: a.avatarUrl,
        },
      ]),
    );
    const eventMap = new Map(events.map((event) => [event.id, event]));
    const roomMap = new Map(rooms.map((room) => [room.id, room]));

    const mapped = items.map((item) => {
      const payload = item.payload ?? {};
      const actorId = payload['actorUserId']?.toString();
      const actor = actorId ? actorMap.get(actorId) : null;
      const eventId = payload['eventId']?.toString() ?? null;
      const roomId = payload['roomId']?.toString() ?? null;
      const room = roomId ? roomMap.get(roomId) : null;
      const targetId = payload['targetId']?.toString() ?? null;
      const resolvedEventId =
        eventId ??
        ((payload['targetType']?.toString()?.toUpperCase() == 'EVENT')
            ? targetId
            : null);
      const event = resolvedEventId ? eventMap.get(resolvedEventId) : null;

      return {
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        createdAt: item.createdAt,
        isRead: item.isRead,
        actor,
        action: payload['action']?.toString(),
        targetType: payload['targetType']?.toString(),
        targetId,
        eventId: resolvedEventId,
        eventTitle: event?.title ?? payload['eventTitle']?.toString(),
        roomId,
        roomTitle: room?.title ?? payload['roomTitle']?.toString(),
      };
    });

    return {
      page,
      limit,
      unreadCount,
      social: mapped
        .filter((n) => n.type?.toString().toUpperCase() === 'SOCIAL'),
      bookings: mapped
        .filter((n) => n.type?.toString().toUpperCase() === 'EVENT'),
      payments: mapped
        .filter((n) => n.type?.toString().toUpperCase() === 'PAYMENT'),
      chats: mapped
        .filter((n) => n.type?.toString().toUpperCase() === 'CHAT'),
      system: mapped
        .filter((n) => n.type?.toString().toUpperCase() === 'SYSTEM'),
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

  async dispatchFunOclockDigestToUser(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      return {
        dispatched: false,
        reason: 'User not found',
      };
    }

    if (!user.funOclockEnabled) {
      return {
        dispatched: false,
        reason: 'Fun o\'clock is disabled for this user',
      };
    }

    if (!hasSubscriptionFeatureAccess(user, 'fun_oclock_notifications')) {
      return {
        dispatched: false,
        reason: 'Subscription tier does not allow Fun o\'clock notifications',
      };
    }

    if (!user.homeLocation?.coordinates || user.homeLocation.coordinates.length < 2) {
      return {
        dispatched: false,
        reason: 'Home location is required for Fun o\'clock notifications',
      };
    }

    if (!this.isWithinFunOclockWindow(user)) {
      return {
        dispatched: false,
        reason: 'Current time is outside the configured Fun o\'clock window',
      };
    }

    const [longitude, latitude] = user.homeLocation.coordinates;
    const radiusKm = user.funOclockRadiusKm ?? 5;

    const events = await this.eventsRepository.query(
      `
        SELECT
          e.id,
          e.title,
          e.start_date,
          e.venue_name,
          ST_Distance(
            e.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 AS distance_km
        FROM events e
        WHERE e.is_published = true
          AND e.end_date >= NOW()
          AND e.start_date <= NOW() + INTERVAL '6 hours'
          AND ST_DWithin(
            e.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3 * 1000
          )
        ORDER BY e.rsvp_count DESC, e.view_count DESC, e.start_date ASC
        LIMIT 3
      `,
      [longitude, latitude, radiusKm],
    );

    if (!events.length) {
      return {
        dispatched: false,
        reason: 'No events match current Fun o\'clock window',
      };
    }

    const count = events.length;
    const first = events[0] as Record<string, unknown>;
    const title = `${count} event${count > 1 ? 's' : ''} near you right now`;
    const body = `${first['title'] ?? 'Top pick'} is hot in your area. Tap to explore Fun o'clock.`;

    const notification = await this.createNotification(
      user.id,
      NotificationType.EVENT,
      title,
      body,
      {
        action: 'FUN_OCLOCK',
        eventId: first['id']?.toString() ?? '',
      },
    );

    return {
      dispatched: true,
      notificationId: notification.id,
      nearbyEvents: events,
    };
  }

  async dispatchFunOclockDigestForAllUsers() {
    const users = await this.usersRepository.find({
      where: {
        funOclockEnabled: true,
      },
      select: {
        id: true,
        homeLocation: true,
        funOclockEnabled: true,
        funOclockDays: true,
        funOclockStartHour: true,
        funOclockEndHour: true,
        funOclockRadiusKm: true,
      },
      take: 500,
    });

    let dispatched = 0;

    for (const user of users) {
      const result = await this.dispatchFunOclockDigestToUser(user.id);
      if (result.dispatched) {
        dispatched += 1;
      }
    }

    return {
      attempted: users.length,
      dispatched,
    };
  }

  private isWithinFunOclockWindow(user: User) {
    const now = new Date();
    const startHour = user.funOclockStartHour ?? 20;
    const endHour = user.funOclockEndHour ?? 23;
    const days = (user.funOclockDays ?? ['FRI', 'SAT']).map((item) =>
      item.toUpperCase(),
    );

    const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const dayCode = dayMap[now.getDay()];

    if (!days.includes(dayCode)) {
      return false;
    }

    const currentHour = now.getHours();
    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour <= endHour;
    }

    // Overnight window support, e.g. 22 -> 2.
    return currentHour >= startHour || currentHour <= endHour;
  }
}
