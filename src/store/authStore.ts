import { create } from 'zustand';
import type { User } from '../types';
import { authService } from '../services';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  login: (loginId: string, password?: string) => Promise<User>;
  changePassword: (newPassword: string) => Promise<User>;
  loadCurrentUser: () => Promise<User | null>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  error: null,

  setUser: (user: User | null) => set({ user }),

  login: async (loginId: string, password?: string) => {
    set({ isLoading: true, error: null });
    try {
      const user = await authService.login(loginId, password);
      set({ user, isLoading: false });
      return user;
    } catch (err: any) {
      set({ error: err.message || 'Login failed', isLoading: false });
      throw err;
    }
  },

  changePassword: async (newPassword: string) => {
    const { user } = get();
    if (!user) throw new Error('No user logged in');
    set({ isLoading: true, error: null });
    try {
      const updated = await authService.changePassword(user.id, newPassword);
      set({ user: updated, isLoading: false });
      return updated;
    } catch (err: any) {
      set({ error: err.message || 'Failed to change password', isLoading: false });
      throw err;
    }
  },

  loadCurrentUser: async () => {
    set({ isLoading: true });
    try {
      const user = await authService.getCurrentUser();
      set({ user, isLoading: false });
      return user;
    } catch {
      set({ user: null, isLoading: false });
      return null;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    await authService.logout();
    set({ user: null, isLoading: false, error: null });
  },

  clearError: () => set({ error: null })
}));
