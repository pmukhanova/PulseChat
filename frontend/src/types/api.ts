export type ChatType = 'DIRECT' | 'GROUP';
export type ChatRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface User {
  id: string;
  username: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface ChatMember {
  user: User;
  role: ChatRole;
  joinedAt?: string;
}

export interface Message {
  id: string;
  chatId: string;
  content: string;
  sender: User;
  createdAt: string;
  clientMessageId?: string;
}

export interface ChatLastMessage {
  id: string;
  content: string;
  sender: User;
  createdAt: string;
}

export interface Chat {
  id: string;
  type: ChatType;
  title: string | null;
  displayName?: string;
  members: ChatMember[];
  currentUserRole: ChatRole;
  lastMessage: ChatLastMessage | null;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface MessagePage {
  items: Message[];
  hasMore: boolean;
  nextBefore: string | null;
}

export interface SendMessagePayload {
  chatId: string;
  content: string;
  clientMessageId: string;
}

export interface SendMessageAck {
  ok: boolean;
  message?: Message;
  deduplicated?: boolean;
  error?: string;
}

export interface SocketAck {
  ok: boolean;
  error?: string;
}

export interface ChatAccessRevokedEvent {
  chatId: string;
}

export interface ChatListChangedEvent {
  chatId: string;
  reason: 'CREATED' | 'MEMBER_ADDED';
}

export interface ChatDetailsChangedEvent {
  chatId: string;
  reason: 'RENAMED' | 'MEMBER_ADDED' | 'MEMBER_REMOVED' | 'ROLE_CHANGED';
}

export interface PendingMessage extends Message {
  clientMessageId: string;
  deliveryStatus: 'sending' | 'failed';
}

export type VisibleMessage = Message | PendingMessage;
