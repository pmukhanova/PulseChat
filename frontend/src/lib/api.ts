import axios, { type AxiosError } from 'axios';
import type {
  AuthResponse,
  Chat,
  ChatMember,
  ChatRole,
  Message,
  MessagePage,
  User,
} from '../types/api';
import { clearSession, getAccessToken } from './session';

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

type Collection<T> = T[] | { items: T[] };

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 12_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearSession();
      window.dispatchEvent(new CustomEvent('pulse-chat:unauthorized'));
    }
    return Promise.reject(error);
  },
);

function collectionItems<T>(collection: Collection<T>): T[] {
  return Array.isArray(collection) ? collection : collection.items;
}

export function getErrorMessage(error: unknown, fallback = 'Не удалось выполнить запрос'): string {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return error instanceof Error ? error.message : fallback;
  }

  if (!error.response) {
    return 'Сервер недоступен. Проверьте подключение и повторите попытку.';
  }

  const message = error.response.data?.message ?? error.response.data?.error;
  if (Array.isArray(message)) return message.join('. ');
  return message || fallback;
}

export const authApi = {
  async login(username: string, password: string): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/login', { username, password });
    return data;
  },

  async register(username: string, password: string): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/register', { username, password });
    return data;
  },

  async me(): Promise<User> {
    const { data } = await api.get<User>('/auth/me');
    return data;
  },
};

export const usersApi = {
  async search(query: string): Promise<User[]> {
    const { data } = await api.get<Collection<User>>('/users', { params: { search: query } });
    return collectionItems(data);
  },
};

export const chatsApi = {
  async list(): Promise<Chat[]> {
    const { data } = await api.get<Collection<Chat>>('/chats');
    return collectionItems(data);
  },

  async get(chatId: string): Promise<Chat> {
    const { data } = await api.get<Chat>(`/chats/${chatId}`);
    return data;
  },

  async createDirect(userId: string): Promise<Chat> {
    const { data } = await api.post<Chat>('/chats/direct', { userId });
    return data;
  },

  async createGroup(title: string, memberIds: string[]): Promise<Chat> {
    const { data } = await api.post<Chat>('/chats/group', { title, memberIds });
    return data;
  },

  async rename(chatId: string, title: string): Promise<Chat> {
    const { data } = await api.patch<Chat>(`/chats/${chatId}`, { title });
    return data;
  },

  async members(chatId: string): Promise<ChatMember[]> {
    const { data } = await api.get<Collection<ChatMember>>(`/chats/${chatId}/members`);
    return collectionItems(data);
  },

  async addMember(chatId: string, userId: string): Promise<ChatMember> {
    const { data } = await api.post<ChatMember>(`/chats/${chatId}/members`, { userId });
    return data;
  },

  async removeMember(chatId: string, userId: string): Promise<void> {
    await api.delete(`/chats/${chatId}/members/${userId}`);
  },

  async changeRole(chatId: string, userId: string, role: Exclude<ChatRole, 'OWNER'>): Promise<ChatMember> {
    const { data } = await api.patch<ChatMember>(`/chats/${chatId}/members/${userId}/role`, {
      role,
    });
    return data;
  },
};

export const messagesApi = {
  async history(chatId: string, before?: string, limit = 30): Promise<MessagePage> {
    const { data } = await api.get<MessagePage>(`/chats/${chatId}/messages`, {
      params: { before, limit },
    });
    return data;
  },

  async search(chatId: string, query: string, limit = 50): Promise<Message[]> {
    const { data } = await api.get<Collection<Message>>(`/chats/${chatId}/messages/search`, {
      params: { q: query, limit },
    });
    return collectionItems(data);
  },
};
