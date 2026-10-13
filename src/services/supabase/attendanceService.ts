import type { IAttendanceService } from '../interfaces';
import type { AttendanceDay } from '../../types';

export class SupabaseAttendanceService implements IAttendanceService {
  async getAttendance(_userId?: string, _date?: string): Promise<AttendanceDay[]> {
    throw new Error('Supabase integration not configured.');
  }
  async markDayStatus(_userId: string, _status: 'present' | 'on_leave', _date?: string): Promise<AttendanceDay> {
    throw new Error('Supabase integration not configured.');
  }
  async punchIn(_userId: string): Promise<AttendanceDay> {
    throw new Error('Supabase integration not configured.');
  }
  async punchOut(_userId: string): Promise<AttendanceDay> {
    throw new Error('Supabase integration not configured.');
  }
  async startBreak(_userId: string, _type: 'lunch' | 'tea' | 'personal'): Promise<AttendanceDay> {
    throw new Error('Supabase integration not configured.');
  }
  async endBreak(_userId: string): Promise<AttendanceDay> {
    throw new Error('Supabase integration not configured.');
  }
  async endMyDay(_userId: string): Promise<AttendanceDay> {
    throw new Error('Supabase integration not configured.');
  }
  async resumeMyDay(_userId: string): Promise<AttendanceDay> {
    throw new Error('Supabase integration not configured.');
  }
  async correctPunchOutTime(_attendanceId: string, _correctedTimeISO: string, _reason: string): Promise<AttendanceDay> {
    throw new Error('Supabase integration not configured.');
  }
}

export const supabaseAttendanceService = new SupabaseAttendanceService();
