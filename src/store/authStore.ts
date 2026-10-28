import { create } from 'zustand';
import type { User } from '../types';
import { authService } from '../services';
import { setAuthFailureHandler } from '../services/api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  /** True once the initial session restore has finished (success or not). */
  initialized: boolean;
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
  initialized: false,
  error: null,

  setUser: (user: User | null) => set({ user }),

  login: async (loginId: string, password?: string) => {
    set({ isLoading: true, error: null });
    try {
      const user = await authService.login(loginId, password);
      set({ user, isLoading: false, initialized: true });
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
    if (!get().initialized) set({ isLoading: true });
    try {
      const user = await authService.getCurrentUser();
      set({ user, isLoading: false, initialized: true });
      return user;
    } catch {
      set({ user: null, isLoading: false, initialized: true });
      return null;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    await authService.logout();
    set({ user: null, isLoading: false, initialized: true, error: null });
  },

  clearError: () => set({ error: null })
}));

// A failed token refresh means the session is gone: drop the user so guards redirect to /login.
setAuthFailureHandler(() => useAuthStore.setState({ user: null, initialized: true }));
