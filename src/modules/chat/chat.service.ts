import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ChatRoomType } from '../../shared/enums/chat-room-type.enum';
import { NotificationType } from '../../shared/enums/notification-type.enum';
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { Rsvp } from '../events/entities/rsvp.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePrivateRoomDto } from './dto/create-private-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatParticipant } from './entities/chat-participant.entity';
import { ChatRoom } from './entities/chat-room.entity';
import { Message } from './entities/message.entity';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatRoom)
    private readonly roomsRepository: Repository<ChatRoom>,
    @InjectRepository(ChatParticipant)
    private readonly participantsRepository: Repository<ChatParticipant>,
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    @InjectRepository(Rsvp)
    private readonly rsvpRepository: Repository<Rsvp>,
    private readonly chatGateway: ChatGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createPrivateRoom(user: JwtUser, payload: CreatePrivateRoomDto) {
    const room = this.roomsRepository.create({
      type: ChatRoomType.PRIVATE,
      createdByUserId: user.sub,
    });
    const savedRoom = await this.roomsRepository.save(room);

    await this.participantsRepository.save([
      this.participantsRepository.create({
        roomId: savedRoom.id,
        userId: user.sub,
      }),
      this.participantsRepository.create({
        roomId: savedRoom.id,
        userId: payload.otherUserId,
      }),
    ]);

    return savedRoom;
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
          cr.*,
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
        LEFT JOIN messages m ON m.room_id = cr.id
        WHERE cp.user_id = $1
        GROUP BY cr.id, cp.last_read_at
        ORDER BY cr.last_message_at DESC NULLS LAST, cr.created_at DESC
      `,
      [user.sub],
    );
  }

  async listMessages(user: JwtUser, roomId: string) {
    await this.ensureParticipant(user.sub, roomId);

    return this.messagesRepository.find({
      where: { roomId },
      order: { createdAt: 'ASC' },
      take: 100,
    });
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

    this.chatGateway.emitMessage(roomId, savedMessage as unknown as Record<string, unknown>);

    return savedMessage;
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
}

