import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/chat',
})
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('room:join')
  joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    client.join(payload.roomId);
    return { joined: payload.roomId };
  }

  @SubscribeMessage('typing')
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; userId: string; isTyping: boolean },
  ) {
    client.to(payload.roomId).emit('typing', payload);
  }

  emitMessage(roomId: string, payload: Record<string, unknown>) {
    this.server.to(roomId).emit('message:new', payload);
  }

  emitReadReceipt(
    roomId: string,
    payload: {
      roomId: string;
      userId: string;
      readAt: string;
      messageIds: string[];
    },
  ) {
    this.server.to(roomId).emit('message:read', payload);
  }

  emitDeliveredReceipt(
    roomId: string,
    payload: {
      roomId: string;
      userId: string;
      deliveredAt: string;
      messageIds: string[];
    },
  ) {
    this.server.to(roomId).emit('message:delivered', payload);
  }
}

