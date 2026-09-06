import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import type { MessageView } from '../messages/messages.service';

export type ChatListChangedReason = 'CREATED' | 'MEMBER_ADDED';
export type ChatDetailsChangedReason =
  | 'RENAMED'
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED';

interface ChatListChangedPayload {
  chatId: string;
  reason: ChatListChangedReason;
}

interface ChatDetailsChangedPayload {
  chatId: string;
  reason: ChatDetailsChangedReason;
}

@Injectable()
export class RealtimeRegistryService {
  private server?: Server;

  setServer(server: Server): void {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    for (const userId of new Set(userIds)) {
      this.emitToUser(userId, event, payload);
    }
  }

  emitChatListChanged(userIds: string[], chatId: string, reason: ChatListChangedReason): void {
    const payload: ChatListChangedPayload = { chatId, reason };
    this.emitToUsers(userIds, 'chat_list_changed', payload);
  }

  emitChatDetailsChanged(
    userIds: string[],
    chatId: string,
    reason: ChatDetailsChangedReason,
  ): void {
    const payload: ChatDetailsChangedPayload = { chatId, reason };
    this.emitToUsers(userIds, 'chat_details_changed', payload);
  }

  emitMessageCreated(userIds: string[], message: MessageView): void {
    this.emitToUsers(userIds, 'message_created', message);
  }

  async evictUserFromChat(userId: string, chatId: string): Promise<void> {
    if (!this.server) return;
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    await Promise.all(sockets.map((socket) => socket.leave(`chat:${chatId}`)));
    this.emitToUser(userId, 'chat_access_revoked', { chatId });
  }
}
