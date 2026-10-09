import { create } from 'zustand';
import type { User } from '../types';
import { userService } from '../services';

interface UserState {
  users: Record<string, User>;
  usersList: User[];
  isLoading: boolean;
  error: string | null;

  fetchUsers: () => Promise<User[]>;
  setUser: (user: User) => void;
  updateUserInStore: (id: string, updates: Partial<User>) => Promise<User>;
}

export const useUserStore = create<UserState>((set, get) => ({
  users: {},
  usersList: [],
  isLoading: false,
  error: null,

  fetchUsers: async () => {
    set({ isLoading: true, error: null });
    try {
      const list = await userService.getUsers();
      const map: Record<string, User> = {};
      list.forEach((u) => {
        map[u.id] = u;
      });
      set({ users: map, usersList: list, isLoading: false });
      return list;
    } catch (err: any) {
      set({ error: err.message || 'Failed to load users', isLoading: false });
      return [];
    }
  },

  setUser: (user: User) => {
    set((state) => {
      const newUsers = { ...state.users, [user.id]: user };
      const index = state.usersList.findIndex((u) => u.id === user.id);
      let newUsersList = [...state.usersList];
      if (index >= 0) {
        newUsersList[index] = user;
      } else {
        newUsersList.push(user);
      }
      return { users: newUsers, usersList: newUsersList };
    });
  },

  updateUserInStore: async (id: string, updates: Partial<User>) => {
    set({ isLoading: true });
    try {
      const updated = await userService.updateUser(id, updates);
      get().setUser(updated);
      set({ isLoading: false });
      return updated;
    } catch (err: any) {
      set({ error: err.message || 'Failed to update user', isLoading: false });
      throw err;
    }
  }
}));
