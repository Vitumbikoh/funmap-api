import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ChatRoomType } from '../../shared/enums/chat-room-type.enum';
import { NotificationType } from '../../shared/enums/notification-type.enum';
import { Role } from '../../shared/enums/role.enum';
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { Rsvp } from '../events/entities/rsvp.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { CreatePrivateRoomDto } from './dto/create-private-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatRequest, ChatRequestStatus } from './entities/chat-request.entity';
import { ChatParticipant } from './entities/chat-participant.entity';
import { ChatRoom } from './entities/chat-room.entity';
import { Message } from './entities/message.entity';
import { ChatGateway } from './chat.gateway';
import { hasSubscriptionFeatureAccess } from '../../shared/services/subscription-access.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatRoom)
    private readonly roomsRepository: Repository<ChatRoom>,
    @InjectRepository(ChatParticipant)
    private readonly participantsRepository: Repository<ChatParticipant>,
    @InjectRepository(ChatRequest)
    private readonly requestsRepository: Repository<ChatRequest>,
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    @InjectRepository(Rsvp)
    private readonly rsvpRepository: Repository<Rsvp>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly chatGateway: ChatGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  async requestPrivateChat(user: JwtUser, otherUserId: string) {
    if (otherUserId === user.sub) {
      throw new BadRequestException('Cannot send a chat request to yourself');
    }

    const recipient = await this.usersRepository.findOne({
      where: { id: otherUserId },
      select: { id: true },
    });

    if (!recipient) {
      throw new NotFoundException('Recipient user not found');
    }

    await this.assertSharedUnlockedEvent(user.sub, otherUserId);

    const existingRoom = await this.findExistingPrivateRoom(user.sub, otherUserId);
    if (existingRoom) {
      return {
        status: 'accepted',
        requestId: null,
        roomId: existingRoom.id,
      };
    }

    const pending = await this.requestsRepository.findOne({
      where: [
        {
          requesterId: user.sub,
          recipientId: otherUserId,
          status: ChatRequestStatus.PENDING,
        },
        {
          requesterId: otherUserId,
          recipientId: user.sub,
          status: ChatRequestStatus.PENDING,
        },
      ],
    });

    if (pending) {
      throw new ConflictException('A pending chat request already exists');
    }

    const created = await this.requestsRepository.save(
      this.requestsRepository.create({
        requesterId: user.sub,
        recipientId: otherUserId,
        status: ChatRequestStatus.PENDING,
      }),
    );

    await this.notificationsService.createNotification(
      otherUserId,
      NotificationType.SOCIAL,
      'New chat request',
      'You received a new chat request.',
      {
        requestId: created.id,
        requesterId: user.sub,
      },
    );

    return {
      status: 'pending',
      requestId: created.id,
      roomId: null,
    };
  }

  async listIncomingRequests(user: JwtUser) {
    const requests = await this.requestsRepository.find({
      where: {
        recipientId: user.sub,
        status: ChatRequestStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    if (!requests.length) {
      return [];
    }

    const requesterIds = Array.from(new Set(requests.map((item) => item.requesterId)));
    const requesters = await this.usersRepository.find({
      where: requesterIds.map((id) => ({ id })),
    });
    const requesterMap = new Map(requesters.map((u) => [u.id, u]));

    return requests.map((item) => {
      const requester = requesterMap.get(item.requesterId);
      return {
        id: item.id,
        createdAt: item.createdAt,
        requesterId: item.requesterId,
        requesterName: requester?.displayName ?? requester?.username ?? 'FunMap user',
        requesterUsername: requester?.username ?? null,
        requesterAvatarUrl: requester?.avatarUrl ?? null,
      };
    });
  }

  async listOutgoingRequests(user: JwtUser) {
    const requests = await this.requestsRepository.find({
      where: {
        requesterId: user.sub,
        status: ChatRequestStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    if (!requests.length) {
      return [];
    }

    const recipientIds = Array.from(new Set(requests.map((item) => item.recipientId)));
    const recipients = await this.usersRepository.find({
      where: recipientIds.map((id) => ({ id })),
    });
    const recipientMap = new Map(recipients.map((u) => [u.id, u]));

    return requests.map((item) => {
      const recipient = recipientMap.get(item.recipientId);
      return {
        id: item.id,
        createdAt: item.createdAt,
        recipientId: item.recipientId,
        recipientName: recipient?.displayName ?? recipient?.username ?? 'FunMap user',
        recipientUsername: recipient?.username ?? null,
        recipientAvatarUrl: recipient?.avatarUrl ?? null,
      };
    });
  }

  async respondToChatRequest(
    user: JwtUser,
    requestId: string,
    action: 'accept' | 'decline',
  ) {
    const request = await this.requestsRepository.findOne({
      where: { id: requestId },
    });

    if (!request || request.recipientId !== user.sub) {
      throw new NotFoundException('Chat request not found');
    }

    if (request.status !== ChatRequestStatus.PENDING) {
      throw new ConflictException('Chat request has already been handled');
    }

    await this.assertSharedUnlockedEvent(user.sub, request.requesterId);

    request.respondedAt = new Date();

    if (action === 'decline') {
      request.status = ChatRequestStatus.DECLINED;
      await this.requestsRepository.save(request);

      return {
        status: 'declined',
        requestId: request.id,
        roomId: null,
      };
    }

    const room = await this.findOrCreatePrivateRoom(user.sub, request.requesterId);
    request.status = ChatRequestStatus.ACCEPTED;
    request.roomId = room.id;
    await this.requestsRepository.save(request);

    await this.notificationsService.createNotification(
      request.requesterId,
      NotificationType.CHAT,
      'Chat request accepted',
      'Your chat request was accepted.',
      {
        roomId: room.id,
        requestId: request.id,
      },
    );

    return {
      status: 'accepted',
      requestId: request.id,
      roomId: room.id,
    };
  }

  async createPrivateRoom(user: JwtUser, payload: CreatePrivateRoomDto) {
    await this.assertSharedUnlockedEvent(user.sub, payload.otherUserId);
    return this.findOrCreatePrivateRoom(user.sub, payload.otherUserId);
  }

  async joinEventRoom(user: JwtUser, eventId: string) {
    const rsvp = await this.rsvpRepository.findOne({
      where: {
        eventId,
        userId: user.sub,
      },
    });

    if (!rsvp || rsvp.status !== RsvpStatus.CONFIRMED) {
      throw new ForbiddenException('Event chat is locked until access is confirmed');
    }

    let room = await this.roomsRepository.findOne({
      where: {
        eventId,
        type: ChatRoomType.EVENT,
      },
    });

    if (!room) {
      room = await this.roomsRepository.save(
        this.roomsRepository.create({
          type: ChatRoomType.EVENT,
          eventId,
          title: 'Event Chat',
          createdByUserId: user.sub,
        }),
      );
    }

    const existingParticipant = await this.participantsRepository.findOne({
      where: {
        roomId: room.id,
        userId: user.sub,
      },
    });

    if (!existingParticipant) {
      await this.participantsRepository.save(
        this.participantsRepository.create({
          roomId: room.id,
          userId: user.sub,
        }),
      );
    }

    return room;
  }

  async listRooms(user: JwtUser) {
    return this.roomsRepository.query(
      `
        SELECT
          cr.id,
          cr.type,
          cr.event_id AS "eventId",
          cr.created_by_user_id AS "createdByUserId",
          cr.created_at AS "createdAt",
          cr.updated_at AS "updatedAt",
          cr.last_message_at AS "lastMessageAt",
          CASE
            WHEN cr.type = 'PRIVATE' THEN COALESCE(other_user.username, other_user.display_name, 'Private Chat')
            ELSE COALESCE(cr.title, 'Chat Room')
          END AS title,
          cp.last_read_at AS "lastReadAt",
          COALESCE(
            COUNT(m.id) FILTER (
              WHERE m.sender_id <> $1
                AND m.created_at > COALESCE(cp.last_read_at, TO_TIMESTAMP(0))
            ),
            0
          )::int AS "unreadCount"
        FROM chat_rooms cr
        INNER JOIN chat_participants cp ON cp.room_id = cr.id
        LEFT JOIN LATERAL (
          SELECT u.display_name, u.username
          FROM chat_participants cp_other
          INNER JOIN users u ON u.id = cp_other.user_id
          WHERE cp_other.room_id = cr.id
            AND cp_other.user_id <> $1
          LIMIT 1
        ) other_user ON TRUE
        LEFT JOIN messages m ON m.room_id = cr.id
        WHERE cp.user_id = $1
        GROUP BY
          cr.id,
          cr.type,
          cr.event_id,
          cr.created_by_user_id,
          cr.created_at,
          cr.updated_at,
          cr.last_message_at,
          cr.title,
          cp.last_read_at,
          other_user.display_name,
          other_user.username
        ORDER BY cr.last_message_at DESC NULLS LAST, cr.created_at DESC
      `,
      [user.sub],
    );
  }

  async listMessages(user: JwtUser, roomId: string) {
    await this.ensureParticipant(user.sub, roomId);
    await this.markRoomMessagesDelivered(user.sub, roomId);

    return this.messagesRepository.query(
      `
        SELECT
          m.id,
          m.room_id AS "roomId",
          m.sender_id AS "senderId",
          m.body,
          m.media_url AS "mediaUrl",
          m.metadata,
          m.created_at AS "createdAt",
          m.updated_at AS "updatedAt",
          COALESCE(u.username, u.display_name, 'FunMap user') AS "senderName",
          u.username AS "senderUsername",
          u.avatar_url AS "senderAvatarUrl"
        FROM messages m
        INNER JOIN users u ON u.id = m.sender_id
        WHERE m.room_id = $1
        ORDER BY m.created_at ASC
        LIMIT 100
      `,
      [roomId],
    );
  }

  async sendMessage(user: JwtUser, roomId: string, payload: SendMessageDto) {
    await this.ensureParticipant(user.sub, roomId);

    const room = await this.roomsRepository.findOne({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException('Chat room not found');
    }

    const message = this.messagesRepository.create({
      roomId,
      senderId: user.sub,
      body: payload.body,
      mediaUrl: payload.mediaUrl,
      metadata: {},
    });

    const savedMessage = await this.messagesRepository.save(message);

    const sender = await this.usersRepository.findOne({
      where: { id: user.sub },
      select: {
        id: true,
        displayName: true,
        username: true,
        avatarUrl: true,
      },
    });

    const enrichedMessage = {
      ...savedMessage,
      senderName: sender?.username ?? sender?.displayName ?? 'FunMap user',
      senderUsername: sender?.username ?? null,
      senderAvatarUrl: sender?.avatarUrl ?? null,
    };

    await this.roomsRepository.update(
      { id: roomId },
      { lastMessageAt: new Date() },
    );

    await this.participantsRepository.update(
      {
        roomId,
        userId: user.sub,
      },
      {
        lastReadAt: new Date(),
      },
    );

    const recipients = await this.participantsRepository.find({
      where: {
        roomId,
        userId: Not(user.sub),
      },
      select: {
        userId: true,
      },
    });

    await Promise.all(
      recipients.map((recipient) =>
        this.notificationsService.createNotification(
          recipient.userId,
          NotificationType.CHAT,
          room.type === ChatRoomType.EVENT ? 'New event message' : 'New message',
          payload.body?.slice(0, 160) ?? 'You received a media message.',
          {
            roomId,
            messageId: savedMessage.id,
            senderId: user.sub,
            eventId: room.eventId,
          },
        ),
      ),
    );

    this.chatGateway.emitMessage(
      roomId,
      enrichedMessage as unknown as Record<string, unknown>,
    );

    return enrichedMessage;
  }

  async markRoomAsRead(user: JwtUser, roomId: string) {
    const participant = await this.ensureParticipant(user.sub, roomId);

    const readAt = new Date();

    const unreadMessages = await this.messagesRepository.find({
      where: {
        roomId,
        senderId: Not(user.sub),
      },
      order: {
        createdAt: 'ASC',
      },
    });

    const unseenMessages = unreadMessages.filter((message) => {
      if (!participant.lastReadAt) {
        return true;
      }
      return message.createdAt > participant.lastReadAt;
    });

    if (unseenMessages.length > 0) {
      const updated = unseenMessages.map((message) => {
        const metadata = message.metadata ?? {};
        const seenBy =
          metadata.seenBy && typeof metadata.seenBy === 'object'
            ? (metadata.seenBy as Record<string, string>)
            : {};

        return this.messagesRepository.create({
          ...message,
          metadata: {
            ...metadata,
            seenBy: {
              ...seenBy,
              [user.sub]: readAt.toISOString(),
            },
          },
        });
      });

      await this.messagesRepository.save(updated);
    }

    await this.participantsRepository.update(
      {
        roomId,
        userId: user.sub,
      },
      {
        lastReadAt: readAt,
      },
    );

    this.chatGateway.emitReadReceipt(roomId, {
      roomId,
      userId: user.sub,
      readAt: readAt.toISOString(),
      messageIds: unseenMessages.map((message) => message.id),
    });

    return {
      roomId,
      readAt: readAt.toISOString(),
      messageIds: unseenMessages.map((message) => message.id),
    };
  }

  private async markRoomMessagesDelivered(userId: string, roomId: string) {
    const deliveredAt = new Date();

    const candidateMessages = await this.messagesRepository.find({
      where: {
        roomId,
        senderId: Not(userId),
      },
      order: {
        createdAt: 'ASC',
      },
      take: 200,
    });

    if (candidateMessages.length === 0) {
      return;
    }

    const newlyDelivered: Message[] = [];
    const deliveredMessageIds: string[] = [];

    for (const message of candidateMessages) {
      const metadata = message.metadata ?? {};
      const deliveredBy =
        metadata.deliveredBy && typeof metadata.deliveredBy === 'object'
          ? (metadata.deliveredBy as Record<string, string>)
          : {};

      if (deliveredBy[userId]) {
        continue;
      }

      deliveredMessageIds.push(message.id);
      newlyDelivered.push(
        this.messagesRepository.create({
          ...message,
          metadata: {
            ...metadata,
            deliveredBy: {
              ...deliveredBy,
              [userId]: deliveredAt.toISOString(),
            },
          },
        }),
      );
    }

    if (newlyDelivered.length === 0) {
      return;
    }

    await this.messagesRepository.save(newlyDelivered);

    this.chatGateway.emitDeliveredReceipt(roomId, {
      roomId,
      userId,
      deliveredAt: deliveredAt.toISOString(),
      messageIds: deliveredMessageIds,
    });
  }

  private async ensureParticipant(userId: string, roomId: string) {
    const participant = await this.participantsRepository.findOne({
      where: {
        roomId,
        userId,
      },
    });

    if (!participant) {
      throw new NotFoundException('Chat room not found for user');
    }

    return participant;
  }

  private async findExistingPrivateRoom(firstUserId: string, secondUserId: string) {
    return this.roomsRepository
      .createQueryBuilder('room')
      .innerJoin(ChatParticipant, 'p1', 'p1.room_id = room.id AND p1.user_id = :firstUserId', {
        firstUserId,
      })
      .innerJoin(ChatParticipant, 'p2', 'p2.room_id = room.id AND p2.user_id = :secondUserId', {
        secondUserId,
      })
      .where('room.type = :type', { type: ChatRoomType.PRIVATE })
      .orderBy('room.created_at', 'DESC')
      .getOne();
  }

  private async findOrCreatePrivateRoom(currentUserId: string, otherUserId: string) {
    if (currentUserId === otherUserId) {
      throw new BadRequestException('Cannot create private room with yourself');
    }

    await this.assertSharedUnlockedEvent(currentUserId, otherUserId);

    const existingRoom = await this.findExistingPrivateRoom(currentUserId, otherUserId);
    if (existingRoom) {
      return existingRoom;
    }

    const room = this.roomsRepository.create({
      type: ChatRoomType.PRIVATE,
      createdByUserId: currentUserId,
    });
    const savedRoom = await this.roomsRepository.save(room);

    await this.participantsRepository.save([
      this.participantsRepository.create({
        roomId: savedRoom.id,
        userId: currentUserId,
      }),
      this.participantsRepository.create({
        roomId: savedRoom.id,
        userId: otherUserId,
      }),
    ]);

    return savedRoom;
  }

  private async assertSharedUnlockedEvent(firstUserId: string, secondUserId: string) {
    const dmUnlockedByPaidTier = await this.isPremiumDmUnlocked(
      firstUserId,
      secondUserId,
    );

    if (dmUnlockedByPaidTier) {
      return;
    }

    const sharedUnlockedRsvps = await this.rsvpRepository
      .createQueryBuilder('first')
      .innerJoin(
        Rsvp,
        'second',
        'second.event_id = first.event_id AND second.user_id = :secondUserId',
        { secondUserId },
      )
      .where('first.user_id = :firstUserId', { firstUserId })
      .andWhere('(first.status = :confirmedStatus OR first.paid_at IS NOT NULL)', {
        confirmedStatus: RsvpStatus.CONFIRMED,
      })
      .andWhere('(second.status = :confirmedStatus OR second.paid_at IS NOT NULL)', {
        confirmedStatus: RsvpStatus.CONFIRMED,
      })
      .getCount();

    if (sharedUnlockedRsvps < 1) {
      throw new ForbiddenException(
        'Private messaging unlocks only with a paid DM tier or when both users have confirmed or paid attendance for at least one shared event.',
      );
    }
  }

  private async isPremiumDmUnlocked(firstUserId: string, secondUserId: string) {
    const users = await this.usersRepository.find({
      where: [{ id: firstUserId }, { id: secondUserId }],
      select: {
        id: true,
        roles: true,
        subscriptionPlan: true,
      },
    });

    return users.some((user) => this.hasPremiumMessagingAccess(user));
  }

  private hasPremiumMessagingAccess(
    user: Pick<User, 'roles' | 'subscriptionPlan'>,
  ) {
    const isBusinessOrAdmin =
      user.roles.includes(Role.BUSINESS) ||
      user.roles.includes(Role.CAPITAL_USER) ||
      user.roles.includes(Role.ADMIN);

    if (isBusinessOrAdmin) {
      return false;
    }

    return user.roles.includes(Role.CLIENT) && hasSubscriptionFeatureAccess(user, 'direct_messaging');
  }
}
