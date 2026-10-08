import type { IHolidayService } from '../interfaces';
import type { Holiday } from '../../types';

export class SupabaseHolidayService implements IHolidayService {
  async getHolidays(): Promise<Holiday[]> {
    throw new Error('Supabase integration not configured.');
  }
  async addHoliday(_holiday: Omit<Holiday, 'id'>): Promise<Holiday> {
    throw new Error('Supabase integration not configured.');
  }
  async deleteHoliday(_id: string): Promise<void> {
    throw new Error('Supabase integration not configured.');
  }
  async getWeekOffs(): Promise<number[]> {
    throw new Error('Supabase integration not configured.');
  }
  async setWeekOffs(_days: number[]): Promise<number[]> {
    throw new Error('Supabase integration not configured.');
  }
}

export const supabaseHolidayService = new SupabaseHolidayService();
