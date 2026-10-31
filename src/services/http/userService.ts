import axios from 'axios';
import type { IUserService } from '../interfaces';
import type { User } from '../../types';
import { api, getErrorMessage } from '../api';
import { fetchCompanies, toUser, type ApiUser } from './mappers';

const wrap = async <T>(fn: () => Promise<T>, fallback: string): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
};

export class HttpUserService implements IUserService {
  async getUsers(): Promise<User[]> {
    try {
      const [{ data }, companies] = await Promise.all([api.get<ApiUser[]>('/users'), fetchCompanies()]);
      return data.map((u) => toUser(u, companies));
    } catch (err) {
      // /users is admin-only; other roles simply get an empty directory.
      if (axios.isAxiosError(err) && err.response?.status === 403) return [];
      throw new Error(getErrorMessage(err, 'Failed to load users'));
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const users = await this.getUsers();
    return users.find((u) => u.id === id) ?? null;
  }

  async createUser(user: Omit<User, 'id'>): Promise<User> {
    return wrap(async () => {
      const { data } = await api.post<ApiUser>('/users', {
        name: user.name,
        email: user.loginId,
        password: user.password,
        role: user.role,
        company_id: user.companyId ?? null,
        title: user.jobTitle && user.jobTitle !== user.role ? user.jobTitle : ''
      });
      return toUser(data, await fetchCompanies());
    }, 'Failed to create user');
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    return wrap(async () => {
      const body: Record<string, unknown> = {};
      if (updates.name !== undefined) body.name = updates.name;
      if (updates.jobTitle !== undefined) body.title = updates.jobTitle;
      if (updates.loginId !== undefined) body.email = updates.loginId;
      if (updates.role !== undefined) body.role = updates.role;
      if (updates.companyId !== undefined) body.company_id = updates.companyId;
      if (updates.avatarUrl !== undefined) body.avatar_url = updates.avatarUrl;
      if (updates.active !== undefined) body.is_active = updates.active;
      if (updates.password !== undefined) body.password = updates.password;
      const { data } = await api.patch<ApiUser>(`/users/${id}`, body);
      return toUser(data, await fetchCompanies());
    }, 'Failed to update user');
  }

  /** Soft delete: the backend deactivates the account. */
  async deleteUser(id: string): Promise<void> {
    await wrap(() => api.delete(`/users/${id}`), 'Failed to deactivate user');
  }

  async resetPassword(id: string, newPassword?: string): Promise<User> {
    return this.updateUser(id, { password: newPassword });
  }

  async toggleUserActive(id: string): Promise<User> {
    const user = await this.getUserById(id);
    if (!user) throw new Error('User not found');
    return this.updateUser(id, { active: !user.active });
  }
}

export const httpUserService = new HttpUserService();
