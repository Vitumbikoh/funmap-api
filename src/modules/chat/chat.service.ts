import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatRoomType } from '../../shared/enums/chat-room-type.enum';
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { Rsvp } from '../events/entities/rsvp.entity';
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
        SELECT cr.*
        FROM chat_rooms cr
        INNER JOIN chat_participants cp ON cp.room_id = cr.id
        WHERE cp.user_id = $1
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

    this.chatGateway.emitMessage(roomId, savedMessage as unknown as Record<string, unknown>);

    return savedMessage;
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
  }
}

