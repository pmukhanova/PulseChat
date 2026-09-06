import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatsModule } from '../chats/chats.module';
import { MessagesModule } from '../messages/messages.module';
import { UsersModule } from '../users/users.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeRegistryService } from './realtime-registry.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => ChatsModule),
    forwardRef(() => MessagesModule),
  ],
  providers: [RealtimeGateway, RealtimeRegistryService],
  exports: [RealtimeRegistryService],
})
export class WebsocketModule {}
