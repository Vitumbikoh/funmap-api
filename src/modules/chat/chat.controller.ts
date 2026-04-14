import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { ChatService } from './chat.service';
import { CreatePrivateRoomDto } from './dto/create-private-room.dto';
import { RespondChatRequestDto } from './dto/respond-chat-request.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms')
  listRooms(@CurrentUser() user: JwtUser) {
    return this.chatService.listRooms(user);
  }

  @Post('rooms/private')
  createPrivateRoom(
    @CurrentUser() user: JwtUser,
    @Body() payload: CreatePrivateRoomDto,
  ) {
    return this.chatService.createPrivateRoom(user, payload);
  }

  @Post('requests')
  requestPrivateChat(
    @CurrentUser() user: JwtUser,
    @Body() payload: CreatePrivateRoomDto,
  ) {
    return this.chatService.requestPrivateChat(user, payload.otherUserId);
  }

  @Get('requests/incoming')
  listIncomingRequests(@CurrentUser() user: JwtUser) {
    return this.chatService.listIncomingRequests(user);
  }

  @Get('requests/outgoing')
  listOutgoingRequests(@CurrentUser() user: JwtUser) {
    return this.chatService.listOutgoingRequests(user);
  }

  @Post('requests/:requestId/respond')
  respondToChatRequest(
    @CurrentUser() user: JwtUser,
    @Param('requestId') requestId: string,
    @Body() payload: RespondChatRequestDto,
  ) {
    return this.chatService.respondToChatRequest(user, requestId, payload.action);
  }

  @Post('rooms/event/:eventId/join')
  joinEventRoom(
    @CurrentUser() user: JwtUser,
    @Param('eventId') eventId: string,
  ) {
    return this.chatService.joinEventRoom(user, eventId);
  }

  @Get('rooms/:roomId')
  listMessages(@CurrentUser() user: JwtUser, @Param('roomId') roomId: string) {
    return this.chatService.listMessages(user, roomId);
  }

  @Post('rooms/:roomId')
  sendMessage(
    @CurrentUser() user: JwtUser,
    @Param('roomId') roomId: string,
    @Body() payload: SendMessageDto,
  ) {
    return this.chatService.sendMessage(user, roomId, payload);
  }

  @Post('rooms/:roomId/read')
  markRoomAsRead(@CurrentUser() user: JwtUser, @Param('roomId') roomId: string) {
    return this.chatService.markRoomAsRead(user, roomId);
  }
}

