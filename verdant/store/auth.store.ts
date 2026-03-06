import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Cookies from 'js-cookie';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  setLoading: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      setUser: (user, accessToken, refreshToken) => {
        Cookies.set('verdant_token', accessToken, { expires: 1, secure: true, sameSite: 'lax' });
        Cookies.set('verdant_refresh', refreshToken, { expires: 7, secure: true, sameSite: 'lax' });
        set({ user, isAuthenticated: true });
      },
      clearAuth: () => {
        Cookies.remove('verdant_token');
        Cookies.remove('verdant_refresh');
        set({ user: null, isAuthenticated: false });
      },
      setLoading: (v) => set({ isLoading: v }),
    }),
    {
      name: 'verdant-auth',
      partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }),
    },
  ),
);
