import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { authApi } from '../lib/api';
import { clearSession, readSession, saveSession } from '../lib/session';
import type { AuthResponse } from '../types/api';
import { AuthContext } from './AuthContext';

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthResponse | null>(() => readSession());
  const [isReady, setIsReady] = useState(false);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener('pulse-chat:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('pulse-chat:unauthorized', handleUnauthorized);
  }, [logout]);

  useEffect(() => {
    let active = true;

    async function verifyStoredSession() {
      if (!session) {
        setIsReady(true);
        return;
      }

      try {
        const user = await authApi.me();
        if (!active) return;
        const verified = { ...session, user };
        saveSession(verified);
        setSession(verified);
      } catch {
        // A 401 is handled by the interceptor. A transient network error keeps the local session.
      } finally {
        if (active) setIsReady(true);
      }
    }

    void verifyStoredSession();
    return () => {
      active = false;
    };
    // Stored credentials only need verification once on application start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySession = useCallback((nextSession: AuthResponse) => {
    saveSession(nextSession);
    setSession(nextSession);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    applySession(await authApi.login(username, password));
  }, [applySession]);

  const register = useCallback(async (username: string, password: string) => {
    applySession(await authApi.register(username, password));
  }, [applySession]);

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, token: session?.accessToken ?? null, isReady, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
