import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from './services/api';

export const useStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      setUser: (user) => set({ user }),

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { token, user } = await authAPI.login({ email, password });
          localStorage.setItem('pp_token', token);
          set({ user, token, isLoading: false });
          return { user };
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      register: async (name, email, password, department, extra = {}) => {
        set({ isLoading: true });
        try {
          const { token, user } = await authAPI.register({ name, email, password, department, ...extra });
          localStorage.setItem('pp_token', token);
          set({ user, token, isLoading: false });
          return { user };
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      googleLogin: async (credential) => {
        set({ isLoading: true });
        try {
          const { token, user } = await authAPI.googleLogin(credential);
          localStorage.setItem('pp_token', token);
          set({ user, token, isLoading: false });
          return { user };
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try { await authAPI.logout(); } catch {}
        localStorage.removeItem('pp_token');
        set({ user: null, token: null });
      },

      refreshUser: async () => {
        const token = localStorage.getItem('pp_token');
        if (!token) return;
        try {
          const { user } = await authAPI.getMe();
          set({ user, token });
        } catch {
          localStorage.removeItem('pp_token');
          set({ user: null, token: null });
        }
      },

      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    {
      name: 'pp-store',
      partialize: (s) => ({ user: s.user, token: s.token }),
    }
  )
);
