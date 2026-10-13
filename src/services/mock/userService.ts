import type { IUserService } from '../interfaces';
import type { User } from '../../types';
import { getStoredData, setStoredData, KEYS, delay } from './storage';
import { generateId } from '../../utils/ids';
import { formatLoginId } from '../../utils/format';

export class MockUserService implements IUserService {
  async getUsers(): Promise<User[]> {
    await delay(80);
    return getStoredData<User[]>(KEYS.USERS);
  }

  async getUserById(id: string): Promise<User | null> {
    await delay(50);
    const users = getStoredData<User[]>(KEYS.USERS);
    return users.find(u => u.id === id) || null;
  }

  async createUser(userData: Omit<User, 'id'>): Promise<User> {
    await delay(150);
    const users = getStoredData<User[]>(KEYS.USERS);

    let baseLoginId = userData.loginId || formatLoginId(userData.name, userData.company, userData.jobTitle);
    let finalLoginId = baseLoginId;
    let counter = 2;

    while (users.some(u => u.loginId.toLowerCase() === finalLoginId.toLowerCase())) {
      finalLoginId = `${baseLoginId}-${counter}`;
      counter++;
    }

    const newUser: User = {
      ...userData,
      id: generateId('usr'),
      loginId: finalLoginId,
      password: userData.password || 'password123',
      mustChangePassword: userData.mustChangePassword ?? true,
      active: userData.active ?? true
    };

    users.push(newUser);
    setStoredData(KEYS.USERS, users);
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    await delay(150);
    const users = getStoredData<User[]>(KEYS.USERS);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('User not found');

    const currentUser = users[index];

    if (updates.loginId && updates.loginId.trim().toLowerCase() !== currentUser.loginId.toLowerCase()) {
      const isTaken = users.some(
        u => u.id !== id && u.loginId.toLowerCase() === updates.loginId!.trim().toLowerCase()
      );
      if (isTaken) {
        throw new Error(`Login ID "${updates.loginId}" is already taken.`);
      }
    }

    const updated: User = {
      ...currentUser,
      ...updates,
      name: updates.name !== undefined ? updates.name.trim() : currentUser.name,
      jobTitle: updates.jobTitle !== undefined ? updates.jobTitle.trim() : currentUser.jobTitle,
      loginId: updates.loginId !== undefined ? updates.loginId.trim() : currentUser.loginId
    };

    users[index] = updated;
    setStoredData(KEYS.USERS, users);

    // Sync Everyone group chat participants on status change
    if (updates.active === false) {
      const rooms = getStoredData<any[]>(KEYS.CHAT_ROOMS);
      let roomsChanged = false;
      rooms.forEach((r) => {
        if (r.id === 'room_everyone' || (r.name && r.name.toLowerCase() === 'everyone')) {
          if (r.participantIds && r.participantIds.includes(id)) {
            r.participantIds = r.participantIds.filter((pid: string) => pid !== id);
            roomsChanged = true;
          }
        }
      });
      if (roomsChanged) {
        setStoredData(KEYS.CHAT_ROOMS, rooms);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('tm_chat_update'));
        }
      }
    } else if (updates.active === true) {
      const rooms = getStoredData<any[]>(KEYS.CHAT_ROOMS);
      let roomsChanged = false;
      rooms.forEach((r) => {
        if (r.id === 'room_everyone' || (r.name && r.name.toLowerCase() === 'everyone')) {
          if (r.participantIds && !r.participantIds.includes(id)) {
            r.participantIds.push(id);
            roomsChanged = true;
          }
        }
      });
      if (roomsChanged) {
        setStoredData(KEYS.CHAT_ROOMS, rooms);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('tm_chat_update'));
        }
      }
    }

    // Sync CURRENT_USER if this was the logged in user
    const currentStoredUser = getStoredData<User | null>(KEYS.CURRENT_USER);
    if (currentStoredUser && currentStoredUser.id === id) {
      setStoredData(KEYS.CURRENT_USER, updated);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tm_users_update'));
    }

    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    await delay(100);
    let users = getStoredData<User[]>(KEYS.USERS);
    users = users.filter(u => u.id !== id);
    setStoredData(KEYS.USERS, users);
  }

  async resetPassword(id: string, newPassword = 'password123'): Promise<User> {
    await delay(100);
    const users = getStoredData<User[]>(KEYS.USERS);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('User not found');

    users[index].password = newPassword;
    users[index].mustChangePassword = true;

    setStoredData(KEYS.USERS, users);
    return users[index];
  }

  async toggleUserActive(id: string): Promise<User> {
    await delay(100);
    const users = getStoredData<User[]>(KEYS.USERS);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('User not found');

    users[index].active = !users[index].active;

    setStoredData(KEYS.USERS, users);
    return users[index];
  }
}

export const mockUserService = new MockUserService();
