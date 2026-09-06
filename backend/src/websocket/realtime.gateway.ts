import { Inject, Logger, UseFilters, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import 'dotenv/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatsService } from '../chats/chats.service';
import { WebsocketExceptionFilter } from '../common/filters/websocket-exception.filter';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { ChatRoomDto } from '../messages/dto/chat-room.dto';
import { SendMessageDto } from '../messages/dto/send-message.dto';
import { MessagesService } from '../messages/messages.service';
import { UsersService } from '../users/users.service';
import { RealtimeRegistryService } from './realtime-registry.service';

interface TokenPayload {
  sub: string;
  username: string;
}

interface AuthenticatedSocket extends Socket {
  data: { user: AuthUser };
}

@UseFilters(WebsocketExceptionFilter)
@WebSocketGateway({
  cors: {
    origin: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:8080')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => ChatsService))
    private readonly chatsService: ChatsService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
    private readonly registry: RealtimeRegistryService,
  ) {}

  afterInit(server: Server): void {
    this.registry.setServer(server);
    server.use(async (socket, next) => {
      try {
        const rawToken = socket.handshake.auth?.token;
        if (typeof rawToken !== 'string' || rawToken.length === 0) {
          throw new Error('JWT token is required');
        }
        const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7) : rawToken;
        const payload = await this.jwtService.verifyAsync<TokenPayload>(token);
        const user = await this.usersService.findById(payload.sub);
        if (!user) throw new Error('User not found');
        socket.data.user = { id: user.id, username: user.username };
        next();
      } catch {
        next(new Error('Unauthorized WebSocket connection'));
      }
    });
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    await client.join(`user:${client.data.user.id}`);
    this.logger.log(`WebSocket connected for user ${client.data.user.id}`);
  }

  @SubscribeMessage('join_chat')
  async joinChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean; chatId?: string; error?: string }> {
    try {
      const dto = await this.parseDto(ChatRoomDto, payload);
      await this.chatsService.requireMembership(dto.chatId, client.data.user.id);
      await client.join(`chat:${dto.chatId}`);
      return { ok: true, chatId: dto.chatId };
    } catch (error: unknown) {
      return { ok: false, error: this.errorMessage(error) };
    }
  }

  @SubscribeMessage('leave_chat')
  async leaveChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean; chatId?: string; error?: string }> {
    try {
      const dto = await this.parseDto(ChatRoomDto, payload);
      await client.leave(`chat:${dto.chatId}`);
      return { ok: true, chatId: dto.chatId };
    } catch (error: unknown) {
      return { ok: false, error: this.errorMessage(error) };
    }
  }

  @SubscribeMessage('send_message')
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<{
    ok: boolean;
    message?: Awaited<ReturnType<MessagesService['create']>>['message'];
    deduplicated?: boolean;
    error?: string;
  }> {
    try {
      const dto = await this.parseDto(SendMessageDto, payload);
      const result = await this.messagesService.create(client.data.user.id, dto);
      if (!result.deduplicated) {
        this.registry.emitMessageCreated(
          await this.chatsService.getMemberUserIds(dto.chatId),
          result.message,
        );
      }
      return { ok: true, message: result.message, deduplicated: result.deduplicated };
    } catch (error: unknown) {
      return { ok: false, error: this.errorMessage(error) };
    }
  }

  private errorMessage(error: unknown): string {
    if (typeof error !== 'object' || error === null) return 'Неизвестная ошибка';
    if ('message' in error && typeof error.message === 'string') return error.message;
    return 'Неизвестная ошибка';
  }

  private async parseDto<T extends object>(
    dtoClass: ClassConstructor<T>,
    payload: unknown,
  ): Promise<T> {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new Error('Payload должен быть объектом');
    }
    const dto = plainToInstance(dtoClass, payload);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length > 0) {
      const details = errors.flatMap((error) => Object.values(error.constraints ?? {}));
      throw new Error(details[0] ?? 'Некорректный payload');
    }
    return dto;
  }
}
