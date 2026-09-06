import { io, type Socket } from 'socket.io-client';
import type {
  Message,
  SendMessageAck,
  SendMessagePayload,
  SocketAck,
} from '../types/api';

const ACK_TIMEOUT_MS = 5_000;

class AckTimeoutError extends Error {}

export function createMessengerSocket(token: string): Socket {
  const configuredUrl = import.meta.env.VITE_SOCKET_URL;
  const url = configuredUrl?.trim() || window.location.origin;

  return io(url, {
    auth: { token },
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 4_000,
  });
}

function emitWithAck<TPayload, TAck>(
  socket: Socket,
  event: string,
  payload: TPayload,
  timeoutMs = ACK_TIMEOUT_MS,
): Promise<TAck> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new AckTimeoutError('Сервер не подтвердил запрос вовремя')), timeoutMs);

    socket.emit(event, payload, (ack: TAck) => {
      window.clearTimeout(timeout);
      resolve(ack);
    });
  });
}

function assertSuccessfulAck(ack: SocketAck): void {
  if (!ack?.ok) throw new Error(ack?.error || 'Сервер отклонил запрос');
}

export async function joinChat(socket: Socket, chatId: string): Promise<void> {
  const ack = await emitWithAck<{ chatId: string }, SocketAck>(socket, 'join_chat', { chatId });
  assertSuccessfulAck(ack);
}

export async function leaveChat(socket: Socket, chatId: string): Promise<void> {
  const ack = await emitWithAck<{ chatId: string }, SocketAck>(socket, 'leave_chat', { chatId });
  assertSuccessfulAck(ack);
}

async function sendOnce(socket: Socket, payload: SendMessagePayload): Promise<Message> {
  const ack = await emitWithAck<SendMessagePayload, SendMessageAck>(socket, 'send_message', payload);
  if (!ack?.ok || !ack.message) throw new Error(ack?.error || 'Сообщение не было сохранено');
  return ack.message;
}

export async function sendMessageWithRetry(socket: Socket, payload: SendMessagePayload): Promise<Message> {
  try {
    return await sendOnce(socket, payload);
  } catch (firstError) {
    if (!(firstError instanceof AckTimeoutError) || !socket.connected) throw firstError;
    // The same clientMessageId makes this one retry idempotent on the server.
    return sendOnce(socket, payload);
  }
}
