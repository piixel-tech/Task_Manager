import type { IAuthService } from '../interfaces';
import type { User } from '../../types';

export class SupabaseAuthService implements IAuthService {
  async login(_loginId: string, _password?: string): Promise<User> {
    throw new Error('Supabase integration not configured. Please switch to mock mode.');
  }
  async changePassword(_userId: string, _newPassword?: string): Promise<User> {
    throw new Error('Supabase integration not configured.');
  }
  async getCurrentUser(): Promise<User | null> {
    return null;
  }
  async logout(): Promise<void> {}
}

export const supabaseAuthService = new SupabaseAuthService();
