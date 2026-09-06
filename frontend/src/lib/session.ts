import type { AuthResponse } from '../types/api';

const SESSION_KEY = 'pulse-chat-session';

export function readSession(): AuthResponse | null {
  try {
    const value = window.localStorage.getItem(SESSION_KEY);
    if (!value) return null;

    const parsed = JSON.parse(value) as Partial<AuthResponse>;
    if (!parsed.accessToken || !parsed.user?.id || !parsed.user.username) {
      clearSession();
      return null;
    }

    return parsed as AuthResponse;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session: AuthResponse): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
}

export function getAccessToken(): string | null {
  return readSession()?.accessToken ?? null;
}
