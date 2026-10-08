import type { IAuthService } from '../interfaces';
import type { User } from '../../types';
import { getStoredData, setStoredData, KEYS, delay } from './storage';

export class MockAuthService implements IAuthService {
  async login(loginId: string, password?: string): Promise<User> {
    await delay(150);
    const users = getStoredData<User[]>(KEYS.USERS);
    const cleanId = loginId.trim().toLowerCase();
    
    const user = users.find(u => u.loginId.toLowerCase() === cleanId);
    if (!user) {
      throw new Error('Invalid Login ID. Please check format (e.g. rahul-piixel@seo-executive)');
    }
    
    if (password && user.password && user.password !== password) {
      throw new Error('Incorrect password');
    }

    if (!user.active) {
      throw new Error('Account is deactivated. Contact admin.');
    }

    setStoredData<User | null>(KEYS.CURRENT_USER, user);
    return user;
  }

  async changePassword(userId: string, newPassword?: string): Promise<User> {
    await delay(150);
    const users = getStoredData<User[]>(KEYS.USERS);
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) throw new Error('User not found');

    const updated: User = {
      ...users[index],
      password: newPassword || 'password123',
      mustChangePassword: false
    };

    users[index] = updated;
    setStoredData(KEYS.USERS, users);
    setStoredData<User | null>(KEYS.CURRENT_USER, updated);
    return updated;
  }

  async getCurrentUser(): Promise<User | null> {
    await delay(50);
    const user = localStorage.getItem(KEYS.CURRENT_USER);
    return user ? JSON.parse(user) : null;
  }

  async logout(): Promise<void> {
    await delay(50);
    localStorage.removeItem(KEYS.CURRENT_USER);
  }
}

export const mockAuthService = new MockAuthService();
