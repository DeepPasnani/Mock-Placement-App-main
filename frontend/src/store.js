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

      // Gamification state
      streak: null,
      xpStats: null,
      setStreak: (streak) => set({ streak }),
      setXpStats: (xpStats) => set({ xpStats }),
      checkedInToday: false,
      setCheckedInToday: (v) => set({ checkedInToday: v }),

      // Accessibility & preferences
      preferences: {
        dyslexiaMode: false,
        fontSize: 'md',
        onboardingCompleted: false,
        dashboardWidgets: ['UpcomingTests', 'RecentScores', 'WeakTopics', 'XPProgress'],
        widgetOrder: ['UpcomingTests', 'RecentScores', 'WeakTopics', 'LeaderboardRank', 'XPProgress', 'StreakCounter'],
      },
      updatePreference: (key, value) => set((s) => ({
        preferences: { ...s.preferences, [key]: value },
      })),
      setDyslexiaMode: (v) => set((s) => ({
        preferences: { ...s.preferences, dyslexiaMode: v },
      })),
      setFontSize: (v) => set((s) => ({
        preferences: { ...s.preferences, fontSize: v },
      })),
      completeOnboarding: () => set((s) => ({
        preferences: { ...s.preferences, onboardingCompleted: true },
      })),
      setDashboardWidgets: (widgets) => set((s) => ({
        preferences: { ...s.preferences, dashboardWidgets: widgets },
      })),
      setWidgetOrder: (order) => set((s) => ({
        preferences: { ...s.preferences, widgetOrder: order },
      })),
    }),
    {
      name: 'pp-store',
      partialize: (s) => ({
        user: s.user, token: s.token, streak: s.streak, xpStats: s.xpStats,
        checkedInToday: s.checkedInToday, preferences: s.preferences,
      }),
    }
  )
);
