import type { IAuthService } from '../interfaces';
import type { User } from '../../types';
import { api, getErrorMessage, tokenStore } from '../api';
import { fetchCompanies, toUser, type ApiUser } from './mappers';

export class HttpAuthService implements IAuthService {
  async login(email: string, password?: string): Promise<User> {
    try {
      const { data } = await api.post('/auth/login', { email: email.trim(), password });
      tokenStore.set(data.access_token, data.refresh_token);
      return await this.fetchMe();
    } catch (err) {
      tokenStore.clear();
      throw new Error(getErrorMessage(err, 'Login failed'));
    }
  }

  async changePassword(_userId: string, _newPassword?: string): Promise<User> {
    throw new Error('Changing your own password is not supported yet. Ask an admin to reset it.');
  }

  async getCurrentUser(): Promise<User | null> {
    if (!tokenStore.access && !tokenStore.refresh) return null;
    try {
      return await this.fetchMe();
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    // End this sign-in on the server too, so its tokens stop working everywhere. Leaving still works if that fails.
    await api.post('/auth/logout').catch(() => {});
    tokenStore.clear();
  }

  private async fetchMe(): Promise<User> {
    const [{ data }, companies] = await Promise.all([api.get<ApiUser>('/auth/me'), fetchCompanies()]);
    return toUser(data, companies);
  }
}

export const httpAuthService = new HttpAuthService();
