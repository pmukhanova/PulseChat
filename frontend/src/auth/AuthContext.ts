import { createContext } from 'react';
import type { User } from '../types/api';

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  isReady: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
