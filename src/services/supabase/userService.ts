import type { IUserService } from '../interfaces';
import type { User } from '../../types';

export class SupabaseUserService implements IUserService {
  async getUsers(): Promise<User[]> {
    throw new Error('Supabase integration not configured.');
  }
  async getUserById(_id: string): Promise<User | null> {
    throw new Error('Supabase integration not configured.');
  }
  async createUser(_user: Omit<User, 'id'>): Promise<User> {
    throw new Error('Supabase integration not configured.');
  }
  async updateUser(_id: string, _updates: Partial<User>): Promise<User> {
    throw new Error('Supabase integration not configured.');
  }
  async deleteUser(_id: string): Promise<void> {
    throw new Error('Supabase integration not configured.');
  }
  async resetPassword(_id: string, _newPassword?: string): Promise<User> {
    throw new Error('Supabase integration not configured.');
  }
  async toggleUserActive(_id: string): Promise<User> {
    throw new Error('Supabase integration not configured.');
  }
}

export const supabaseUserService = new SupabaseUserService();
