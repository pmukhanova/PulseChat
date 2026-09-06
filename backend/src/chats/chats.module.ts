import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Message } from '../messages/entities/message.entity';
import { UsersModule } from '../users/users.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { ChatMember } from './entities/chat-member.entity';
import { Chat } from './entities/chat.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Chat, ChatMember, Message]),
    UsersModule,
    AuditModule,
    forwardRef(() => WebsocketModule),
  ],
  controllers: [ChatsController],
  providers: [ChatsService],
  exports: [ChatsService, TypeOrmModule],
})
export class ChatsModule {}
