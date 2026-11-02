import type { IGamificationService } from '../interfaces';
import type {
  UserGamification,
  Badge,
  BadgeType,
  Kudos,
  TaskPauseReason,
  WeeklyReport
} from '../../types';

export class SupabaseGamificationService implements IGamificationService {
  async getUserGamification(_userId: string): Promise<UserGamification> {
    throw new Error('Supabase integration not configured');
  }
  async addPoints(_userId: string, _points: number): Promise<UserGamification> {
    throw new Error('Supabase integration not configured');
  }
  async awardBadge(_userId: string, _badgeType: BadgeType, _awardedBy?: string, _note?: string): Promise<Badge> {
    throw new Error('Supabase integration not configured');
  }
  async giveKudos(_taskId: string, _fromUserId: string, _toUserId: string): Promise<Kudos> {
    throw new Error('Supabase integration not configured');
  }
  async getKudosForUser(_userId: string): Promise<Kudos[]> {
    throw new Error('Supabase integration not configured');
  }
  async getKudosForTask(_taskId: string): Promise<Kudos[]> {
    throw new Error('Supabase integration not configured');
  }
  async logTaskPauseReason(_taskId: string, _userId: string, _reason: string, _note?: string): Promise<TaskPauseReason> {
    throw new Error('Supabase integration not configured');
  }
  async getTaskPauseReasons(_taskId: string): Promise<TaskPauseReason[]> {
    throw new Error('Supabase integration not configured');
  }
  async getTeamMonthlyGoal(): Promise<{ finished: number; goal: number }> {
    throw new Error('Supabase integration not configured');
  }
  async setTeamMonthlyGoal(_goal: number): Promise<{ finished: number; goal: number }> {
    throw new Error('Supabase integration not configured');
  }
  async generateWeeklyReport(_projectId: string, _startDate: string, _endDate: string): Promise<WeeklyReport> {
    throw new Error('Supabase integration not configured');
  }
}
