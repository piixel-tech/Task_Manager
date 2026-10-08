import type { IProjectService } from '../interfaces';
import type { Project } from '../../types';

export class SupabaseProjectService implements IProjectService {
  async getProjects(_company?: string, _userId?: string): Promise<Project[]> {
    throw new Error('Supabase integration not configured.');
  }
  async getProjectById(_id: string): Promise<Project | null> {
    throw new Error('Supabase integration not configured.');
  }
  async createProject(_project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    throw new Error('Supabase integration not configured.');
  }
  async updateProject(_id: string, _updates: Partial<Project>): Promise<Project> {
    throw new Error('Supabase integration not configured.');
  }
  async deleteProject(_id: string): Promise<void> {
    throw new Error('Supabase integration not configured.');
  }
  async closeProject(_id: string): Promise<Project> {
    throw new Error('Supabase integration not configured.');
  }
}

export const supabaseProjectService = new SupabaseProjectService();
