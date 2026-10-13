import type { ITaskService, StartTaskResult } from '../interfaces';
import type { Task, AttachedFile, Submission, User } from '../../types';

export class SupabaseTaskService implements ITaskService {
  async getTasks(_projectId?: string, _userId?: string): Promise<Task[]> {
    throw new Error('Supabase integration not configured.');
  }
  async getTaskById(_id: string): Promise<Task | null> {
    throw new Error('Supabase integration not configured.');
  }
  async createTask(_task: Omit<Task, 'id' | 'createdAt' | 'sessions' | 'submissions'>): Promise<Task> {
    throw new Error('Supabase integration not configured.');
  }
  async updateTask(_id: string, _updates: Partial<Task>): Promise<Task> {
    throw new Error('Supabase integration not configured.');
  }
  async deleteTask(_id: string): Promise<void> {
    throw new Error('Supabase integration not configured.');
  }
  async startTaskSession(_taskId: string, _userId: string, _force?: boolean): Promise<StartTaskResult> {
    throw new Error('Supabase integration not configured.');
  }
  async stopTaskSession(_taskId: string, _userId: string): Promise<Task> {
    throw new Error('Supabase integration not configured.');
  }
  async submitTaskWork(_taskId: string, _userId: string, _notes: string, _files?: AttachedFile[], _fileUrls?: string[]): Promise<Task> {
    throw new Error('Supabase integration not configured.');
  }
  async reviewSubmission(_taskId: string, _submissionId: string, _status: 'approved' | 'needs_changes', _comment?: string, _reviewerId?: string): Promise<Task> {
    throw new Error('Supabase integration not configured.');
  }
  async respondToAssignment(_taskId: string, _action: 'accept' | 'reject', _reason?: string): Promise<Task> {
    throw new Error('Supabase integration not configured.');
  }
  async getSubmissionsFeed(): Promise<{ submission: Submission; task: Task; user?: User }[]> {
    throw new Error('Supabase integration not configured.');
  }
}

export const supabaseTaskService = new SupabaseTaskService();
