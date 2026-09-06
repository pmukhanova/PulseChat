import type { Chat, User, VisibleMessage } from '../types/api';

export function chatTitle(chat: Chat, currentUserId: string): string {
  if (chat.displayName?.trim()) return chat.displayName;
  if (chat.type === 'GROUP') return chat.title?.trim() || 'Групповой чат';
  return chat.members.find((member) => member.user.id !== currentUserId)?.user.username ?? 'Личный чат';
}

export function initials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

export function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatChatTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  if (date.toDateString() === now.toDateString()) return formatMessageTime(value);
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(date);
}

export function mergeMessages(current: VisibleMessage[], incoming: VisibleMessage[]): VisibleMessage[] {
  const byId = new Map<string, VisibleMessage>();
  for (const message of [...current, ...incoming]) byId.set(message.id, message);

  return [...byId.values()].sort((left, right) => {
    const timeDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDifference || left.id.localeCompare(right.id);
  });
}

export function isSameSender(message: VisibleMessage, user: User): boolean {
  return message.sender.id === user.id;
}
